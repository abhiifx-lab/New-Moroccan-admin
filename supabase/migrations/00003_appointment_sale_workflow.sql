-- Complete Appointment & Sale Entry workflow.
-- Keeps the immutable event ledger as the financial source of truth while
-- storing operational appointment details in bookings.

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS centre_id uuid NULL REFERENCES public.centres(id);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS treatment_name text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS variant_name text;

UPDATE public.services
SET treatment_name = COALESCE(NULLIF(treatment_name, ''), name),
    variant_name = COALESCE(NULLIF(variant_name, ''), duration::text || ' Minutes')
WHERE treatment_name IS NULL OR treatment_name = '' OR variant_name IS NULL OR variant_name = '';

CREATE INDEX IF NOT EXISTS idx_services_centre_active ON public.services(centre_id, active);
CREATE INDEX IF NOT EXISTS idx_services_treatment ON public.services(treatment_name);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone_normalized text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE public.customers SET phone_normalized = regexp_replace(COALESCE(phone, ''), '\D', '', 'g') WHERE phone_normalized IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_normalized_unique
  ON public.customers(phone_normalized) WHERE phone_normalized IS NOT NULL AND phone_normalized <> '';

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.customers(id);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS customer_email text;
CREATE INDEX IF NOT EXISTS idx_events_customer_id ON public.events(customer_id);
CREATE INDEX IF NOT EXISTS idx_events_customer_phone ON public.events(customer_phone);

ALTER TABLE public.memberships ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.customers(id);
ALTER TABLE public.gift_cards ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.customers(id);

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.customers(id);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS therapist_id uuid NULL REFERENCES public.therapists(id);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS appointment_date date;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS appointment_time time;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS base_price_paise bigint NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS offer_code text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount_paise bigint NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS membership_code text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS membership_redemption_paise bigint NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS gift_card_code text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS gift_card_redemption_paise bigint NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS final_receivable_paise bigint NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS physical_receipt_no text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_centre_receipt_unique
  ON public.bookings(centre_id, lower(physical_receipt_no))
  WHERE physical_receipt_no IS NOT NULL AND trim(physical_receipt_no) <> '';
CREATE INDEX IF NOT EXISTS idx_bookings_appointment ON public.bookings(centre_id, appointment_date, appointment_time);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON public.bookings(customer_id);

CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code text NOT NULL,
  name text NOT NULL,
  centre_id uuid NULL REFERENCES public.centres(id),
  discount_type text NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
  discount_value bigint NOT NULL CHECK (discount_value > 0),
  max_discount_paise bigint NULL,
  min_spend_paise bigint NOT NULL DEFAULT 0,
  valid_from date NULL,
  valid_to date NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_code_centre_unique ON public.offers(lower(code), COALESCE(centre_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_offers_active_dates ON public.offers(active, valid_from, valid_to);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offers_percent_range') THEN
    ALTER TABLE public.offers ADD CONSTRAINT offers_percent_range CHECK (discount_type <> 'PERCENT' OR discount_value <= 100);
  END IF;
END $$;

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Offers Read" ON public.offers;
CREATE POLICY "Offers Read" ON public.offers FOR SELECT USING (public.is_active_user());
DROP POLICY IF EXISTS "Offers Manage" ON public.offers;
CREATE POLICY "Offers Manage" ON public.offers FOR ALL USING (public.is_active_user() AND public.get_auth_role() = 'SUPER_ADMIN');

CREATE OR REPLACE FUNCTION public.create_appointment_sale(
  p_centre_id uuid,
  p_business_date date,
  p_customer_phone text,
  p_customer_name text,
  p_customer_email text,
  p_service_id text,
  p_therapist_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_offer_code text,
  p_membership_code text,
  p_membership_redemption_paise bigint,
  p_gift_card_code text,
  p_gift_card_redemption_paise bigint,
  p_payment_method text,
  p_physical_receipt_no text,
  p_created_by text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');
  v_customer public.customers%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_therapist public.therapists%ROWTYPE;
  v_offer public.offers%ROWTYPE;
  v_membership public.memberships%ROWTYPE;
  v_gift public.gift_cards%ROWTYPE;
  v_event_id uuid := extensions.uuid_generate_v4();
  v_booking_id uuid := extensions.uuid_generate_v4();
  v_discount bigint := 0;
  v_after_discount bigint;
  v_membership_redeem bigint := COALESCE(p_membership_redemption_paise, 0);
  v_gift_redeem bigint := COALESCE(p_gift_card_redemption_paise, 0);
  v_receivable bigint;
  v_event_payment text;
  v_event jsonb;
  v_booking jsonb;
BEGIN
  IF length(v_phone) < 10 OR length(v_phone) > 15 THEN RAISE EXCEPTION 'Enter a valid mobile number'; END IF;
  IF COALESCE(trim(p_customer_name), '') = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_appointment_date IS NULL OR p_appointment_time IS NULL THEN RAISE EXCEPTION 'Appointment date and time are required'; END IF;
  IF p_appointment_date < p_business_date THEN RAISE EXCEPTION 'Appointment cannot be scheduled in the past'; END IF;
  IF p_appointment_date = p_business_date AND p_appointment_time < (now() AT TIME ZONE 'Asia/Kolkata')::time THEN RAISE EXCEPTION 'Appointment time cannot be in the past'; END IF;

  SELECT * INTO v_service FROM public.services
  WHERE id = p_service_id AND active = true AND (centre_id IS NULL OR centre_id = p_centre_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected treatment variant is unavailable for this centre'; END IF;

  SELECT * INTO v_therapist FROM public.therapists
  WHERE id = p_therapist_id AND centre_id = p_centre_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected therapist is unavailable for this centre'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.therapist_id = p_therapist_id AND b.appointment_date = p_appointment_date
      AND b.status = 'CONFIRMED'
      AND b.appointment_time < (p_appointment_time + make_interval(mins => v_service.duration))::time
      AND (b.appointment_time + make_interval(mins => COALESCE(b.duration_minutes, 60)))::time > p_appointment_time
  ) THEN RAISE EXCEPTION 'Therapist already has an overlapping appointment'; END IF;

  SELECT * INTO v_customer FROM public.customers WHERE phone_normalized = v_phone FOR UPDATE;
  IF FOUND THEN
    UPDATE public.customers SET name = trim(p_customer_name), phone = p_customer_phone,
      email = NULLIF(trim(p_customer_email), ''), updated_at = now()
    WHERE id = v_customer.id RETURNING * INTO v_customer;
  ELSE
    INSERT INTO public.customers(id, name, phone, phone_normalized, email, first_seen_centre_id, created_at, updated_at)
    VALUES(extensions.uuid_generate_v4(), trim(p_customer_name), p_customer_phone, v_phone, NULLIF(trim(p_customer_email), ''), p_centre_id, now(), now())
    RETURNING * INTO v_customer;
  END IF;

  IF COALESCE(trim(p_offer_code), '') <> '' THEN
    SELECT * INTO v_offer FROM public.offers
    WHERE lower(code) = lower(trim(p_offer_code)) AND active = true
      AND (centre_id IS NULL OR centre_id = p_centre_id)
      AND (valid_from IS NULL OR valid_from <= p_business_date)
      AND (valid_to IS NULL OR valid_to >= p_business_date)
    ORDER BY centre_id NULLS LAST LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Coupon or offer code is invalid or expired'; END IF;
    IF v_service.price_paise < v_offer.min_spend_paise THEN RAISE EXCEPTION 'Minimum spend requirement is not met for this offer'; END IF;
    IF v_offer.discount_type = 'PERCENT' THEN
      v_discount := floor(v_service.price_paise * v_offer.discount_value / 100.0);
      IF v_offer.max_discount_paise IS NOT NULL THEN v_discount := LEAST(v_discount, v_offer.max_discount_paise); END IF;
    ELSE
      v_discount := v_offer.discount_value;
    END IF;
    v_discount := LEAST(v_discount, v_service.price_paise);
  END IF;

  v_after_discount := v_service.price_paise - v_discount;
  IF v_membership_redeem < 0 OR v_gift_redeem < 0 THEN RAISE EXCEPTION 'Redemption amount cannot be negative'; END IF;

  IF v_membership_redeem > 0 THEN
    SELECT * INTO v_membership FROM public.memberships WHERE code = trim(p_membership_code) FOR UPDATE;
    IF NOT FOUND OR v_membership.reversed OR NOT v_membership.active THEN RAISE EXCEPTION 'Membership is not active'; END IF;
    IF v_membership.remaining_paise < v_membership_redeem THEN RAISE EXCEPTION 'Insufficient membership balance'; END IF;
    IF v_membership_redeem > v_after_discount THEN RAISE EXCEPTION 'Membership redemption exceeds amount due'; END IF;
  END IF;

  IF v_gift_redeem > 0 THEN
    SELECT * INTO v_gift FROM public.gift_cards WHERE code = trim(p_gift_card_code) FOR UPDATE;
    IF NOT FOUND OR v_gift.reversed OR NOT v_gift.active THEN RAISE EXCEPTION 'Gift card is not active'; END IF;
    IF v_gift.remaining_paise < v_gift_redeem THEN RAISE EXCEPTION 'Insufficient gift card balance'; END IF;
    IF v_gift_redeem > v_after_discount - v_membership_redeem THEN RAISE EXCEPTION 'Gift card redemption exceeds amount due'; END IF;
  END IF;

  v_receivable := v_after_discount - v_membership_redeem - v_gift_redeem;
  IF v_receivable > 0 AND p_payment_method NOT IN ('CASH', 'CARD', 'UPI_1', 'UPI_2') THEN RAISE EXCEPTION 'Select a payment method for the final receivable'; END IF;
  v_event_payment := CASE WHEN v_receivable > 0 THEN p_payment_method WHEN v_membership_redeem > 0 THEN 'MEMBERSHIP' ELSE 'GIFT_CARD' END;

  IF COALESCE(trim(p_physical_receipt_no), '') <> '' AND EXISTS (
    SELECT 1 FROM public.bookings WHERE centre_id = p_centre_id AND lower(physical_receipt_no) = lower(trim(p_physical_receipt_no))
  ) THEN RAISE EXCEPTION 'Physical receipt number already exists at this centre'; END IF;

  INSERT INTO public.events(
    id, event_type, type, amount, centre_id, business_date, payment_method, created_by, created_at,
    customer, customer_id, customer_phone, customer_email, therapist, service_id, service_name,
    booking_time, status, redemption_ref, metadata, is_reversal, reverses, notes
  ) VALUES (
    v_event_id, 'BOOKING', 'BOOKING', v_receivable, p_centre_id, p_business_date::text, v_event_payment,
    p_created_by, now(), v_customer.name, v_customer.id, v_phone, v_customer.email, v_therapist.name,
    v_service.id, COALESCE(v_service.treatment_name, v_service.name) || ' • ' || COALESCE(v_service.variant_name, v_service.duration::text || ' Minutes'),
    p_appointment_date::text || 'T' || p_appointment_time::text || '+05:30', 'CONFIRMED',
    COALESCE(NULLIF(trim(p_membership_code), ''), NULLIF(trim(p_gift_card_code), '')),
    jsonb_build_object(
      'base_price_paise', v_service.price_paise, 'discount_paise', v_discount,
      'offer_code', NULLIF(upper(trim(p_offer_code)), ''),
      'membership_code', NULLIF(trim(p_membership_code), ''), 'membership_redemption_paise', v_membership_redeem,
      'gift_card_code', NULLIF(trim(p_gift_card_code), ''), 'gift_card_redemption_paise', v_gift_redeem,
      'final_receivable_paise', v_receivable, 'duration_minutes', v_service.duration,
      'appointment_date', p_appointment_date, 'appointment_time', p_appointment_time,
      'physical_receipt_no', NULLIF(trim(p_physical_receipt_no), '')
    ), false, null, ''
  );

  INSERT INTO public.bookings(
    id, event_id, centre_id, customer, customer_id, customer_phone, customer_email, therapist, therapist_id,
    service_id, service_name, amount_paise, business_date, status, appointment_date, appointment_time,
    duration_minutes, base_price_paise, offer_code, discount_paise, membership_code,
    membership_redemption_paise, gift_card_code, gift_card_redemption_paise, final_receivable_paise,
    physical_receipt_no, created_at, updated_at
  ) VALUES (
    v_booking_id, v_event_id, p_centre_id, v_customer.name, v_customer.id, v_phone, v_customer.email,
    v_therapist.name, v_therapist.id, v_service.id,
    COALESCE(v_service.treatment_name, v_service.name) || ' • ' || COALESCE(v_service.variant_name, v_service.duration::text || ' Minutes'),
    v_receivable, p_business_date::text, 'CONFIRMED', p_appointment_date, p_appointment_time,
    v_service.duration, v_service.price_paise, NULLIF(upper(trim(p_offer_code)), ''), v_discount,
    NULLIF(trim(p_membership_code), ''), v_membership_redeem, NULLIF(trim(p_gift_card_code), ''), v_gift_redeem,
    v_receivable, NULLIF(trim(p_physical_receipt_no), ''), now(), now()
  );

  IF v_membership_redeem > 0 THEN
    UPDATE public.memberships SET customer_id = COALESCE(customer_id, v_customer.id),
      remaining_paise = remaining_paise - v_membership_redeem,
      redemption_count = redemption_count + 1,
      redemptions = COALESCE(redemptions, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('event_id', v_event_id, 'centre_id', p_centre_id, 'amount', v_membership_redeem, 'date', p_business_date))
    WHERE code = v_membership.code;
  END IF;

  IF v_gift_redeem > 0 THEN
    UPDATE public.gift_cards SET customer_id = COALESCE(customer_id, v_customer.id),
      remaining_paise = remaining_paise - v_gift_redeem,
      redemption_count = redemption_count + 1,
      redemptions = COALESCE(redemptions, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('event_id', v_event_id, 'centre_id', p_centre_id, 'amount', v_gift_redeem, 'date', p_business_date))
    WHERE code = v_gift.code;
  END IF;

  INSERT INTO public.audit_logs(id, action, actor, role, centre_id, business_date, target_event_id, new_value, created_at)
  VALUES(extensions.uuid_generate_v4(), 'CREATE_APPOINTMENT_SALE', p_created_by, p_role, p_centre_id, p_business_date::text, v_event_id,
    jsonb_build_object('booking_id', v_booking_id, 'customer_id', v_customer.id, 'base_price', v_service.price_paise,
      'discount', v_discount, 'membership_redemption', v_membership_redeem, 'gift_card_redemption', v_gift_redeem,
      'final_receivable', v_receivable, 'physical_receipt_no', NULLIF(trim(p_physical_receipt_no), '')), now());

  SELECT to_jsonb(e) INTO v_event FROM public.events e WHERE e.id = v_event_id;
  SELECT to_jsonb(b) INTO v_booking FROM public.bookings b WHERE b.id = v_booking_id;
  RETURN jsonb_build_object('ok', true, 'event', v_event, 'booking', v_booking, 'customer', to_jsonb(v_customer));
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment_sale(uuid,date,text,text,text,text,uuid,date,time,text,text,bigint,text,bigint,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_sale(uuid,date,text,text,text,text,uuid,date,time,text,text,bigint,text,bigint,text,text,text,text) TO service_role;

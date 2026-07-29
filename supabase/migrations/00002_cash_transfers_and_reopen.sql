-- 00002_cash_transfers_and_reopen.sql
-- Add counterparty_centre_id and transfer_ref columns to events and cash_movements tables

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS counterparty_centre_id uuid NULL REFERENCES public.centres(id);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS transfer_ref text NULL;

ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS counterparty_centre_id uuid NULL REFERENCES public.centres(id);
ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS transfer_ref text NULL;

CREATE INDEX IF NOT EXISTS idx_events_transfer_ref ON public.events(transfer_ref);
CREATE INDEX IF NOT EXISTS idx_cash_movements_transfer_ref ON public.cash_movements(transfer_ref);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_transfer_ref_centre
  ON public.events(transfer_ref, centre_id)
  WHERE transfer_ref IS NOT NULL AND is_reversal = false;

-- Creates both sides of an inter-centre transfer as one database transaction.
-- This is intentionally the only supported write path for a paired transfer.
CREATE OR REPLACE FUNCTION public.create_intercentre_cash_transfer(
  p_source_centre_id uuid,
  p_destination_centre_id uuid,
  p_business_date date,
  p_amount integer,
  p_created_by text,
  p_notes text,
  p_transfer_ref text,
  p_role text
)
RETURNS TABLE(out_event_id uuid, in_event_id uuid, transfer_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_status text;
  v_destination_status text;
  v_out_event_id uuid := uuid_generate_v4();
  v_in_event_id uuid := uuid_generate_v4();
  v_out_movement_id uuid := uuid_generate_v4();
  v_in_movement_id uuid := uuid_generate_v4();
BEGIN
  IF p_source_centre_id IS NULL OR p_destination_centre_id IS NULL OR p_source_centre_id = p_destination_centre_id THEN
    RAISE EXCEPTION 'Transfer source and destination centres must be different';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive';
  END IF;
  IF COALESCE(trim(p_transfer_ref), '') = '' THEN
    RAISE EXCEPTION 'Transfer reference is required';
  END IF;

  SELECT status INTO v_source_status
  FROM public.business_days
  WHERE centre_id = p_source_centre_id AND business_date = p_business_date
  FOR UPDATE;
  IF v_source_status IS NULL THEN RAISE EXCEPTION 'Source business day not found'; END IF;
  IF v_source_status = 'CLOSED' THEN RAISE EXCEPTION 'Source business day is closed. Authorized reopen required.'; END IF;

  SELECT status INTO v_destination_status
  FROM public.business_days
  WHERE centre_id = p_destination_centre_id AND business_date = p_business_date
  FOR UPDATE;
  IF v_destination_status IS NULL THEN RAISE EXCEPTION 'Destination business day not found'; END IF;
  IF v_destination_status = 'CLOSED' THEN RAISE EXCEPTION 'Destination counterparty business day is closed. Authorized reopen required.'; END IF;

  INSERT INTO public.events (
    id, event_type, type, amount, centre_id, business_date, payment_method,
    created_by, created_at, is_reversal, reverses, movement_type, notes,
    counterparty_centre_id, transfer_ref, metadata
  ) VALUES
  (
    v_out_event_id, 'CASH_MOVEMENT', 'CASH_MOVEMENT', p_amount, p_source_centre_id, p_business_date, 'CASH',
    COALESCE(p_created_by, 'system'), now(), false, null, 'CASH_TRANSFER_OUT',
    CASE WHEN COALESCE(p_notes, '') = '' THEN 'Inter-centre cash transfer out' ELSE 'Transfer: ' || p_notes END,
    p_destination_centre_id, p_transfer_ref,
    jsonb_build_object('counterparty_centre_id', p_destination_centre_id, 'transfer_ref', p_transfer_ref)
  ),
  (
    v_in_event_id, 'CASH_MOVEMENT', 'CASH_MOVEMENT', p_amount, p_destination_centre_id, p_business_date, 'CASH',
    COALESCE(p_created_by, 'system'), now(), false, null, 'CASH_TRANSFER_IN',
    CASE WHEN COALESCE(p_notes, '') = '' THEN 'Inter-centre cash transfer in' ELSE 'Transfer: ' || p_notes END,
    p_source_centre_id, p_transfer_ref,
    jsonb_build_object('counterparty_centre_id', p_source_centre_id, 'transfer_ref', p_transfer_ref)
  );

  INSERT INTO public.cash_movements (
    id, event_id, centre_id, movement_type, amount_paise, business_date, notes,
    counterparty_centre_id, transfer_ref
  ) VALUES
  (
    v_out_movement_id, v_out_event_id, p_source_centre_id, 'CASH_TRANSFER_OUT', p_amount, p_business_date,
    CASE WHEN COALESCE(p_notes, '') = '' THEN 'Inter-centre cash transfer out' ELSE 'Transfer: ' || p_notes END,
    p_destination_centre_id, p_transfer_ref
  ),
  (
    v_in_movement_id, v_in_event_id, p_destination_centre_id, 'CASH_TRANSFER_IN', p_amount, p_business_date,
    CASE WHEN COALESCE(p_notes, '') = '' THEN 'Inter-centre cash transfer in' ELSE 'Transfer: ' || p_notes END,
    p_source_centre_id, p_transfer_ref
  );

  INSERT INTO public.audit_logs (id, action, actor, role, centre_id, business_date, target_event_id, new_value, created_at)
  VALUES (
    uuid_generate_v4(), 'CASH_TRANSFER', COALESCE(p_created_by, 'system'), p_role, p_source_centre_id, p_business_date,
    v_out_event_id,
    jsonb_build_object('transfer_ref', p_transfer_ref, 'source_centre_id', p_source_centre_id, 'destination_centre_id', p_destination_centre_id, 'amount', p_amount),
    now()
  );

  RETURN QUERY SELECT v_out_event_id, v_in_event_id, p_transfer_ref;
END;
$$;

-- The API calls this function using the server-only Supabase service role.
-- Do not allow browser clients to invoke a SECURITY DEFINER function directly.
REVOKE ALL ON FUNCTION public.create_intercentre_cash_transfer(
  uuid, uuid, date, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_intercentre_cash_transfer(
  uuid, uuid, date, integer, text, text, text, text
) TO service_role;

-- 00001_initial_schema_and_rls.sql
-- Autonomous Migration: MongoDB to Supabase PostgreSQL
-- Enforcing Single Source of Truth, Immutability, and Database-Level RBAC / Centre Isolation

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CENTRES TABLE
CREATE TABLE IF NOT EXISTS public.centres (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  city text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Seed exactly the three approved centres
INSERT INTO public.centres (id, name, code, city, active)
VALUES 
  ('b7b09f2b-4b4d-4ce7-8289-08947347af9b', 'Phoenix Pallassio', 'PHNX', 'Lucknow', true),
  ('d15176b8-418e-4c76-a9eb-a2d2947ba5d9', 'Holiday Inn', 'HINN', 'Lucknow', true),
  ('dc39e202-1bac-4411-9988-2bcaa72728d6', 'Lulu Mall', 'LULU', 'Lucknow', true)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  city = EXCLUDED.city,
  active = EXCLUDED.active;

-- 2. PROFILES TABLE (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('SUPER_ADMIN', 'CENTRE_USER')),
  centre_id uuid NULL REFERENCES public.centres(id),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT check_centre_user_assignment CHECK (
    (role = 'SUPER_ADMIN') OR (role = 'CENTRE_USER' AND centre_id IS NOT NULL)
  )
);

-- Helper SQL Functions for RLS
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_auth_centre_id()
RETURNS uuid AS $$
  SELECT centre_id FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean AS $$
  SELECT COALESCE((SELECT active FROM public.profiles WHERE id = auth.uid() LIMIT 1), false);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 3. EVENTS TABLE (Immutable Financial Events - Single Source of Truth)
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type text NOT NULL CHECK (event_type IN ('BOOKING', 'MEMBERSHIP_SALE', 'GIFT_CARD_SALE', 'EXPENSE', 'CASH_MOVEMENT')),
  type text NOT NULL CHECK (type IN ('BOOKING', 'MEMBERSHIP_SALE', 'GIFT_CARD_SALE', 'EXPENSE', 'CASH_MOVEMENT')),
  amount bigint NOT NULL DEFAULT 0, -- in Paise
  centre_id uuid NOT NULL REFERENCES public.centres(id),
  business_date text NOT NULL, -- YYYY-MM-DD in Asia/Kolkata
  payment_method text NOT NULL CHECK (payment_method IN ('CASH', 'UPI_1', 'UPI_2', 'CARD', 'MIXED', 'MEMBERSHIP', 'GIFT_CARD')),
  payment_breakdown jsonb NULL,
  metadata jsonb NULL,
  created_by text DEFAULT 'system',
  created_at timestamptz DEFAULT now(),
  is_reversal boolean NOT NULL DEFAULT false,
  reverses uuid NULL REFERENCES public.events(id),
  
  -- Domain operational fields (preserving full MongoDB data capability without mutating core truth)
  customer text,
  therapist text,
  service_id text,
  service_name text,
  booking_time text,
  status text DEFAULT 'COMPLETED',
  redemption_ref text,
  membership_code text,
  gift_card_code text,
  category text,
  movement_type text,
  notes text
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_centre_date ON public.events(centre_id, business_date);
CREATE INDEX IF NOT EXISTS idx_events_business_date ON public.events(business_date);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_legacy_type ON public.events(type);
CREATE INDEX IF NOT EXISTS idx_events_payment_method ON public.events(payment_method);
CREATE INDEX IF NOT EXISTS idx_events_reverses ON public.events(reverses);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events(created_at DESC);

-- DATABASE PROTECTION: Immutable financial event triggers
CREATE OR REPLACE FUNCTION public.reject_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CRITICAL VIOLATION: Financial events are strictly immutable. Updates and deletions are strictly forbidden. Use an explicit reversal event instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_event_update_delete ON public.events;
CREATE TRIGGER trg_prevent_event_update_delete
  BEFORE UPDATE OR DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_event_mutation();

-- 4. BUSINESS DAYS TABLE
CREATE TABLE IF NOT EXISTS public.business_days (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  centre_id uuid NOT NULL REFERENCES public.centres(id),
  date text NOT NULL, -- YYYY-MM-DD
  business_date text NOT NULL, -- YYYY-MM-DD aligned with date
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  opening_cash bigint DEFAULT 0,
  expected_closing_cash bigint DEFAULT 0,
  closing_cash_expected bigint DEFAULT 0,
  actual_closing_cash bigint NULL,
  closing_cash_declared bigint NULL,
  shortage_or_excess bigint DEFAULT 0,
  variance bigint DEFAULT 0,
  closing_notes text,
  closed_by text NULL,
  closed_at timestamptz NULL,
  opened_at timestamptz DEFAULT now(),
  reopen_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_business_days_centre_date UNIQUE (centre_id, date)
);

CREATE INDEX IF NOT EXISTS idx_business_days_centre_date ON public.business_days(centre_id, business_date);

-- 5. SERVICES TABLE
CREATE TABLE IF NOT EXISTS public.services (
  id text PRIMARY KEY,
  name text NOT NULL,
  duration integer DEFAULT 60,
  price_paise bigint DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 6. MEMBERSHIPS TABLE
CREATE TABLE IF NOT EXISTS public.memberships (
  code text PRIMARY KEY,
  buyer text NOT NULL,
  recipient text,
  original_paise bigint NOT NULL DEFAULT 0,
  remaining_paise bigint NOT NULL DEFAULT 0,
  price_paise bigint NOT NULL DEFAULT 0,
  sold_at_centre_id uuid NOT NULL REFERENCES public.centres(id),
  sold_at_date text NOT NULL,
  payment_method text NOT NULL,
  active boolean DEFAULT true,
  reversed boolean DEFAULT false,
  source_event_id uuid NULL REFERENCES public.events(id),
  redemption_count integer DEFAULT 0,
  redemptions jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memberships_centre ON public.memberships(sold_at_centre_id);
CREATE INDEX IF NOT EXISTS idx_memberships_code ON public.memberships(code);

-- 7. GIFT CARDS TABLE
CREATE TABLE IF NOT EXISTS public.gift_cards (
  code text PRIMARY KEY,
  buyer text NOT NULL,
  recipient text,
  original_paise bigint NOT NULL DEFAULT 0,
  remaining_paise bigint NOT NULL DEFAULT 0,
  price_paise bigint NOT NULL DEFAULT 0,
  sold_at_centre_id uuid NOT NULL REFERENCES public.centres(id),
  sold_at_date text NOT NULL,
  payment_method text NOT NULL,
  active boolean DEFAULT true,
  reversed boolean DEFAULT false,
  source_event_id uuid NULL REFERENCES public.events(id),
  redemption_count integer DEFAULT 0,
  redemptions jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_centre ON public.gift_cards(sold_at_centre_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON public.gift_cards(code);

-- 8. OPERATIONAL DOMAIN TABLES (Bookings, Expenses, Cash Movements, Customers, Therapists)
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid NOT NULL REFERENCES public.events(id),
  centre_id uuid NOT NULL REFERENCES public.centres(id),
  customer text NOT NULL,
  therapist text,
  service_id text,
  service_name text,
  amount_paise bigint DEFAULT 0,
  business_date text NOT NULL,
  status text DEFAULT 'COMPLETED',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid NOT NULL REFERENCES public.events(id),
  centre_id uuid NOT NULL REFERENCES public.centres(id),
  category text,
  amount_paise bigint DEFAULT 0,
  payment_method text,
  business_date text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid NOT NULL REFERENCES public.events(id),
  centre_id uuid NOT NULL REFERENCES public.centres(id),
  movement_type text NOT NULL,
  amount_paise bigint DEFAULT 0,
  business_date text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  phone text,
  email text,
  first_seen_centre_id uuid REFERENCES public.centres(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.therapists (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  centre_id uuid REFERENCES public.centres(id),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 9. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action text NOT NULL,
  actor text NOT NULL,
  role text,
  centre_id uuid NULL REFERENCES public.centres(id),
  business_date text,
  target_event_id uuid NULL,
  new_value jsonb NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_event ON public.audit_logs(target_event_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_centre ON public.audit_logs(centre_id);

-- 10. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Centres: Everyone active can read approved centres. Only SUPER_ADMIN can modify.
DROP POLICY IF EXISTS "Active users read centres" ON public.centres;
CREATE POLICY "Active users read centres" ON public.centres FOR SELECT USING (public.is_active_user());

-- Profiles: Users can view their own profile; SUPER_ADMIN can view all profiles and manage users.
DROP POLICY IF EXISTS "Users read own profile or super admin read all" ON public.profiles;
CREATE POLICY "Users read own profile or super admin read all" ON public.profiles FOR SELECT USING (
  id = auth.uid() OR (public.is_active_user() AND public.get_auth_role() = 'SUPER_ADMIN')
);
DROP POLICY IF EXISTS "Super Admin manage profiles" ON public.profiles;
CREATE POLICY "Super Admin manage profiles" ON public.profiles FOR ALL USING (
  public.is_active_user() AND public.get_auth_role() = 'SUPER_ADMIN'
);

-- Events: SUPER_ADMIN reads/creates all; CENTRE_USER reads/creates ONLY for assigned centre.
DROP POLICY IF EXISTS "Events Read Scope" ON public.events;
CREATE POLICY "Events Read Scope" ON public.events FOR SELECT USING (
  public.is_active_user() AND (
    public.get_auth_role() = 'SUPER_ADMIN' OR 
    (public.get_auth_role() = 'CENTRE_USER' AND centre_id = public.get_auth_centre_id())
  )
);
DROP POLICY IF EXISTS "Events Insert Scope" ON public.events;
CREATE POLICY "Events Insert Scope" ON public.events FOR INSERT WITH CHECK (
  public.is_active_user() AND (
    public.get_auth_role() = 'SUPER_ADMIN' OR 
    (public.get_auth_role() = 'CENTRE_USER' AND centre_id = public.get_auth_centre_id())
  )
);

-- Business Days: Same centre scoping as events
DROP POLICY IF EXISTS "Business Days Scope" ON public.business_days;
CREATE POLICY "Business Days Scope" ON public.business_days FOR ALL USING (
  public.is_active_user() AND (
    public.get_auth_role() = 'SUPER_ADMIN' OR 
    (public.get_auth_role() = 'CENTRE_USER' AND centre_id = public.get_auth_centre_id())
  )
);

-- Services: Active users can read services. Super Admin can manage.
DROP POLICY IF EXISTS "Services Read" ON public.services;
CREATE POLICY "Services Read" ON public.services FOR SELECT USING (public.is_active_user());
DROP POLICY IF EXISTS "Services Manage" ON public.services;
CREATE POLICY "Services Manage" ON public.services FOR ALL USING (public.is_active_user() AND public.get_auth_role() = 'SUPER_ADMIN');

-- Memberships & Gift Cards: Centre scope read/write, Super Admin access all.
DROP POLICY IF EXISTS "Memberships Scope" ON public.memberships;
CREATE POLICY "Memberships Scope" ON public.memberships FOR ALL USING (
  public.is_active_user() AND (
    public.get_auth_role() = 'SUPER_ADMIN' OR 
    (public.get_auth_role() = 'CENTRE_USER' AND sold_at_centre_id = public.get_auth_centre_id())
  )
);

DROP POLICY IF EXISTS "Gift Cards Scope" ON public.gift_cards;
CREATE POLICY "Gift Cards Scope" ON public.gift_cards FOR ALL USING (
  public.is_active_user() AND (
    public.get_auth_role() = 'SUPER_ADMIN' OR 
    (public.get_auth_role() = 'CENTRE_USER' AND sold_at_centre_id = public.get_auth_centre_id())
  )
);

-- Audit Logs: Super Admin reads all; Centre Users read only their centre's audit logs; both can insert for their centre.
DROP POLICY IF EXISTS "Audit Logs Scope" ON public.audit_logs;
CREATE POLICY "Audit Logs Scope" ON public.audit_logs FOR ALL USING (
  public.is_active_user() AND (
    public.get_auth_role() = 'SUPER_ADMIN' OR 
    (public.get_auth_role() = 'CENTRE_USER' AND centre_id = public.get_auth_centre_id())
  )
);

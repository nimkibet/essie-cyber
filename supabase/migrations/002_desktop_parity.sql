-- ====================================================================
-- ESSIE CYBER SYSTEM: PHASE 2 SCHEMA UPGRADE (DESKTOP MATH PARITY)
-- ====================================================================

-- 1. RESOURCES (For Kyocera / Amortized Items)
CREATE TABLE IF NOT EXISTS public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    units INTEGER NOT NULL DEFAULT 1,
    cost NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'archived')),
    opened_by UUID REFERENCES public.users(id),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. ATTENDANCE LOG (For Shift Wages)
CREATE TABLE IF NOT EXISTS public.attendance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) NOT NULL,
    work_date DATE NOT NULL,
    wage_assigned NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, work_date)
);

-- 3. OVERHEAD ENTRIES (Rent, Electricity, Wi-Fi)
CREATE TABLE IF NOT EXISTS public.overhead_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period TEXT NOT NULL UNIQUE, -- e.g. '2026-09'
    rent NUMERIC DEFAULT 0,
    electricity NUMERIC DEFAULT 0,
    wifi_internet NUMERIC DEFAULT 0,
    other_fixed NUMERIC DEFAULT 0,
    entered_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. MONTHLY CLOSES (Financial Consolidation)
CREATE TABLE IF NOT EXISTS public.monthly_closes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period TEXT NOT NULL UNIQUE, -- e.g. '2026-09'
    gross_revenue NUMERIC DEFAULT 0,
    cogs_resources NUMERIC DEFAULT 0,
    cogs_kyocera NUMERIC DEFAULT 0,
    total_overheads NUMERIC DEFAULT 0,
    total_maintenance NUMERIC DEFAULT 0,
    total_wages NUMERIC DEFAULT 0,
    net_profit NUMERIC DEFAULT 0,
    closed_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. UPGRADE SALES LOG (Voided Sales & Payment Methods)
ALTER TABLE public.sales_log ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'M-Pesa'));
ALTER TABLE public.sales_log ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT FALSE;
ALTER TABLE public.sales_log ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.sales_log ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.users(id);
ALTER TABLE public.sales_log ADD COLUMN IF NOT EXISTS kyocera_pages INTEGER DEFAULT 0; -- Tracking A3/Kyocera deductions

-- 6. UPGRADE INVENTORY (Service types for Quick Add)
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT FALSE;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS is_kyocera BOOLEAN DEFAULT FALSE;

-- Ensure RLS is active and allows anon (since we use the web client directly)
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overhead_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon all on resources" ON public.resources FOR ALL USING (true);
CREATE POLICY "Allow anon all on attendance_log" ON public.attendance_log FOR ALL USING (true);
CREATE POLICY "Allow anon all on overhead_entries" ON public.overhead_entries FOR ALL USING (true);
CREATE POLICY "Allow anon all on monthly_closes" ON public.monthly_closes FOR ALL USING (true);

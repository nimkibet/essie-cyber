-- ====================================================================
-- ESSIE CYBER SYSTEM: ADD QUANTITY COLUMN AND SYNC TRIGGER
-- ====================================================================
-- Adds quantity column to public.sales_log to guarantee backward
-- compatibility with any client payload providing quantity instead
-- of calculated_qty. Synchronizes both fields automatically.

ALTER TABLE public.sales_log
ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 2) DEFAULT 1.00;

UPDATE public.sales_log
SET quantity = calculated_qty
WHERE quantity IS NULL;

CREATE OR REPLACE FUNCTION public.sync_sales_log_quantity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.calculated_qty IS NULL AND NEW.quantity IS NOT NULL THEN
        NEW.calculated_qty := NEW.quantity;
    ELSIF NEW.quantity IS NULL AND NEW.calculated_qty IS NOT NULL THEN
        NEW.quantity := NEW.calculated_qty;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_sales_log_quantity ON public.sales_log;
CREATE TRIGGER trg_sync_sales_log_quantity
BEFORE INSERT OR UPDATE ON public.sales_log
FOR EACH ROW
EXECUTE FUNCTION public.sync_sales_log_quantity();

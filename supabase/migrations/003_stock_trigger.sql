-- ====================================================================
-- ESSIE CYBER SYSTEM: INVENTORY STOCK SYNC TRIGGER
-- ====================================================================
-- This migration ensures that stock is ALWAYS accurately decremented 
-- when a sale is inserted, and restored when a sale is voided.
-- It acts as a bulletproof database-level fallback to frontend logic.

-- 1. Create the function
CREATE OR REPLACE FUNCTION public.sync_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- ON INSERT (New Sale)
    IF TG_OP = 'INSERT' THEN
        IF NEW.item_id IS NOT NULL THEN
            UPDATE public.inventory
            SET stock_quantity = stock_quantity - NEW.calculated_qty
            WHERE id = NEW.item_id 
              AND type = 'fixed' 
              AND is_service = false;
        END IF;
        RETURN NEW;
    END IF;

    -- ON UPDATE (Voiding a Sale)
    IF TG_OP = 'UPDATE' THEN
        -- If sale is transitioning from NOT voided to VOIDED
        IF OLD.is_voided = FALSE AND NEW.is_voided = TRUE THEN
            IF NEW.item_id IS NOT NULL THEN
                UPDATE public.inventory
                SET stock_quantity = stock_quantity + NEW.calculated_qty
                WHERE id = NEW.item_id 
                  AND type = 'fixed' 
                  AND is_service = false;
            END IF;
        END IF;

        -- If sale is transitioning from VOIDED to NOT voided (Un-voiding)
        IF OLD.is_voided = TRUE AND NEW.is_voided = FALSE THEN
            IF NEW.item_id IS NOT NULL THEN
                UPDATE public.inventory
                SET stock_quantity = stock_quantity - NEW.calculated_qty
                WHERE id = NEW.item_id 
                  AND type = 'fixed' 
                  AND is_service = false;
            END IF;
        END IF;
        
        RETURN NEW;
    END IF;

    -- ON DELETE (Removing a sale entirely)
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_voided = FALSE AND OLD.item_id IS NOT NULL THEN
            UPDATE public.inventory
            SET stock_quantity = stock_quantity + OLD.calculated_qty
            WHERE id = OLD.item_id 
              AND type = 'fixed' 
              AND is_service = false;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach the trigger
DROP TRIGGER IF EXISTS trg_sync_inventory_stock ON public.sales_log;
CREATE TRIGGER trg_sync_inventory_stock
AFTER INSERT OR UPDATE OR DELETE ON public.sales_log
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_stock();

-- ====================================================================
-- ESSIE CYBER SYSTEM: PHASE 3 PACKAGING TIERS & AUTO-UNPACKING
-- ====================================================================

-- 1. Alter Inventory Table
ALTER TABLE public.inventory 
    ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES public.inventory(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS units_per_parent INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS tier_level INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS barcode VARCHAR(255) NULL;

-- 2. Open Resources Schema Adjustments
ALTER TABLE public.resources
    ADD COLUMN IF NOT EXISTS linked_inventory_id INTEGER REFERENCES public.inventory(id),
    ADD COLUMN IF NOT EXISTS consumed_units INTEGER DEFAULT 0;

-- 3. The Atomic Waterfall Function
CREATE OR REPLACE FUNCTION public.deduct_inventory_waterfall(target_item_id INTEGER, deduct_qty INTEGER, visited INTEGER[] DEFAULT '{}')
RETURNS BOOLEAN AS $$
DECLARE
    v_stock INTEGER;
    v_parent_id INTEGER;
    v_units_per_parent INTEGER;
    v_parents_needed INTEGER;
BEGIN
    -- Prevent Cyclic References
    IF target_item_id = ANY(visited) THEN
        RAISE EXCEPTION 'Cyclic parent reference detected for inventory item %', target_item_id;
    END IF;

    -- Lock the row to prevent race conditions
    SELECT stock_quantity, parent_id, units_per_parent 
    INTO v_stock, v_parent_id, v_units_per_parent
    FROM public.inventory 
    WHERE id = target_item_id 
    FOR UPDATE;

    -- Base Case 1: Sufficient stock
    IF v_stock >= deduct_qty THEN
        UPDATE public.inventory SET stock_quantity = stock_quantity - deduct_qty WHERE id = target_item_id;
        RETURN TRUE;
    END IF;

    -- Base Case 2: Insufficient stock, recursive unpack
    IF v_stock < deduct_qty AND v_parent_id IS NOT NULL AND v_units_per_parent > 0 THEN
        v_parents_needed := CEIL((deduct_qty - v_stock)::NUMERIC / v_units_per_parent);
        
        -- Recurse up the chain
        IF public.deduct_inventory_waterfall(v_parent_id, v_parents_needed, visited || target_item_id) THEN
            -- Credit the unpacked units to this item and then deduct the required amount
            UPDATE public.inventory 
            SET stock_quantity = stock_quantity + (v_parents_needed * v_units_per_parent) - deduct_qty
            WHERE id = target_item_id;
            RETURN TRUE;
        END IF;
    END IF;

    -- Failure: Not enough stock and no parent to unpack from
    RAISE EXCEPTION 'Insufficient stock for item % and auto-unpack failed', target_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Open Resources Hook (Direct RPC)
CREATE OR REPLACE FUNCTION public.consume_resource_inventory(p_inventory_id INTEGER, p_qty INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.deduct_inventory_waterfall(p_inventory_id, p_qty);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update Stock Trigger to use Waterfall
CREATE OR REPLACE FUNCTION public.sync_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- ON INSERT (New Sale)
    IF TG_OP = 'INSERT' THEN
        IF NEW.item_id IS NOT NULL THEN
            -- Check if it's a fixed product and not a service
            IF EXISTS (SELECT 1 FROM public.inventory WHERE id = NEW.item_id AND type = 'fixed' AND is_service = false) THEN
                PERFORM public.deduct_inventory_waterfall(NEW.item_id::INTEGER, NEW.calculated_qty::INTEGER);
            END IF;
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
                IF EXISTS (SELECT 1 FROM public.inventory WHERE id = NEW.item_id AND type = 'fixed' AND is_service = false) THEN
                    PERFORM public.deduct_inventory_waterfall(NEW.item_id::INTEGER, NEW.calculated_qty::INTEGER);
                END IF;
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

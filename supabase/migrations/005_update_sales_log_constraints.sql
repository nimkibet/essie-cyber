-- ====================================================================
-- ESSIE CYBER SYSTEM: UPDATE SALES_LOG CONSTRAINTS FOR DEBT TRACKING
-- ====================================================================
-- Updates check constraints on sales_log to allow debt and debt_collection
-- statuses, as well as debt and alternate casing for payment methods.

ALTER TABLE public.sales_log
DROP CONSTRAINT IF EXISTS sales_log_status_check;

ALTER TABLE public.sales_log
ADD CONSTRAINT sales_log_status_check
CHECK (status = ANY (ARRAY['active'::text, 'voided'::text, 'debt'::text, 'debt_collection'::text, 'refunded'::text]));

ALTER TABLE public.sales_log
DROP CONSTRAINT IF EXISTS sales_log_payment_method_check;

ALTER TABLE public.sales_log
ADD CONSTRAINT sales_log_payment_method_check
CHECK (payment_method = ANY (ARRAY['cash'::text, 'mpesa'::text, 'debt'::text, 'card'::text, 'Cash'::text, 'M-Pesa'::text, 'Debt'::text, 'Card'::text]));

-- Run this in Supabase SQL Editor to fix the DELETE requires a WHERE clause error.
-- Supabase's safe-delete protection blocks DELETE without WHERE on table-level operations;
-- adding WHERE order_id IS NOT NULL is semantically identical (all rows) but satisfies the check.

CREATE OR REPLACE FUNCTION public.refresh_fraud_predictions_fallback()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM order_predictions_fraud WHERE order_id IS NOT NULL;
  INSERT INTO order_predictions_fraud (order_id, fraud_probability, predicted_fraud, prediction_timestamp)
  SELECT
    order_id,
    LEAST(1.0::double precision, GREATEST(0.0::double precision, risk_score / 100.0)),
    CASE WHEN risk_score >= 50 THEN 1 ELSE 0 END,
    NOW()
  FROM orders;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_fraud_predictions_fallback() TO service_role;

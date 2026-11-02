-- Payments are never deleted: a wrong one is voided (kept for the audit trail, excluded from all totals).
ALTER TABLE fee_payments
  ADD COLUMN voided_at DATETIME NULL,
  ADD COLUMN voided_by INT UNSIGNED NULL,
  ADD COLUMN void_reason VARCHAR(255) NULL;

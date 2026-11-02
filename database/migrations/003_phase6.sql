-- Phase 6: forced password change for admin-issued passwords, email opt-out, and one-time notice notifications.
ALTER TABLE users
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN email_notifications TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE notices ADD COLUMN notified_at DATETIME NULL;
-- Notices that already exist were seen by everyone; don't announce them again after this upgrade.
UPDATE notices SET notified_at = NOW();

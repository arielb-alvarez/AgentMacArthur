-- ============================================================
-- MIGRATION 008: TRACK INVITATION DELIVERY ATTEMPTS
-- ============================================================
-- Identifies active email delivery attempts so concurrent
-- resends cannot overwrite one another's delivery state.
--
-- Migrations 001-007 remain immutable.
-- ============================================================

ALTER TABLE invitations
ADD COLUMN email_delivery_attempt_id UUID,
ADD COLUMN email_delivery_started_at TIMESTAMPTZ;

-- An active attempt must have both an identifier and a
-- start timestamp. Only pending invitations can have one.
ALTER TABLE invitations
ADD CONSTRAINT invitations_delivery_attempt_state_check
CHECK (
    (
        email_delivery_attempt_id IS NULL
        AND email_delivery_started_at IS NULL
    )
    OR
    (
        email_delivery_attempt_id IS NOT NULL
        AND email_delivery_started_at IS NOT NULL
        AND status = 'pending'
    )
);

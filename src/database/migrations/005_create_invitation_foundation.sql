-- ============================================================
-- MIGRATION 005: INVITATION FOUNDATION
-- ============================================================
-- Introduces canonical role references for invitations,
-- expiration handling, delivery tracking, and stronger
-- invitation integrity constraints.
--
-- Migration 003 and 004 remain immutable.
-- ============================================================


-- ============================================================
-- 1. ADD CANONICAL ROLE REFERENCE
-- ============================================================

ALTER TABLE invitations
ADD COLUMN role_id UUID;


-- Backfill organization invitations.
UPDATE invitations i
SET role_id = r.id
FROM roles r
WHERE i.project_id IS NULL
  AND r.scope = 'organization'
  AND r.key = i.role
  AND r.is_system = TRUE
  AND r.organization_id IS NULL;


-- Backfill project invitations.
UPDATE invitations i
SET role_id = r.id
FROM roles r
WHERE i.project_id IS NOT NULL
  AND r.scope = 'project'
  AND r.key = i.role
  AND r.is_system = TRUE
  AND r.organization_id IS NULL;


-- Fail safely if any legacy role could not be mapped.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM invitations
        WHERE role_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Migration 005 failed: one or more invitation roles could not be mapped to the role registry.';
    END IF;
END;
$$;


ALTER TABLE invitations
ALTER COLUMN role_id SET NOT NULL;


ALTER TABLE invitations
ADD CONSTRAINT invitations_role_fk
FOREIGN KEY (role_id)
REFERENCES roles(id)
ON DELETE RESTRICT;


-- Remove the legacy string-based role constraint and column.
ALTER TABLE invitations
DROP CONSTRAINT invitations_role_scope_check;

ALTER TABLE invitations
DROP COLUMN role;


-- ============================================================
-- 2. INVITATION ROLE SCOPE VALIDATION
-- ============================================================

CREATE FUNCTION validate_invitation_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    selected_scope VARCHAR(20);
    selected_organization_id UUID;
    selected_role_key VARCHAR(80);
BEGIN
    SELECT scope, organization_id, key
    INTO selected_scope, selected_organization_id, selected_role_key
    FROM roles
    WHERE id = NEW.role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation role does not exist.';
    END IF;

    IF NEW.project_id IS NULL THEN
        IF selected_scope <> 'organization' THEN
            RAISE EXCEPTION
                'Project-scoped roles cannot be used for organization invitations.';
        END IF;

        IF selected_role_key = 'owner' THEN
            RAISE EXCEPTION
                'Organization ownership cannot be granted through an invitation.';
        END IF;
    ELSE
        IF selected_scope <> 'project' THEN
            RAISE EXCEPTION
                'Organization-scoped roles cannot be used for project invitations.';
        END IF;
    END IF;

    IF selected_organization_id IS NOT NULL
       AND selected_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'Custom role cannot be used outside its owning organization.';
    END IF;

    RETURN NEW;
END;
$$;


CREATE TRIGGER trg_validate_invitation_role
BEFORE INSERT OR UPDATE OF organization_id, project_id, role_id
ON invitations
FOR EACH ROW
EXECUTE FUNCTION validate_invitation_role();


-- ============================================================
-- 3. EXPLICIT EXPIRATION STATUS
-- ============================================================

ALTER TABLE invitations
DROP CONSTRAINT invitations_status_check;

-- Pending invitations that have already expired should no
-- longer occupy the pending-invitation uniqueness indexes.
UPDATE invitations
SET status = 'expired'
WHERE status = 'pending'
  AND expires_at <= NOW();

ALTER TABLE invitations
ADD CONSTRAINT invitations_status_check
CHECK (
    status IN ('pending', 'accepted', 'revoked', 'expired')
);


-- ============================================================
-- 4. STRENGTHEN ACCEPTANCE CONSISTENCY
-- ============================================================

ALTER TABLE invitations
DROP CONSTRAINT invitations_acceptance_check;

ALTER TABLE invitations
ADD CONSTRAINT invitations_acceptance_check
CHECK (
    (
        status = 'accepted'
        AND accepted_by IS NOT NULL
        AND accepted_at IS NOT NULL
    )
    OR
    (
        status <> 'accepted'
        AND accepted_by IS NULL
        AND accepted_at IS NULL
    )
);


-- ============================================================
-- 5. EMAIL DELIVERY TRACKING
-- ============================================================

ALTER TABLE invitations
ADD COLUMN email_delivery_status VARCHAR(20),
ADD COLUMN email_delivery_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN email_last_attempt_at TIMESTAMPTZ,
ADD COLUMN email_sent_at TIMESTAMPTZ;

-- Existing invitations have no reliable delivery history.
UPDATE invitations
SET email_delivery_status = 'unknown';

ALTER TABLE invitations
ALTER COLUMN email_delivery_status SET DEFAULT 'pending';

ALTER TABLE invitations
ALTER COLUMN email_delivery_status SET NOT NULL;

ALTER TABLE invitations
ADD CONSTRAINT invitations_email_delivery_status_check
CHECK (
    email_delivery_status IN ('pending', 'sent', 'failed', 'unknown')
);

ALTER TABLE invitations
ADD CONSTRAINT invitations_email_delivery_attempts_check
CHECK (email_delivery_attempts >= 0);

ALTER TABLE invitations
ADD CONSTRAINT invitations_email_sent_at_check
CHECK (
    (
        email_delivery_status = 'sent'
        AND email_sent_at IS NOT NULL
    )
    OR
    (
        email_delivery_status <> 'sent'
        AND email_sent_at IS NULL
    )
);


-- ============================================================
-- 6. SUPPORTING INDEXES
-- ============================================================

CREATE INDEX idx_invitations_role_id
    ON invitations(role_id);

CREATE INDEX idx_invitations_delivery_status
    ON invitations(
        organization_id,
        email_delivery_status
    );

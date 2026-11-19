-- Expire invitations whose validity period has elapsed.
-- This must happen before creating the partial unique indexes.
UPDATE invitations
SET status = 'expired'
WHERE status = 'pending'
  AND expires_at <= NOW();

-- Refuse to create the indexes if existing active duplicates are found.
-- Do not silently delete or modify valid invitation records.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM invitations
    WHERE project_id IS NULL
      AND status = 'pending'
    GROUP BY organization_id, LOWER(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Migration 006 aborted: duplicate pending organization invitations exist. Resolve duplicates before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM invitations
    WHERE project_id IS NOT NULL
      AND status = 'pending'
    GROUP BY project_id, LOWER(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Migration 006 aborted: duplicate pending project invitations exist. Resolve duplicates before retrying.';
  END IF;
END
$$;

-- One pending organization invitation per email address.
CREATE UNIQUE INDEX idx_invitations_unique_pending_organization_email
ON invitations (organization_id, LOWER(email))
WHERE project_id IS NULL
  AND status = 'pending';

-- One pending project invitation per email address.
CREATE UNIQUE INDEX idx_invitations_unique_pending_project_email
ON invitations (project_id, LOWER(email))
WHERE project_id IS NOT NULL
  AND status = 'pending';

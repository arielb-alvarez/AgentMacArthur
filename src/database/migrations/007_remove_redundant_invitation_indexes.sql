-- Migration 003 already enforces pending invitation uniqueness.
-- Remove the duplicate indexes introduced by Migration 006.
-- The original indexes from Migration 003 remain in place.

DROP INDEX IF EXISTS
  public.idx_invitations_unique_pending_organization_email;

DROP INDEX IF EXISTS
  public.idx_invitations_unique_pending_project_email;
-- ============================================================
-- Migration 011: Enforce exactly one active project owner
-- ============================================================

-- ------------------------------------------------------------
-- 1. Validate existing project ownership before enforcement.
-- Do not silently repair invalid ownership data.
-- ------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM projects p
    LEFT JOIN project_members pm
      ON pm.project_id = p.id
     AND pm.role = 'project_owner'
    GROUP BY p.id
    HAVING
      COUNT(pm.user_id) <> 1
      OR COUNT(pm.user_id) FILTER (
        WHERE pm.status = 'active'
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce project ownership: every existing project must have exactly one active project owner';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 2. Prevent multiple project_owner membership rows.
-- Suspended owners also count toward uniqueness.
-- ------------------------------------------------------------

CREATE UNIQUE INDEX project_members_one_owner_per_project
  ON project_members (project_id)
  WHERE role = 'project_owner';

-- ------------------------------------------------------------
-- 3. Serialize project membership mutations.
-- Lock the parent project before changing membership rows.
-- For project moves, acquire locks in deterministic order.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION lock_project_membership_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM 1
    FROM projects
    WHERE id = NEW.project_id
    FOR UPDATE;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM 1
    FROM projects
    WHERE id = OLD.project_id
    FOR UPDATE;

    RETURN OLD;
  END IF;

  FOR v_project_id IN
    SELECT p.id
    FROM projects p
    WHERE p.id = OLD.project_id
       OR p.id = NEW.project_id
    ORDER BY p.id
  LOOP
    PERFORM 1
    FROM projects
    WHERE id = v_project_id
    FOR UPDATE;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER project_members_lock_parent
  BEFORE INSERT OR UPDATE OR DELETE
  ON project_members
  FOR EACH ROW
  EXECUTE FUNCTION lock_project_membership_parent();

-- ------------------------------------------------------------
-- 4. Validate final ownership state.
-- This function is called by deferred constraint triggers.
-- It checks the transaction's final state, not intermediate
-- states during a valid ownership transfer.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_project_single_active_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_ids UUID[];
  v_project_id UUID;
  v_owner_count BIGINT;
  v_active_owner_count BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN
    v_project_ids := ARRAY[NEW.id];
  ELSIF TG_OP = 'INSERT' THEN
    v_project_ids := ARRAY[NEW.project_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_project_ids := ARRAY[OLD.project_id];
  ELSE
    v_project_ids := ARRAY[OLD.project_id, NEW.project_id];
  END IF;

  FOREACH v_project_id IN ARRAY v_project_ids
  LOOP
    -- A deleted project no longer needs an owner.
    IF EXISTS (
      SELECT 1
      FROM projects
      WHERE id = v_project_id
    ) THEN
      SELECT
        COUNT(*) FILTER (
          WHERE role = 'project_owner'
        ),
        COUNT(*) FILTER (
          WHERE role = 'project_owner'
            AND status = 'active'
        )
      INTO
        v_owner_count,
        v_active_owner_count
      FROM project_members
      WHERE project_id = v_project_id;

      IF v_owner_count <> 1 OR v_active_owner_count <> 1 THEN
        RAISE EXCEPTION
          'Project % must have exactly one active project owner (found % owner rows and % active owner rows)',
          v_project_id,
          v_owner_count,
          v_active_owner_count
          USING
            ERRCODE = '23514',
            CONSTRAINT = 'project_members_exactly_one_active_owner';
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- ------------------------------------------------------------
-- 5. Validate project creation at transaction commit.
-- This permits project creation and owner membership creation
-- within the same transaction.
-- ------------------------------------------------------------

CREATE CONSTRAINT TRIGGER projects_require_active_owner
  AFTER INSERT
  ON projects
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_project_single_active_owner();

-- ------------------------------------------------------------
-- 6. Validate membership changes at transaction commit.
-- This permits temporary zero-owner states during transfers,
-- provided the transaction finishes with one active owner.
-- ------------------------------------------------------------

CREATE CONSTRAINT TRIGGER project_members_require_active_owner
  AFTER INSERT OR UPDATE OR DELETE
  ON project_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_project_single_active_owner();

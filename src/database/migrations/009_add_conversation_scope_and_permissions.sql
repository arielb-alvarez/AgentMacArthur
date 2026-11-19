-- ============================================================
-- MIGRATION 009: ADD CONVERSATION SCOPE AND PERMISSIONS
-- ============================================================
-- Introduces personal, organization, and project conversation
-- scopes with database-enforced ownership and tenant integrity.
--
-- Existing conversations are preserved as inaccessible,
-- archived legacy records. No ownership is fabricated.
--
-- Migrations 001-008 remain immutable.
-- ============================================================


-- ============================================================
-- 1. CONVERSATION OWNERSHIP AND SCOPE
-- ============================================================

ALTER TABLE conversations
    ADD COLUMN created_by UUID,
    ADD COLUMN scope VARCHAR(20),
    ADD COLUMN organization_id UUID,
    ADD COLUMN project_id UUID,
    ADD COLUMN title VARCHAR(200),
    ADD COLUMN status VARCHAR(20);


-- Existing conversations have no trustworthy ownership metadata.
-- Preserve them without assigning an artificial owner.
UPDATE conversations
SET
    scope = 'legacy',
    status = 'archived';


ALTER TABLE conversations
    ALTER COLUMN scope SET NOT NULL,
    ALTER COLUMN status SET NOT NULL;


-- ============================================================
-- 2. CONVERSATION INTEGRITY CONSTRAINTS
-- ============================================================

ALTER TABLE conversations
    ADD CONSTRAINT conversations_scope_check
        CHECK (
            scope IN (
                'legacy',
                'personal',
                'organization',
                'project'
            )
        ),

    ADD CONSTRAINT conversations_status_check
        CHECK (
            status IN ('active', 'archived')
        ),

    ADD CONSTRAINT conversations_title_check
        CHECK (
            title IS NULL
            OR LENGTH(BTRIM(title)) BETWEEN 1 AND 200
        ),

    ADD CONSTRAINT conversations_scope_ownership_check
        CHECK (
            (
                scope = 'legacy'
                AND created_by IS NULL
                AND organization_id IS NULL
                AND project_id IS NULL
                AND status = 'archived'
            )
            OR
            (
                scope = 'personal'
                AND created_by IS NOT NULL
                AND organization_id IS NULL
                AND project_id IS NULL
            )
            OR
            (
                scope = 'organization'
                AND created_by IS NOT NULL
                AND organization_id IS NOT NULL
                AND project_id IS NULL
            )
            OR
            (
                scope = 'project'
                AND created_by IS NOT NULL
                AND organization_id IS NOT NULL
                AND project_id IS NOT NULL
            )
        );


-- ============================================================
-- 3. TENANT-SAFE FOREIGN KEYS
-- ============================================================

ALTER TABLE conversations
    ADD CONSTRAINT conversations_creator_fk
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    ADD CONSTRAINT conversations_organization_fk
        FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE RESTRICT,

    ADD CONSTRAINT conversations_project_organization_fk
        FOREIGN KEY (project_id, organization_id)
        REFERENCES projects(id, organization_id)
        ON DELETE RESTRICT;


-- ============================================================
-- 4. CONVERSATION LOOKUP INDEXES
-- ============================================================

CREATE INDEX idx_conversations_personal_owner
    ON conversations (created_by, created_at DESC)
    WHERE scope = 'personal';

CREATE INDEX idx_conversations_organization
    ON conversations (organization_id, created_at DESC)
    WHERE scope = 'organization';

CREATE INDEX idx_conversations_project
    ON conversations (project_id, created_at DESC)
    WHERE scope = 'project';


-- ============================================================
-- 5. PROTECT CONVERSATION IDENTITY AND SCOPE
-- ============================================================

-- Scope and ownership metadata cannot be changed through
-- ordinary conversation updates. A future audited transfer
-- workflow would need an explicit migration/policy exception.
CREATE FUNCTION protect_conversation_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.scope IS DISTINCT FROM NEW.scope
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
       OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
       OR OLD.project_id IS DISTINCT FROM NEW.project_id THEN
        RAISE EXCEPTION
            'Conversation ownership and scope cannot be changed.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_conversation_identity
BEFORE UPDATE OF
    scope,
    created_by,
    organization_id,
    project_id
ON conversations
FOR EACH ROW
EXECUTE FUNCTION protect_conversation_identity();


-- ============================================================
-- 6. CONVERSATION PERMISSION DEFINITIONS
-- ============================================================

INSERT INTO permissions (scope, key, description)
VALUES
    (
        'organization',
        'organization.conversations.view',
        'View conversations belonging to the organization.'
    ),
    (
        'organization',
        'organization.conversations.participate',
        'Participate in organization conversations.'
    ),
    (
        'organization',
        'organization.conversations.manage',
        'Manage organization conversations.'
    ),
    (
        'project',
        'project.conversations.view',
        'View conversations belonging to an assigned project.'
    ),
    (
        'project',
        'project.conversations.participate',
        'Participate in project conversations.'
    ),
    (
        'project',
        'project.conversations.manage',
        'Manage project conversations.'
    );


-- ============================================================
-- 7. ORGANIZATION ROLE PERMISSIONS
-- ============================================================

-- Organization owners receive all three conversation permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
    ON p.scope = 'organization'
   AND p.key IN (
       'organization.conversations.view',
       'organization.conversations.participate',
       'organization.conversations.manage'
   )
WHERE r.scope = 'organization'
  AND r.key = 'owner'
  AND r.is_system = TRUE;


-- Organization admins can view and participate, but cannot manage.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
    ON p.scope = 'organization'
   AND p.key IN (
       'organization.conversations.view',
       'organization.conversations.participate'
   )
WHERE r.scope = 'organization'
  AND r.key = 'admin'
  AND r.is_system = TRUE;


-- Organization members receive no default conversation permissions.


-- ============================================================
-- 8. PROJECT ROLE PERMISSIONS
-- ============================================================

WITH role_permission_defaults (role_key, permission_key) AS (
    VALUES
        -- View access
        ('project_owner', 'project.conversations.view'),
        ('project_manager', 'project.conversations.view'),
        ('technical_lead', 'project.conversations.view'),
        ('developer', 'project.conversations.view'),
        ('qa_engineer', 'project.conversations.view'),
        ('release_manager', 'project.conversations.view'),
        ('code_reviewer', 'project.conversations.view'),
        ('code_approver', 'project.conversations.view'),
        ('security_reviewer', 'project.conversations.view'),
        ('client', 'project.conversations.view'),
        ('stakeholder', 'project.conversations.view'),
        ('viewer', 'project.conversations.view'),

        -- Participation access
        ('project_owner', 'project.conversations.participate'),
        ('project_manager', 'project.conversations.participate'),
        ('technical_lead', 'project.conversations.participate'),
        ('developer', 'project.conversations.participate'),
        ('qa_engineer', 'project.conversations.participate'),
        ('release_manager', 'project.conversations.participate'),
        ('code_reviewer', 'project.conversations.participate'),
        ('code_approver', 'project.conversations.participate'),
        ('security_reviewer', 'project.conversations.participate'),

        -- Management access
        ('project_owner', 'project.conversations.manage'),
        ('project_manager', 'project.conversations.manage')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_permission_defaults defaults
JOIN roles r
    ON r.scope = 'project'
   AND r.key = defaults.role_key
   AND r.is_system = TRUE
JOIN permissions p
    ON p.scope = 'project'
   AND p.key = defaults.permission_key;

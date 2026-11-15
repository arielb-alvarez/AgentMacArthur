-- Migration: 004_create_role_and_permission_foundation
-- Purpose: Introduce global built-in roles, organization-scoped custom roles,
--          a permission registry, role-permission mappings, and multi-role
--          organization/project membership assignments.
--
-- Migration 003 remains unchanged.
-- Existing role columns remain for backward compatibility.

-- ============================================================
-- 1. ROLE REGISTRY
-- ============================================================

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    scope VARCHAR(20) NOT NULL,
    key VARCHAR(80) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT roles_organization_fk
        FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE RESTRICT,

    CONSTRAINT roles_scope_check
        CHECK (scope IN ('organization', 'project')),

    CONSTRAINT roles_key_check
        CHECK (key ~ '^[a-z][a-z0-9_]*$'),

    CONSTRAINT roles_name_check
        CHECK (LENGTH(BTRIM(name)) BETWEEN 1 AND 120),

    CONSTRAINT roles_system_ownership_check
        CHECK (
            (is_system = TRUE AND organization_id IS NULL)
            OR
            (is_system = FALSE AND organization_id IS NOT NULL)
        )
);

-- Built-in role keys are unique within each scope.
CREATE UNIQUE INDEX idx_roles_system_scope_key
    ON roles (scope, key)
    WHERE is_system = TRUE;

-- Custom role keys are unique within an organization and scope.
CREATE UNIQUE INDEX idx_roles_custom_org_scope_key
    ON roles (organization_id, scope, key)
    WHERE is_system = FALSE;

CREATE INDEX idx_roles_organization
    ON roles (organization_id)
    WHERE organization_id IS NOT NULL;

-- Prevent changes to role identity and scope after creation.
-- Role names and descriptions can still be updated later.
CREATE FUNCTION protect_role_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
       OR OLD.scope IS DISTINCT FROM NEW.scope
       OR OLD.key IS DISTINCT FROM NEW.key
       OR OLD.is_system IS DISTINCT FROM NEW.is_system THEN
        RAISE EXCEPTION
            'Role ownership, scope, key, and system status cannot be changed.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_role_identity
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION protect_role_identity();


-- Built-in roles are platform definitions and cannot be deleted.
CREATE FUNCTION prevent_system_role_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.is_system = TRUE THEN
        RAISE EXCEPTION 'Built-in system roles cannot be deleted.';
    END IF;

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_system_role_deletion
BEFORE DELETE ON roles
FOR EACH ROW
EXECUTE FUNCTION prevent_system_role_deletion();


-- ============================================================
-- 2. PERMISSION REGISTRY
-- ============================================================

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope VARCHAR(20) NOT NULL,
    key VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT permissions_scope_check
        CHECK (scope IN ('organization', 'project')),

    CONSTRAINT permissions_key_check
        CHECK (key ~ '^[a-z][a-z0-9_.]*$'),

    CONSTRAINT permissions_scope_key_unique
        UNIQUE (scope, key)
);

-- Prevent changes to permission identity and scope after creation.
-- Descriptions can still be updated later.
CREATE FUNCTION protect_permission_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.scope IS DISTINCT FROM NEW.scope
       OR OLD.key IS DISTINCT FROM NEW.key THEN
        RAISE EXCEPTION
            'Permission scope and key cannot be changed.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_permission_identity
BEFORE UPDATE ON permissions
FOR EACH ROW
EXECUTE FUNCTION protect_permission_identity();


-- Prevent deletion of permissions that are part of the platform catalog.
CREATE FUNCTION prevent_permission_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'Permission definitions cannot be deleted. Retire permissions through application policy instead.';

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_permission_deletion
BEFORE DELETE ON permissions
FOR EACH ROW
EXECUTE FUNCTION prevent_permission_deletion();


-- ============================================================
-- 3. ROLE-PERMISSION MAPPINGS
-- ============================================================

CREATE TABLE role_permissions (
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT role_permissions_pk
        PRIMARY KEY (role_id, permission_id),

    CONSTRAINT role_permissions_role_fk
        FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON DELETE CASCADE,

    CONSTRAINT role_permissions_permission_fk
        FOREIGN KEY (permission_id)
        REFERENCES permissions(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_role_permissions_permission
    ON role_permissions (permission_id);


-- ============================================================
-- 4. BUILT-IN ROLE DEFINITIONS
-- ============================================================

INSERT INTO roles (
    scope,
    key,
    name,
    description,
    is_system
)
VALUES
    -- Organization roles
    (
        'organization',
        'owner',
        'Organization Owner',
        'Owns the organization and has full organization-level authority.',
        TRUE
    ),
    (
        'organization',
        'admin',
        'Organization Admin',
        'Manages organization settings and membership.',
        TRUE
    ),
    (
        'organization',
        'member',
        'Organization Member',
        'Standard organization membership.',
        TRUE
    ),

    -- Project roles
    (
        'project',
        'project_owner',
        'Project Owner',
        'Owns and manages a project.',
        TRUE
    ),
    (
        'project',
        'client',
        'Client',
        'External client with access to assigned projects.',
        TRUE
    ),
    (
        'project',
        'stakeholder',
        'Stakeholder',
        'Reviews project progress and relevant deliverables.',
        TRUE
    ),
    (
        'project',
        'project_manager',
        'Project Manager',
        'Manages project execution and coordination.',
        TRUE
    ),
    (
        'project',
        'technical_lead',
        'Technical Lead',
        'Leads technical decisions and engineering direction.',
        TRUE
    ),
    (
        'project',
        'developer',
        'Developer',
        'Implements project work and software changes.',
        TRUE
    ),
    (
        'project',
        'code_reviewer',
        'Code Reviewer',
        'Reviews code changes and provides technical feedback.',
        TRUE
    ),
    (
        'project',
        'code_approver',
        'Code Approver',
        'Approves code changes under the applicable approval policy.',
        TRUE
    ),
    (
        'project',
        'security_reviewer',
        'Security Reviewer',
        'Reviews security implications of project changes.',
        TRUE
    ),
    (
        'project',
        'qa_engineer',
        'QA Engineer',
        'Validates software quality and test results.',
        TRUE
    ),
    (
        'project',
        'release_manager',
        'Release Manager',
        'Coordinates and manages software releases.',
        TRUE
    ),
    (
        'project',
        'viewer',
        'Viewer',
        'Has read-only project access.',
        TRUE
    );


-- ============================================================
-- 5. BUILT-IN PERMISSION DEFINITIONS
-- ============================================================

INSERT INTO permissions (scope, key, description)
VALUES
    -- Organization permissions
    (
        'organization',
        'organization.view',
        'View organization details.'
    ),
    (
        'organization',
        'organization.update',
        'Update organization settings.'
    ),
    (
        'organization',
        'organization.members.manage',
        'Manage organization membership.'
    ),
    (
        'organization',
        'project.create',
        'Create projects within the organization.'
    ),
    (
        'organization',
        'organization.projects.view',
        'View all projects within the organization.'
    ),
    (
        'organization',
        'organization.projects.manage',
        'Manage all projects within the organization.'
    ),

    -- Project permissions
    (
        'project',
        'project.view',
        'View project details and information.'
    ),
    (
        'project',
        'project.update',
        'Update project details.'
    ),
    (
        'project',
        'project.change_status',
        'Change project lifecycle status.'
    ),
    (
        'project',
        'project.members.manage',
        'Manage project membership.'
    ),
    (
        'project',
        'code.review',
        'Review code changes.'
    ),
    (
        'project',
        'code.approve',
        'Approve code changes.'
    ),
    (
        'project',
        'code.merge',
        'Merge code changes.'
    ),
    (
        'project',
        'security.review',
        'Review security implications of changes.'
    ),
    (
        'project',
        'deployment.approve',
        'Approve deployments.'
    ),
    (
        'project',
        'deployment.execute',
        'Execute deployments.'
    ),
    (
        'project',
        'approval.view',
        'View approval requests and decisions.'
    ),
    (
        'project',
        'approval.create',
        'Create approval requests.'
    ),
    (
        'project',
        'approval.decide',
        'Submit approval decisions.'
    ),
    (
        'project',
        'risk.view',
        'View project risks.'
    ),
    (
        'project',
        'risk.manage',
        'Create, update, and manage project risks.'
    ),
    (
        'project',
        'technical_decision.view',
        'View technical decisions.'
    ),
    (
        'project',
        'technical_decision.decide',
        'Make or record technical decisions.'
    );


-- ============================================================
-- 6. DEFAULT ROLE-PERMISSION MAPPINGS
-- ============================================================

-- Organization owner permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.scope = 'organization'
  AND r.key = 'owner'
  AND p.scope = 'organization';

-- Organization admin permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'organization.view',
      'organization.update',
      'organization.members.manage',
      'project.create',
      'organization.projects.view',
      'organization.projects.manage'
  )
WHERE r.scope = 'organization'
  AND r.key = 'admin';

-- Organization member permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'organization.view',
      'project.create'
  )
WHERE r.scope = 'organization'
  AND r.key = 'member';


-- Project owner permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'project.view',
      'project.update',
      'project.change_status',
      'project.members.manage',
      'approval.view',
      'approval.create',
      'risk.view',
      'risk.manage',
      'technical_decision.view',
      'technical_decision.decide'
  )
WHERE r.scope = 'project'
  AND r.key = 'project_owner';

-- Project manager permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'project.view',
      'project.update',
      'project.change_status',
      'project.members.manage',
      'approval.view',
      'approval.create',
      'risk.view',
      'risk.manage',
      'technical_decision.view'
  )
WHERE r.scope = 'project'
  AND r.key = 'project_manager';

-- Technical lead permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'project.view',
      'code.review',
      'security.review',
      'approval.view',
      'risk.view',
      'technical_decision.view',
      'technical_decision.decide'
  )
WHERE r.scope = 'project'
  AND r.key = 'technical_lead';

-- Developer permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'project.view',
      'approval.view'
  )
WHERE r.scope = 'project'
  AND r.key = 'developer';

-- Code reviewer permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'project.view',
      'code.review',
      'approval.view'
  )
WHERE r.scope = 'project'
  AND r.key = 'code_reviewer';

-- Code approver permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'project.view',
      'code.approve',
      'code.merge',
      'approval.view'
  )
WHERE r.scope = 'project'
  AND r.key = 'code_approver';

-- Security reviewer permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'project.view',
      'security.review',
      'risk.view',
      'approval.view'
  )
WHERE r.scope = 'project'
  AND r.key = 'security_reviewer';

-- QA engineer permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'project.view',
      'approval.view'
  )
WHERE r.scope = 'project'
  AND r.key = 'qa_engineer';

-- Release manager permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'project.view',
      'deployment.approve',
      'deployment.execute',
      'approval.view',
      'risk.view'
  )
WHERE r.scope = 'project'
  AND r.key = 'release_manager';

-- Client, stakeholder, and viewer receive read-only access.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.key IN (
      'project.view',
      'approval.view'
  )
WHERE r.scope = 'project'
  AND r.key IN ('client', 'stakeholder', 'viewer');


-- ============================================================
-- 7. ORGANIZATION MEMBER ROLE ASSIGNMENTS
-- ============================================================

CREATE TABLE organization_member_roles (
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    assigned_by UUID,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT organization_member_roles_pk
        PRIMARY KEY (organization_id, user_id, role_id),

    CONSTRAINT organization_member_roles_membership_fk
        FOREIGN KEY (organization_id, user_id)
        REFERENCES organization_members(organization_id, user_id)
        ON DELETE CASCADE,

    CONSTRAINT organization_member_roles_role_fk
        FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON DELETE RESTRICT,

    CONSTRAINT organization_member_roles_assigner_fk
        FOREIGN KEY (assigned_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_organization_member_roles_user
    ON organization_member_roles (user_id);

CREATE INDEX idx_organization_member_roles_role
    ON organization_member_roles (role_id);


-- ============================================================
-- 8. PROJECT MEMBER ROLE ASSIGNMENTS
-- ============================================================

-- Additional composite uniqueness supports tenant-safe assignment FKs.
ALTER TABLE project_members
    ADD CONSTRAINT project_members_project_org_user_unique
    UNIQUE (project_id, organization_id, user_id);

CREATE TABLE project_member_roles (
    project_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    assigned_by UUID,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT project_member_roles_pk
        PRIMARY KEY (project_id, user_id, role_id),

    CONSTRAINT project_member_roles_membership_fk
        FOREIGN KEY (project_id, organization_id, user_id)
        REFERENCES project_members(
            project_id,
            organization_id,
            user_id
        )
        ON DELETE CASCADE,

    CONSTRAINT project_member_roles_role_fk
        FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON DELETE RESTRICT,

    CONSTRAINT project_member_roles_assigner_fk
        FOREIGN KEY (assigned_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_project_member_roles_user
    ON project_member_roles (user_id);

CREATE INDEX idx_project_member_roles_role
    ON project_member_roles (role_id);

CREATE INDEX idx_project_member_roles_project
    ON project_member_roles (project_id, organization_id);


-- ============================================================
-- 9. ROLE SCOPE AND OWNERSHIP VALIDATION
-- ============================================================

-- Organization assignments must use organization-scoped roles.
-- Custom roles must belong to the same organization.
CREATE FUNCTION validate_organization_member_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    selected_scope VARCHAR(20);
    selected_organization_id UUID;
BEGIN
    SELECT scope, organization_id
    INTO selected_scope, selected_organization_id
    FROM roles
    WHERE id = NEW.role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role does not exist.';
    END IF;

    IF selected_scope <> 'organization' THEN
        RAISE EXCEPTION
            'Project-scoped roles cannot be assigned to organization memberships.';
    END IF;

    IF selected_organization_id IS NOT NULL
       AND selected_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'Custom role cannot be assigned outside its owning organization.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_organization_member_role
BEFORE INSERT OR UPDATE OF organization_id, role_id
ON organization_member_roles
FOR EACH ROW
EXECUTE FUNCTION validate_organization_member_role();


-- Project assignments must use project-scoped roles.
-- Custom roles must belong to the project's organization.
CREATE FUNCTION validate_project_member_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    selected_scope VARCHAR(20);
    selected_organization_id UUID;
BEGIN
    SELECT scope, organization_id
    INTO selected_scope, selected_organization_id
    FROM roles
    WHERE id = NEW.role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role does not exist.';
    END IF;

    IF selected_scope <> 'project' THEN
        RAISE EXCEPTION
            'Organization-scoped roles cannot be assigned to project memberships.';
    END IF;

    IF selected_organization_id IS NOT NULL
       AND selected_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'Custom role cannot be assigned outside its owning organization.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_project_member_role
BEFORE INSERT OR UPDATE OF organization_id, role_id
ON project_member_roles
FOR EACH ROW
EXECUTE FUNCTION validate_project_member_role();


-- ============================================================
-- 10. ROLE-PERMISSION SCOPE VALIDATION
-- ============================================================

CREATE FUNCTION validate_role_permission_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    selected_role_scope VARCHAR(20);
    selected_permission_scope VARCHAR(20);
BEGIN
    SELECT scope
    INTO selected_role_scope
    FROM roles
    WHERE id = NEW.role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role does not exist.';
    END IF;

    SELECT scope
    INTO selected_permission_scope
    FROM permissions
    WHERE id = NEW.permission_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permission does not exist.';
    END IF;

    IF selected_role_scope <> selected_permission_scope THEN
        RAISE EXCEPTION
            'Role and permission scopes must match.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_role_permission_scope
BEFORE INSERT OR UPDATE OF role_id, permission_id
ON role_permissions
FOR EACH ROW
EXECUTE FUNCTION validate_role_permission_scope();


-- ============================================================
-- 11. BACKFILL EXISTING ORGANIZATION MEMBERSHIPS
-- ============================================================

INSERT INTO organization_member_roles (
    organization_id,
    user_id,
    role_id
)
SELECT
    om.organization_id,
    om.user_id,
    r.id
FROM organization_members om
JOIN roles r
  ON r.scope = 'organization'
 AND r.key = om.role
 AND r.is_system = TRUE
ON CONFLICT DO NOTHING;


-- ============================================================
-- 12. BACKFILL EXISTING PROJECT MEMBERSHIPS
-- ============================================================

INSERT INTO project_member_roles (
    project_id,
    organization_id,
    user_id,
    role_id
)
SELECT
    pm.project_id,
    pm.organization_id,
    pm.user_id,
    r.id
FROM project_members pm
JOIN roles r
  ON r.scope = 'project'
 AND r.key = pm.role
 AND r.is_system = TRUE
ON CONFLICT DO NOTHING;


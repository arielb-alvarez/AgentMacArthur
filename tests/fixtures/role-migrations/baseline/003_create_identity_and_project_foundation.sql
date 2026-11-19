-- Migration: 003_create_identity_and_project_foundation
-- Purpose: Establish user identity, authentication, organizations,
--          project ownership, memberships, and invitations.
--
-- Existing migrations 001 and 002 must remain unchanged.

-- ============================================================
-- 1. USERS
-- ============================================================

CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_email_format_check
        CHECK (
            email = LOWER(BTRIM(email))
            AND LENGTH(email) BETWEEN 3 AND 255
        ),

    CONSTRAINT users_password_hash_check
        CHECK (LENGTH(password_hash) > 0),

    CONSTRAINT users_display_name_check
        CHECK (LENGTH(BTRIM(display_name)) BETWEEN 1 AND 120),

    CONSTRAINT users_status_check
        CHECK (status IN ('pending', 'active', 'suspended'))
);

CREATE UNIQUE INDEX idx_users_email_unique
    ON users (LOWER(email));


-- ============================================================
-- 2. ORGANIZATIONS
-- ============================================================

CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    owner_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT organizations_owner_fk
        FOREIGN KEY (owner_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT organizations_name_check
        CHECK (LENGTH(BTRIM(name)) BETWEEN 1 AND 150),

    CONSTRAINT organizations_slug_check
        CHECK (
            slug = LOWER(BTRIM(slug))
            AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        ),

    CONSTRAINT organizations_type_check
        CHECK (type IN ('personal', 'team')),

    CONSTRAINT organizations_id_owner_unique
        UNIQUE (id, owner_user_id)
);

CREATE UNIQUE INDEX idx_organizations_slug_unique
    ON organizations (LOWER(slug));

CREATE UNIQUE INDEX idx_organizations_one_personal_per_owner
    ON organizations (owner_user_id)
    WHERE type = 'personal';


-- ============================================================
-- 3. ORGANIZATION MEMBERS
-- ============================================================

CREATE TABLE organization_members (
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT organization_members_pk
        PRIMARY KEY (organization_id, user_id),

    CONSTRAINT organization_members_organization_fk
        FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE RESTRICT,

    CONSTRAINT organization_members_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT organization_members_role_check
        CHECK (role IN ('owner', 'admin', 'member')),

    CONSTRAINT organization_members_status_check
        CHECK (status IN ('active', 'suspended'))
);

CREATE INDEX idx_organization_members_user
    ON organization_members (user_id);

CREATE INDEX idx_organization_members_org_role
    ON organization_members (organization_id, role);

-- An organization owner must also be an organization member.
-- Deferred so organization and owner membership can be created
-- within the same transaction.
ALTER TABLE organizations
    ADD CONSTRAINT organizations_owner_membership_fk
    FOREIGN KEY (id, owner_user_id)
    REFERENCES organization_members (organization_id, user_id)
    DEFERRABLE INITIALLY DEFERRED;


-- ============================================================
-- 4. PROJECTS
-- ============================================================

CREATE TABLE projects (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT projects_organization_fk
        FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE RESTRICT,

    CONSTRAINT projects_creator_membership_fk
        FOREIGN KEY (organization_id, created_by)
        REFERENCES organization_members(organization_id, user_id)
        ON DELETE RESTRICT,

    CONSTRAINT projects_name_check
        CHECK (LENGTH(BTRIM(name)) BETWEEN 1 AND 150),

    CONSTRAINT projects_status_check
        CHECK (
            status IN (
                'draft',
                'active',
                'on_hold',
                'completed',
                'archived'
            )
        ),

    CONSTRAINT projects_id_organization_unique
        UNIQUE (id, organization_id)
);

CREATE INDEX idx_projects_organization
    ON projects (organization_id);

CREATE INDEX idx_projects_organization_status
    ON projects (organization_id, status);


-- ============================================================
-- 5. PROJECT MEMBERS
-- ============================================================

CREATE TABLE project_members (
    project_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT project_members_pk
        PRIMARY KEY (project_id, user_id),

    CONSTRAINT project_members_project_fk
        FOREIGN KEY (project_id, organization_id)
        REFERENCES projects(id, organization_id)
        ON DELETE RESTRICT,

    CONSTRAINT project_members_organization_membership_fk
        FOREIGN KEY (organization_id, user_id)
        REFERENCES organization_members(organization_id, user_id)
        ON DELETE RESTRICT,

    CONSTRAINT project_members_role_check
        CHECK (
            role IN (
                'project_owner',
                'client',
                'stakeholder',
                'project_manager',
                'technical_lead',
                'developer',
                'qa_engineer',
                'viewer'
            )
        ),

    CONSTRAINT project_members_status_check
        CHECK (status IN ('active', 'suspended'))
);

CREATE INDEX idx_project_members_user
    ON project_members (user_id);

CREATE INDEX idx_project_members_organization
    ON project_members (organization_id);

CREATE INDEX idx_project_members_project_role
    ON project_members (project_id, role);


-- ============================================================
-- 6. INVITATIONS
-- ============================================================

CREATE TABLE invitations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    invited_by UUID NOT NULL,
    accepted_by UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT invitations_organization_fk
        FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE RESTRICT,

    CONSTRAINT invitations_project_fk
        FOREIGN KEY (project_id, organization_id)
        REFERENCES projects(id, organization_id)
        ON DELETE RESTRICT,

    CONSTRAINT invitations_inviter_membership_fk
        FOREIGN KEY (organization_id, invited_by)
        REFERENCES organization_members(organization_id, user_id)
        ON DELETE RESTRICT,

    CONSTRAINT invitations_accepted_by_fk
        FOREIGN KEY (accepted_by)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT invitations_email_check
        CHECK (
            email = LOWER(BTRIM(email))
            AND LENGTH(email) BETWEEN 3 AND 255
        ),

    CONSTRAINT invitations_token_hash_check
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),

    CONSTRAINT invitations_role_scope_check
        CHECK (
            (
                project_id IS NULL
                AND role IN ('admin', 'member')
            )
            OR
            (
                project_id IS NOT NULL
                AND role IN (
                    'project_owner',
                    'client',
                    'stakeholder',
                    'project_manager',
                    'technical_lead',
                    'developer',
                    'qa_engineer',
                    'viewer'
                )
            )
        ),

    CONSTRAINT invitations_status_check
        CHECK (status IN ('pending', 'accepted', 'revoked')),

    CONSTRAINT invitations_acceptance_check
        CHECK (
            (status = 'accepted' AND accepted_by IS NOT NULL
                AND accepted_at IS NOT NULL)
            OR
            (status <> 'accepted' AND accepted_at IS NULL)
        ),

    CONSTRAINT invitations_expiration_check
        CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX idx_invitations_token_hash_unique
    ON invitations (token_hash);

CREATE INDEX idx_invitations_organization_status
    ON invitations (organization_id, status);

CREATE INDEX idx_invitations_email
    ON invitations (LOWER(email));

CREATE INDEX idx_invitations_project
    ON invitations (project_id)
    WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX idx_invitations_pending_organization_email
    ON invitations (organization_id, LOWER(email))
    WHERE status = 'pending'
      AND project_id IS NULL;

CREATE UNIQUE INDEX idx_invitations_pending_project_email
    ON invitations (organization_id, project_id, LOWER(email))
    WHERE status = 'pending'
      AND project_id IS NOT NULL;


-- ============================================================
-- 7. SESSIONS
-- ============================================================

CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT sessions_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT sessions_token_hash_check
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),

    CONSTRAINT sessions_expiration_check
        CHECK (expires_at > created_at),

    CONSTRAINT sessions_revocation_check
        CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE UNIQUE INDEX idx_sessions_token_hash_unique
    ON sessions (token_hash);

CREATE INDEX idx_sessions_user
    ON sessions (user_id);

CREATE INDEX idx_sessions_active_expiration
    ON sessions (expires_at)
    WHERE revoked_at IS NULL;


-- ============================================================
-- 8. AUTH TOKENS
-- ============================================================

CREATE TABLE auth_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT auth_tokens_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT auth_tokens_purpose_check
        CHECK (
            purpose IN (
                'email_verification',
                'password_reset'
            )
        ),

    CONSTRAINT auth_tokens_hash_check
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),

    CONSTRAINT auth_tokens_expiration_check
        CHECK (expires_at > created_at),

    CONSTRAINT auth_tokens_consumption_check
        CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE UNIQUE INDEX idx_auth_tokens_hash_unique
    ON auth_tokens (token_hash);

CREATE INDEX idx_auth_tokens_user_purpose
    ON auth_tokens (user_id, purpose);

CREATE INDEX idx_auth_tokens_active_expiration
    ON auth_tokens (expires_at)
    WHERE consumed_at IS NULL;

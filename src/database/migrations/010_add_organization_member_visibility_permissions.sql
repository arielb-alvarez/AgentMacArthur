-- ============================================================
-- 010: ORGANIZATION MEMBER VISIBILITY PERMISSIONS
-- ============================================================

-- 1. Register independent member visibility permissions.

INSERT INTO permissions (scope, key, description)
VALUES
    (
        'organization',
        'organization.members.view',
        'View the basic organization member directory.'
    ),
    (
        'organization',
        'organization.members.view_details',
        'View extended organization member details, including email, account status, membership status, assigned roles, and join date.'
    )
ON CONFLICT (scope, key) DO NOTHING;


-- 2. Organization owners can view the directory and extended details.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.scope = 'organization'
  AND r.key = 'owner'
  AND r.organization_id IS NULL
  AND r.is_system = TRUE
  AND p.scope = 'organization'
  AND p.key IN (
      'organization.members.view',
      'organization.members.view_details'
  )
ON CONFLICT DO NOTHING;


-- 3. Organization admins can view the basic directory only.
--    They retain their existing organization.members.manage grant.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.scope = 'organization'
 AND p.key = 'organization.members.view'
WHERE r.scope = 'organization'
  AND r.key = 'admin'
  AND r.organization_id IS NULL
  AND r.is_system = TRUE
ON CONFLICT DO NOTHING;


-- 4. Ordinary organization members can view the basic directory only.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
  ON p.scope = 'organization'
 AND p.key = 'organization.members.view'
WHERE r.scope = 'organization'
  AND r.key = 'member'
  AND r.organization_id IS NULL
  AND r.is_system = TRUE
ON CONFLICT DO NOTHING;

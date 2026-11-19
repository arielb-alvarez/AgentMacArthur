import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { testPool } from "../../src/config/test-database.js";
import { PostgresTransactionManager } from "../../src/database/transaction-manager.js";

import {
  clearIdentityTestDatabase,
  setupTestDatabase,
} from "../helpers/database-setup.js";

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresOrganizationRepository } from "../../src/organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../../src/organization-members/postgres-organization-member.repository.js";
import { PostgresRoleAssignmentRepository } from "../../src/role-assignments/postgres-role-assignment.repository.js";
import { PostgresOrganizationPermissionRepository } from "../../src/permissions/postgres-organization-permission.repository.js";

describe("PostgresOrganizationPermissionRepository integration", () => {
  const transactionManager = new PostgresTransactionManager(testPool);

  const userRepository = new PostgresUserRepository(
    testPool,
    transactionManager
  );

  const organizationRepository = new PostgresOrganizationRepository(
    testPool,
    transactionManager
  );

  const organizationMemberRepository =
    new PostgresOrganizationMemberRepository(
      testPool,
      transactionManager
    );

  const roleAssignmentRepository =
    new PostgresRoleAssignmentRepository(
      testPool,
      transactionManager
    );

  const permissionRepository =
    new PostgresOrganizationPermissionRepository(
      testPool,
      transactionManager
    );

  const createUser = async (email: string) => {
    return userRepository.create({
      email,
      passwordHash: "test-password-hash",
      displayName: "Test User",
    });
  };

  const createOrganization = async (ownerUserId: string) => {
    return transactionManager.runInTransaction(
      "createPermissionTestOrganization",
      async (client) => {
        const organization = await organizationRepository.create(
          {
            name: "Permission Test Workspace",
            slug: `permission-${crypto.randomUUID()}`,
            type: "team",
            ownerUserId,
          },
          client
        );

        await organizationMemberRepository.create(
          {
            organizationId: organization.id,
            userId: ownerUserId,
            role: "owner",
            status: "active",
          },
          client
        );

        await roleAssignmentRepository.assignOrganizationRole(
          {
            organizationId: organization.id,
            userId: ownerUserId,
            roleKey: "owner",
            assignedBy: ownerUserId,
          },
          client
        );

        return organization;
      }
    );
  };

  const addOrganizationMember = async (
    organizationId: string,
    userId: string,
    roleKey: "admin" | "member" = "member"
  ) => {
    await transactionManager.runInTransaction(
      "addPermissionTestOrganizationMember",
      async (client) => {
        await organizationMemberRepository.create(
          {
            organizationId,
            userId,
            role: roleKey,
            status: "active",
          },
          client
        );

        await roleAssignmentRepository.assignOrganizationRole(
          {
            organizationId,
            userId,
            roleKey,
            assignedBy: userId,
          },
          client
        );
      }
    );
  };


  const createProject = async (
    organizationId: string,
    createdBy: string
  ): Promise<string> => {
    let projectId = "";

    await transactionManager.runInTransaction(
      "createPermissionTestProject",
      async (client) => {
        const result = await client.query<{ id: string }>(
          `INSERT INTO projects (
            id,
            organization_id,
            name,
            description,
            status,
            created_by
          )
          VALUES (
            gen_random_uuid(),
            $1,
            'Permission Test Project',
            'Project permission integration test',
            'draft',
            $2
          )
          RETURNING id`,
          [organizationId, createdBy]
        );

        projectId = result.rows[0]!.id;

        await client.query(
          `INSERT INTO project_members (
            project_id,
            organization_id,
            user_id,
            role,
            status
          )
          VALUES ($1, $2, $3, 'project_owner', 'active')`,
          [projectId, organizationId, createdBy]
        );

        await client.query(
          `INSERT INTO project_member_roles (
            project_id,
            organization_id,
            user_id,
            role_id,
            assigned_by
          )
          SELECT $1, $2, $3, r.id, $4
          FROM roles r
          WHERE r.scope = 'project'
            AND r.key = 'project_owner'
            AND r.is_system = TRUE`,
          [projectId, organizationId, createdBy, createdBy]
        );
      }
    );

    return projectId;
  };


  const addProjectMember = async (
    organizationId: string,
    projectId: string,
    userId: string,
    roleKey: string
  ) => {
    await transactionManager.runInTransaction(
      "addPermissionTestProjectMember",
      async (client) => {
        await client.query(
          `INSERT INTO project_members (
            project_id,
            organization_id,
            user_id,
            role,
            status
          )
          VALUES ($1, $2, $3, $4, 'active')`,
          [projectId, organizationId, userId, roleKey]
        );

        await client.query(
          `INSERT INTO project_member_roles (
            project_id,
            organization_id,
            user_id,
            role_id,
            assigned_by
          )
          SELECT $1, $2, $3, r.id, $4
          FROM roles r
          WHERE r.scope = 'project'
            AND r.key = $5
            AND r.is_system = TRUE`,
          [projectId, organizationId, userId, userId, roleKey]
        );
      }
    );
  };

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearIdentityTestDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

  // ============================================================
  // ORGANIZATION PERMISSIONS
  // ============================================================

  it("should grant permissions to an organization owner", async () => {
    const owner = await createUser("permission-owner@example.com");
    const organization = await createOrganization(owner.id);

    const result =
      await permissionRepository.hasOrganizationPermission(
        organization.id,
        owner.id,
        "organization.update"
      );

    expect(result).toBe(true);
  });

  it("should grant permissions to an organization admin", async () => {
    const owner = await createUser("permission-admin-owner@example.com");
    const admin = await createUser("permission-admin@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(
      organization.id,
      admin.id,
      "admin"
    );

    const result =
      await permissionRepository.hasOrganizationPermission(
        organization.id,
        admin.id,
        "organization.members.manage"
      );

    expect(result).toBe(true);
  });

  it("should deny permissions not assigned to a regular member", async () => {
    const owner = await createUser("permission-member-owner@example.com");
    const member = await createUser("permission-member@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(
      organization.id,
      member.id,
      "member"
    );

    const result =
      await permissionRepository.hasOrganizationPermission(
        organization.id,
        member.id,
        "organization.update"
      );

    expect(result).toBe(false);
  });

  it("should deny permissions to suspended organization members", async () => {
    const owner = await createUser("permission-suspended-owner@example.com");
    const admin = await createUser("permission-suspended@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(
      organization.id,
      admin.id,
      "admin"
    );

    await testPool.query(
      `UPDATE organization_members
       SET status = 'suspended'
       WHERE organization_id = $1
         AND user_id = $2`,
      [organization.id, admin.id]
    );

    const result =
      await permissionRepository.hasOrganizationPermission(
        organization.id,
        admin.id,
        "organization.members.manage"
      );

    expect(result).toBe(false);
  });

  it("should recognize permissions granted through a custom organization role", async () => {
    const owner = await createUser("permission-custom-owner@example.com");
    const member = await createUser("permission-custom@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(
      organization.id,
      member.id,
      "member"
    );

    const customRole = await testPool.query<{ id: string }>(
      `INSERT INTO roles (
        organization_id,
        scope,
        key,
        name,
        description,
        is_system
      )
      VALUES ($1, 'organization', 'custom_manager', 'Custom Manager',
        'Custom organization permission test role', FALSE)
      RETURNING id`,
      [organization.id]
    );

    await testPool.query(
      `INSERT INTO role_permissions (
        role_id,
        permission_id
      )
      SELECT $1, id
      FROM permissions
      WHERE scope = 'organization'
        AND key = 'organization.update'`,
      [customRole.rows[0]!.id]
    );

    await testPool.query(
      `INSERT INTO organization_member_roles (
        organization_id,
        user_id,
        role_id,
        assigned_by
      )
      VALUES ($1, $2, $3, $4)`,
      [
        organization.id,
        member.id,
        customRole.rows[0]!.id,
        owner.id,
      ]
    );

    const result =
      await permissionRepository.hasOrganizationPermission(
        organization.id,
        member.id,
        "organization.update"
      );

    expect(result).toBe(true);
  });

  it("should not apply a custom organization role from another organization", async () => {
    const ownerA = await createUser("custom-org-isolation-owner-a@example.com");
    const ownerB = await createUser("custom-org-isolation-owner-b@example.com");
    const member = await createUser("custom-org-isolation-member@example.com");

    const organizationA = await createOrganization(ownerA.id);
    const organizationB = await createOrganization(ownerB.id);

    await addOrganizationMember(organizationA.id, member.id);
    await addOrganizationMember(organizationB.id, member.id);

    const customRole = await testPool.query<{ id: string }>(
      `INSERT INTO roles (
      organization_id,
      scope,
      key,
      name,
      description,
      is_system
    )
    VALUES ($1, 'organization', 'custom_isolation_test',
      'Custom Isolation Test', 'Tenant isolation test', FALSE)
    RETURNING id`,
      [organizationA.id]
    );

    await testPool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, id
     FROM permissions
     WHERE scope = 'organization'
       AND key = 'organization.update'`,
      [customRole.rows[0]!.id]
    );

    await testPool.query(
      `INSERT INTO organization_member_roles (
      organization_id, user_id, role_id, assigned_by
    )
    VALUES ($1, $2, $3, $4)`,
      [organizationA.id, member.id, customRole.rows[0]!.id, ownerA.id]
    );

    const result = await permissionRepository.hasOrganizationPermission(
      organizationB.id,
      member.id,
      "organization.update"
    );

    expect(result).toBe(false);
  });

  // ============================================================
  // PROJECT PERMISSIONS
  // ============================================================

  it("should grant project conversation view permission to a developer", async () => {
    const owner = await createUser("project-view-owner@example.com");
    const developer = await createUser("project-view-developer@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(
      organization.id,
      developer.id
    );

    const projectId = await createProject(
      organization.id,
      owner.id
    );

    await addProjectMember(
      organization.id,
      projectId,
      developer.id,
      "developer"
    );

    const result =
      await permissionRepository.hasProjectPermission(
        organization.id,
        projectId,
        developer.id,
        "project.conversations.view"
      );

    expect(result).toBe(true);
  });

  it("should grant project conversation participation permission to a developer", async () => {
    const owner = await createUser("project-participate-owner@example.com");
    const developer = await createUser("project-participate-developer@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(
      organization.id,
      developer.id
    );

    const projectId = await createProject(
      organization.id,
      owner.id
    );

    await addProjectMember(
      organization.id,
      projectId,
      developer.id,
      "developer"
    );

    const result =
      await permissionRepository.hasProjectPermission(
        organization.id,
        projectId,
        developer.id,
        "project.conversations.participate"
      );

    expect(result).toBe(true);
  });

  it("should deny project conversation management permission to a developer", async () => {
    const owner = await createUser("project-manage-owner@example.com");
    const developer = await createUser("project-manage-developer@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(
      organization.id,
      developer.id
    );

    const projectId = await createProject(
      organization.id,
      owner.id
    );

    await addProjectMember(
      organization.id,
      projectId,
      developer.id,
      "developer"
    );

    const result =
      await permissionRepository.hasProjectPermission(
        organization.id,
        projectId,
        developer.id,
        "project.conversations.manage"
      );

    expect(result).toBe(false);
  });

  it("should deny project permissions to suspended project members", async () => {
    const owner = await createUser("project-suspended-owner@example.com");
    const developer = await createUser("project-suspended-developer@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(
      organization.id,
      developer.id
    );

    const projectId = await createProject(
      organization.id,
      owner.id
    );

    await addProjectMember(
      organization.id,
      projectId,
      developer.id,
      "developer"
    );

    await testPool.query(
      `UPDATE project_members
       SET status = 'suspended'
       WHERE project_id = $1
         AND organization_id = $2
         AND user_id = $3`,
      [projectId, organization.id, developer.id]
    );

    const result =
      await permissionRepository.hasProjectPermission(
        organization.id,
        projectId,
        developer.id,
        "project.conversations.view"
      );

    expect(result).toBe(false);
  });

  it("should deny project permissions to suspended organization members", async () => {
    const owner = await createUser("project-org-suspended-owner@example.com");
    const developer = await createUser("project-org-suspended-developer@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(
      organization.id,
      developer.id
    );

    const projectId = await createProject(
      organization.id,
      owner.id
    );

    await addProjectMember(
      organization.id,
      projectId,
      developer.id,
      "developer"
    );

    await testPool.query(
      `UPDATE organization_members
       SET status = 'suspended'
       WHERE organization_id = $1
         AND user_id = $2`,
      [organization.id, developer.id]
    );

    const result =
      await permissionRepository.hasProjectPermission(
        organization.id,
        projectId,
        developer.id,
        "project.conversations.view"
      );

    expect(result).toBe(false);
  });

  it("should deny access when the supplied organization does not own the project", async () => {
    const ownerA = await createUser("project-tenant-owner-a@example.com");
    const ownerB = await createUser("project-tenant-owner-b@example.com");
    const developer = await createUser("project-tenant-developer@example.com");

    const organizationA = await createOrganization(ownerA.id);
    const organizationB = await createOrganization(ownerB.id);

    await addOrganizationMember(
      organizationA.id,
      developer.id
    );

    const projectId = await createProject(
      organizationA.id,
      ownerA.id
    );

    await addProjectMember(
      organizationA.id,
      projectId,
      developer.id,
      "developer"
    );

    const result =
      await permissionRepository.hasProjectPermission(
        organizationB.id,
        projectId,
        developer.id,
        "project.conversations.view"
      );

    expect(result).toBe(false);
  });

  it("should recognize permissions granted through a custom project role", async () => {
    const owner = await createUser("project-custom-owner@example.com");
    const member = await createUser("project-custom-member@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(
      organization.id,
      member.id
    );

    const projectId = await createProject(
      organization.id,
      owner.id
    );

    await testPool.query(
      `INSERT INTO project_members (
        project_id,
        organization_id,
        user_id,
        role,
        status
      )
      VALUES ($1, $2, $3, 'developer', 'active')`,
      [projectId, organization.id, member.id]
    );

    const customRole = await testPool.query<{ id: string }>(
      `INSERT INTO roles (
        organization_id,
        scope,
        key,
        name,
        description,
        is_system
      )
      VALUES (
        $1,
        'project',
        'custom_conversation_reader',
        'Custom Conversation Reader',
        'Custom project conversation permission test role',
        FALSE
      )
      RETURNING id`,
      [organization.id]
    );

    await testPool.query(
      `INSERT INTO role_permissions (
        role_id,
        permission_id
      )
      SELECT $1, id
      FROM permissions
      WHERE scope = 'project'
        AND key = 'project.conversations.view'`,
      [customRole.rows[0]!.id]
    );

    await testPool.query(
      `INSERT INTO project_member_roles (
        project_id,
        organization_id,
        user_id,
        role_id,
        assigned_by
      )
      VALUES ($1, $2, $3, $4, $5)`,
      [
        projectId,
        organization.id,
        member.id,
        customRole.rows[0]!.id,
        owner.id,
      ]
    );

    const result =
      await permissionRepository.hasProjectPermission(
        organization.id,
        projectId,
        member.id,
        "project.conversations.view"
      );

    expect(result).toBe(true);
  });

  it("should not apply a custom project role assigned in another project", async () => {
    const owner = await createUser("custom-project-isolation-owner@example.com");
    const member = await createUser("custom-project-isolation-member@example.com");

    const organization = await createOrganization(owner.id);

    await addOrganizationMember(organization.id, member.id);

    const projectA = await createProject(organization.id, owner.id);
    const projectB = await createProject(organization.id, owner.id);

    // Give the member active membership in both projects,
    // without assigning a built-in project role.
    await testPool.query(
      `INSERT INTO project_members (
      project_id, organization_id, user_id, role, status
    )
    VALUES
      ($1, $3, $2, 'developer', 'active'),
      ($4, $3, $2, 'developer', 'active')`,
      [projectA, member.id, organization.id, projectB]
    );

    const customRole = await testPool.query<{ id: string }>(
      `INSERT INTO roles (
      organization_id,
      scope,
      key,
      name,
      description,
      is_system
    )
    VALUES ($1, 'project', 'custom_project_isolation',
      'Custom Project Isolation', 'Project isolation test', FALSE)
    RETURNING id`,
      [organization.id]
    );

    await testPool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, id
     FROM permissions
     WHERE scope = 'project'
       AND key = 'project.conversations.view'`,
      [customRole.rows[0]!.id]
    );

    await testPool.query(
      `INSERT INTO project_member_roles (
      project_id, organization_id, user_id, role_id, assigned_by
    )
    VALUES ($1, $2, $3, $4, $5)`,
      [projectA, organization.id, member.id, customRole.rows[0]!.id, owner.id]
    );

    const result = await permissionRepository.hasProjectPermission(
      organization.id,
      projectB,
      member.id,
      "project.conversations.view"
    );

    expect(result).toBe(false);
  });
});

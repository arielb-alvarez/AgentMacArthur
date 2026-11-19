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
import { PostgresProjectRepository } from "../../src/projects/postgres-project.repository.js";
import { PostgresProjectMemberRepository } from "../../src/project-members/postgres-project-member.repository.js";
import { PostgresRoleAssignmentRepository } from "../../src/role-assignments/postgres-role-assignment.repository.js";
import { PostgresOrganizationPermissionRepository } from "../../src/permissions/postgres-organization-permission.repository.js";
import { OrganizationPermissionService } from "../../src/permissions/organization-permission.service.js";
import { PostgresRoleManagementRepository } from "../../src/role-management/postgres-role-management.repository.js";

import { ProjectService } from "../../src/projects/project.service.js";

describe("PostgresRoleManagementRepository integration", () => {
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

  const projectRepository = new PostgresProjectRepository(
    testPool,
    transactionManager
  );

  const projectMemberRepository =
    new PostgresProjectMemberRepository(
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

  const permissionService = new OrganizationPermissionService(
    permissionRepository
  );

  const projectService = new ProjectService(
    projectRepository,
    projectMemberRepository,
    organizationMemberRepository,
    roleAssignmentRepository,
    permissionService,
    transactionManager
  );

  const roleManagementRepository =
    new PostgresRoleManagementRepository(
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
      "createRoleManagementTestOrganization",
      async (client) => {
        const organization = await organizationRepository.create(
          {
            name: "Role Management Workspace",
            slug: `role-management-${crypto.randomUUID()}`,
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

  const createCustomRole = async (
    organizationId: string,
    scope: "organization" | "project",
    key = `custom_${crypto.randomUUID().replaceAll("-", "")}`
  ) => {
    return roleManagementRepository.createCustomRole({
      organizationId,
      scope,
      key,
      name: "Custom Test Role",
      description: "Role management integration test",
    });
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

  it("should create and retrieve an organization-owned custom role", async () => {
    const owner = await createUser("role-create@example.com");
    const organization = await createOrganization(owner.id);

    const role = await createCustomRole(
      organization.id,
      "organization",
      "custom_analyst"
    );

    expect(role).toMatchObject({
      organizationId: organization.id,
      scope: "organization",
      key: "custom_analyst",
      name: "Custom Test Role",
      description: "Role management integration test",
      isSystem: false,
    });

    const found = await roleManagementRepository.findById(
      organization.id,
      role.id
    );

    expect(found).toEqual(role);

    const foreignLookup = await roleManagementRepository.findById(
      crypto.randomUUID(),
      role.id
    );

    expect(foreignLookup).toBeUndefined();
  });

  it("should list custom roles by organization and optional scope", async () => {
    const owner = await createUser("role-list@example.com");
    const organization = await createOrganization(owner.id);

    await createCustomRole(
      organization.id,
      "organization",
      "custom_analyst"
    );

    await createCustomRole(
      organization.id,
      "project",
      "custom_reviewer"
    );

    const allRoles =
      await roleManagementRepository.findAllByOrganizationId(
        organization.id
      );

    expect(allRoles).toHaveLength(2);
    expect(allRoles.every((role) => !role.isSystem)).toBe(true);

    const organizationRoles =
      await roleManagementRepository.findAllByOrganizationId(
        organization.id,
        "organization"
      );

    expect(organizationRoles).toHaveLength(1);
    expect(organizationRoles[0]?.key).toBe("custom_analyst");

    const projectRoles =
      await roleManagementRepository.findAllByOrganizationId(
        organization.id,
        "project"
      );

    expect(projectRoles).toHaveLength(1);
    expect(projectRoles[0]?.key).toBe("custom_reviewer");
  });

  it("should update custom role metadata without changing its identity", async () => {
    const owner = await createUser("role-update@example.com");
    const organization = await createOrganization(owner.id);

    const role = await createCustomRole(
      organization.id,
      "organization",
      "custom_analyst"
    );

    const updated = await roleManagementRepository.updateCustomRole({
      organizationId: organization.id,
      roleId: role.id,
      name: "Updated Analyst",
      description: "Updated role description",
    });

    expect(updated).toMatchObject({
      id: role.id,
      organizationId: organization.id,
      scope: "organization",
      key: "custom_analyst",
      name: "Updated Analyst",
      description: "Updated role description",
      isSystem: false,
    });

    const unchangedDescription =
      await roleManagementRepository.updateCustomRole({
        organizationId: organization.id,
        roleId: role.id,
        name: "Renamed Analyst",
      });

    expect(unchangedDescription?.description).toBe(
      "Updated role description"
    );
  });

  it("should not update a custom role through another organization", async () => {
    const owner = await createUser("role-update-owner@example.com");
    const organization = await createOrganization(owner.id);

    const role = await createCustomRole(
      organization.id,
      "organization",
      "custom_analyst"
    );

    const updated = await roleManagementRepository.updateCustomRole({
      organizationId: crypto.randomUUID(),
      roleId: role.id,
      name: "Unauthorized Update",
    });

    expect(updated).toBeUndefined();

    const unchanged = await roleManagementRepository.findById(
      organization.id,
      role.id
    );

    expect(unchanged?.name).toBe("Custom Test Role");
  });

  it("should delete an unassigned custom role", async () => {
    const owner = await createUser("role-delete@example.com");
    const organization = await createOrganization(owner.id);

    const role = await createCustomRole(
      organization.id,
      "organization"
    );

    const result = await roleManagementRepository.deleteCustomRole(
      organization.id,
      role.id
    );

    expect(result).toBe("deleted");

    const found = await roleManagementRepository.findById(
      organization.id,
      role.id
    );

    expect(found).toBeUndefined();
  });

  it("should reject deleting a custom role assigned to an organization member", async () => {
    const owner = await createUser("role-assigned-owner@example.com");
    const member = await createUser("role-assigned-member@example.com");
    const organization = await createOrganization(owner.id);

    await organizationMemberRepository.create({
      organizationId: organization.id,
      userId: member.id,
      role: "member",
      status: "active",
    });

    await roleAssignmentRepository.assignOrganizationRole({
      organizationId: organization.id,
      userId: member.id,
      roleKey: "member",
      assignedBy: owner.id,
    });

    const role = await createCustomRole(
      organization.id,
      "organization"
    );

    await roleAssignmentRepository.assignOrganizationCustomRole({
      organizationId: organization.id,
      userId: member.id,
      roleId: role.id,
      assignedBy: owner.id,
    });

    const result = await roleManagementRepository.deleteCustomRole(
      organization.id,
      role.id
    );

    expect(result).toBe("assigned");

    const found = await roleManagementRepository.findById(
      organization.id,
      role.id
    );

    expect(found).toBeDefined();
  });

  it("should reject deleting a custom role assigned to a project member", async () => {
    const owner = await createUser("project-role-owner@example.com");
    const organization = await createOrganization(owner.id);

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Role Management Project",
    });

    const role = await createCustomRole(
      organization.id,
      "project"
    );

    await roleAssignmentRepository.assignProjectCustomRole({
      projectId: project.id,
      organizationId: organization.id,
      userId: owner.id,
      roleId: role.id,
      assignedBy: owner.id,
    });

    const result = await roleManagementRepository.deleteCustomRole(
      organization.id,
      role.id
    );

    expect(result).toBe("assigned");
  });

  it("should distinguish missing and foreign custom roles during deletion", async () => {
    const owner = await createUser("role-missing-owner@example.com");
    const organization = await createOrganization(owner.id);

    const role = await createCustomRole(
      organization.id,
      "organization"
    );

    const missing = await roleManagementRepository.deleteCustomRole(
      organization.id,
      crypto.randomUUID()
    );

    const foreign = await roleManagementRepository.deleteCustomRole(
      crypto.randomUUID(),
      role.id
    );

    expect(missing).toBe("not_found");
    expect(foreign).toBe("not_found");

    expect(
      await roleManagementRepository.findById(
        organization.id,
        role.id
      )
    ).toBeDefined();
  });

  it("should list the permission catalog for the requested scope", async () => {
    const organizationPermissions =
      await roleManagementRepository.findPermissionsByScope(
        "organization"
      );

    const projectPermissions =
      await roleManagementRepository.findPermissionsByScope(
        "project"
      );

    expect(organizationPermissions.length).toBeGreaterThan(0);
    expect(projectPermissions.length).toBeGreaterThan(0);

    expect(
      organizationPermissions.every(
        (permission) => permission.scope === "organization"
      )
    ).toBe(true);

    expect(
      projectPermissions.every(
        (permission) => permission.scope === "project"
      )
    ).toBe(true);
  });

  it("should replace custom role permissions and deduplicate permission IDs", async () => {
    const owner = await createUser("role-grants@example.com");
    const organization = await createOrganization(owner.id);

    const role = await createCustomRole(
      organization.id,
      "organization"
    );

    const permissions =
      await roleManagementRepository.findPermissionsByScope(
        "organization"
      );

    expect(permissions.length).toBeGreaterThanOrEqual(2);

    const selectedIds = [
      permissions[0]!.id,
      permissions[1]!.id,
    ];

    await roleManagementRepository.replacePermissions(
      organization.id,
      role.id,
      [...selectedIds, selectedIds[0]!]
    );

    const result = await testPool.query(
      `SELECT permission_id
       FROM role_permissions
       WHERE role_id = $1
       ORDER BY permission_id`,
      [role.id]
    );

    expect(result.rows).toHaveLength(2);
    expect(
      result.rows.map((row) => row.permission_id).sort()
    ).toEqual([...selectedIds].sort());
  });

  it("should preserve existing grants when permission scope validation fails", async () => {
    const owner = await createUser("role-scope-owner@example.com");
    const organization = await createOrganization(owner.id);

    const role = await createCustomRole(
      organization.id,
      "organization"
    );

    const organizationPermissions =
      await roleManagementRepository.findPermissionsByScope(
        "organization"
      );

    const projectPermissions =
      await roleManagementRepository.findPermissionsByScope(
        "project"
      );

    const existingPermissionId =
      organizationPermissions[0]!.id;

    const invalidPermissionId =
      projectPermissions[0]!.id;

    await roleManagementRepository.replacePermissions(
      organization.id,
      role.id,
      [existingPermissionId]
    );

    await expect(
      roleManagementRepository.replacePermissions(
        organization.id,
        role.id,
        [invalidPermissionId]
      )
    ).rejects.toThrow(
      "One or more permissions do not exist or do not match the custom role scope."
    );

    const result = await testPool.query(
      `SELECT permission_id
       FROM role_permissions
       WHERE role_id = $1`,
      [role.id]
    );

    expect(result.rows).toEqual([
      { permission_id: existingPermissionId },
    ]);
  });

  it("should reject replacing permissions for a role owned by another organization", async () => {
    const owner = await createUser("foreign-grant-owner@example.com");
    const organization = await createOrganization(owner.id);

    const role = await createCustomRole(
      organization.id,
      "organization"
    );

    await expect(
      roleManagementRepository.replacePermissions(
        crypto.randomUUID(),
        role.id,
        []
      )
    ).rejects.toThrow(
      "Custom role not found in the specified organization."
    );
  });
});

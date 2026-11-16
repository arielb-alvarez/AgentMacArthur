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
    const organization = await transactionManager.runInTransaction(
      "createPermissionTestOrganization",
      async (client) => {
        const created = await organizationRepository.create(
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
            organizationId: created.id,
            userId: ownerUserId,
            role: "owner",
            status: "active",
          },
          client
        );

        await roleAssignmentRepository.assignOrganizationRole(
          {
            organizationId: created.id,
            userId: ownerUserId,
            roleKey: "owner",
            assignedBy: ownerUserId,
          },
          client
        );

        return created;
      }
    );

    return organization;
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

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearIdentityTestDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

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

  it("should deny permissions to suspended members", async () => {
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
});

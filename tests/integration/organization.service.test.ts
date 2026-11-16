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
import { OrganizationPermissionService } from "../../src/permissions/organization-permission.service.js";

import { OrganizationService } from "../../src/organizations/organization.service.js";

describe("OrganizationService integration", () => {
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

  const organizationPermissionRepository =
    new PostgresOrganizationPermissionRepository(
      testPool,
      transactionManager
    );

  const organizationPermissionService =
    new OrganizationPermissionService(
      organizationPermissionRepository
    );

  const organizationService = new OrganizationService(
    organizationRepository,
    organizationMemberRepository,
    organizationPermissionService,
    transactionManager
  );

  const createUser = async (
    email: string,
    displayName = "Test User"
  ) => {
    return userRepository.create({
      email,
      passwordHash: "test-password-hash",
      displayName,
    });
  };

  const createOrganization = async (
    ownerUserId: string,
    slug: string
  ) => {
    return transactionManager.runInTransaction(
      "createTestOrganization",
      async (client) => {
        const organization = await organizationRepository.create(
          {
            name: `${slug} Workspace`,
            slug,
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
    role: "admin" | "member" = "member"
  ) => {
    return transactionManager.runInTransaction(
      "addOrganizationServiceTestMember",
      async (client) => {
        const member = await organizationMemberRepository.create(
          {
            organizationId,
            userId,
            role,
            status: "active",
          },
          client
        );

        await roleAssignmentRepository.assignOrganizationRole(
          {
            organizationId,
            userId,
            roleKey: role,
            assignedBy: userId,
          },
          client
        );

        return member;
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

  describe("list", () => {
    it("should list organizations accessible to the user", async () => {
      const owner = await createUser("owner@example.com");
      const member = await createUser("member@example.com");
      const otherOwner = await createUser("other@example.com");

      const organization = await createOrganization(
        owner.id,
        "first-workspace"
      );

      const otherOrganization = await createOrganization(
        otherOwner.id,
        "second-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      const memberOrganizations =
        await organizationService.list(member.id);

      expect(memberOrganizations).toHaveLength(1);
      expect(memberOrganizations[0]?.id).toBe(organization.id);
      expect(memberOrganizations[0]?.id).not.toBe(otherOrganization.id);
    });

    it("should not list organizations where membership is suspended", async () => {
      const owner = await createUser("owner@example.com");
      const member = await createUser("member@example.com");

      const organization = await createOrganization(
        owner.id,
        "suspended-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      await testPool.query(
        `UPDATE organization_members
         SET status = 'suspended'
         WHERE organization_id = $1
           AND user_id = $2`,
        [organization.id, member.id]
      );

      const organizations = await organizationService.list(member.id);

      expect(organizations).toHaveLength(0);
    });
  });

  describe("getById", () => {
    it("should allow active organization members to view an organization", async () => {
      const owner = await createUser("owner@example.com");
      const member = await createUser("member@example.com");

      const organization = await createOrganization(
        owner.id,
        "view-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      const result = await organizationService.getById(
        organization.id,
        member.id
      );

      expect(result.id).toBe(organization.id);
      expect(result.name).toBe(organization.name);
    });

    it("should deny suspended organization members", async () => {
      const owner = await createUser("owner@example.com");
      const member = await createUser("member@example.com");

      const organization = await createOrganization(
        owner.id,
        "restricted-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      await testPool.query(
        `UPDATE organization_members
         SET status = 'suspended'
         WHERE organization_id = $1
           AND user_id = $2`,
        [organization.id, member.id]
      );

      await expect(
        organizationService.getById(organization.id, member.id)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("should hide organizations from users without membership", async () => {
      const owner = await createUser("owner@example.com");
      const outsider = await createUser("outsider@example.com");

      const organization = await createOrganization(
        owner.id,
        "private-workspace"
      );

      await expect(
        organizationService.getById(organization.id, outsider.id)
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("update", () => {
    it("should allow organization owners to update organization details", async () => {
      const owner = await createUser("owner@example.com");

      const organization = await createOrganization(
        owner.id,
        "owner-update-workspace"
      );

      const updated = await organizationService.update(
        organization.id,
        owner.id,
        { name: "Updated Workspace" }
      );

      expect(updated.name).toBe("Updated Workspace");
      expect(updated.slug).toBe(organization.slug);
      expect(updated.ownerUserId).toBe(owner.id);
    });

    it("should allow organization admins to update organization details", async () => {
      const owner = await createUser("owner@example.com");
      const admin = await createUser("admin@example.com");

      const organization = await createOrganization(
        owner.id,
        "admin-update-workspace"
      );

      await addOrganizationMember(
        organization.id,
        admin.id,
        "admin"
      );

      const updated = await organizationService.update(
        organization.id,
        admin.id,
        { name: "Admin Updated Workspace" }
      );

      expect(updated.name).toBe("Admin Updated Workspace");
    });

    it("should deny regular members from updating organization details", async () => {
      const owner = await createUser("owner@example.com");
      const member = await createUser("member@example.com");

      const organization = await createOrganization(
        owner.id,
        "member-update-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      await expect(
        organizationService.update(
          organization.id,
          member.id,
          { name: "Unauthorized Update" }
        )
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      const unchanged = await organizationRepository.findById(
        organization.id
      );

      expect(unchanged?.name).toBe(organization.name);
    });

    it("should deny suspended members from updating organization details", async () => {
      const owner = await createUser("owner@example.com");
      const admin = await createUser("admin@example.com");

      const organization = await createOrganization(
        owner.id,
        "suspended-admin-workspace"
      );

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

      await expect(
        organizationService.update(
          organization.id,
          admin.id,
          { name: "Unauthorized Update" }
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});

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
    userRepository,
    roleAssignmentRepository,
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

  const activateUser = async (userId: string) => {
    await testPool.query(
      `UPDATE users
       SET status = 'active'
       WHERE id = $1`,
      [userId]
    );
  };

  const createOrganization = async (
    ownerUserId: string,
    slug: string,
    type: "team" | "personal" = "team"
  ) => {
    return transactionManager.runInTransaction(
      "createTestOrganization",
      async (client) => {
        const organization = await organizationRepository.create(
          {
            name: `${slug} Workspace`,
            slug,
            type,
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

    describe("transferOwnership", () => {
      it("should transfer ownership and synchronize all owner representations", async () => {
        const owner = await createUser("transfer-owner@example.com");
        const target = await createUser("transfer-target@example.com");

        await activateUser(target.id);

        const organization = await createOrganization(
          owner.id,
          "ownership-transfer-workspace"
        );

        await addOrganizationMember(organization.id, target.id, "member");

        const customRoleResult = await testPool.query<{ id: string }>(
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
            'organization',
            'workspace_auditor',
            'Workspace Auditor',
            'Custom role used to verify ownership transfer preservation.',
            FALSE
          )
          RETURNING id`,
          [organization.id]
        );

        const customRoleId = customRoleResult.rows[0]!.id;

        await testPool.query(
          `INSERT INTO organization_member_roles (
            organization_id,
            user_id,
            role_id,
            assigned_by
          )
          VALUES
            ($1, $2, $3, $4),
            ($1, $5, $3, $4)`,
          [
            organization.id,
            owner.id,
            customRoleId,
            owner.id,
            target.id,
          ]
        );

        const transferred = await organizationService.transferOwnership(
          organization.id,
          owner.id,
          target.id
        );

        expect(transferred.ownerUserId).toBe(target.id);

        const persistedOrganization = await organizationRepository.findById(
          organization.id
        );

        expect(persistedOrganization?.ownerUserId).toBe(target.id);

        const memberships = await testPool.query(
          `SELECT user_id, role, status
          FROM organization_members
          WHERE organization_id = $1
            AND user_id = ANY($2::uuid[])
          ORDER BY user_id`,
          [organization.id, [owner.id, target.id]]
        );

        const membershipByUserId = new Map(
          memberships.rows.map((row) => [row.user_id, row])
        );

        expect(membershipByUserId.get(owner.id)).toMatchObject({
          role: "admin",
          status: "active",
        });

        expect(membershipByUserId.get(target.id)).toMatchObject({
          role: "owner",
          status: "active",
        });

        expect(
          await roleAssignmentRepository.findOrganizationBaseRoles(
            organization.id,
            owner.id
          )
        ).toEqual(["admin"]);

        expect(
          await roleAssignmentRepository.findOrganizationBaseRoles(
            organization.id,
            target.id
          )
        ).toEqual(["owner"]);

        const ownerCount = await testPool.query(
          `SELECT COUNT(*)::int AS count
          FROM organization_members
          WHERE organization_id = $1
            AND role = 'owner'`,
          [organization.id]
        );

        expect(ownerCount.rows[0]?.count).toBe(1);

        const customAssignments = await testPool.query<{
          user_id: string;
          key: string;
        }>(
          `SELECT
              organization_member_roles.user_id,
              roles.key
            FROM organization_member_roles
            INNER JOIN roles
              ON roles.id = organization_member_roles.role_id
            WHERE organization_member_roles.organization_id = $1
              AND organization_member_roles.user_id = ANY($2::uuid[])
              AND roles.is_system = FALSE
            ORDER BY organization_member_roles.user_id`,
          [organization.id, [owner.id, target.id]]
        );

        const customRolesByUserId = new Map(
          customAssignments.rows.map((row) => [row.user_id, row.key])
        );

        expect(customRolesByUserId.get(owner.id)).toBe("workspace_auditor");
        expect(customRolesByUserId.get(target.id)).toBe("workspace_auditor");
      });

      it("should deny an admin from transferring ownership", async () => {
        const owner = await createUser("admin-transfer-owner@example.com");
        const admin = await createUser("admin-transfer-admin@example.com");
        const target = await createUser("admin-transfer-target@example.com");

        const organization = await createOrganization(
          owner.id,
          "admin-transfer-workspace"
        );

        await addOrganizationMember(organization.id, admin.id, "admin");
        await addOrganizationMember(organization.id, target.id, "member");

        await expect(
          organizationService.transferOwnership(
            organization.id,
            admin.id,
            target.id
          )
        ).rejects.toMatchObject({
          statusCode: 403,
        });

        const unchanged = await organizationRepository.findById(
          organization.id
        );

        expect(unchanged?.ownerUserId).toBe(owner.id);

        expect(
          await roleAssignmentRepository.findOrganizationBaseRoles(
            organization.id,
            owner.id
          )
        ).toEqual(["owner"]);

        expect(
          await roleAssignmentRepository.findOrganizationBaseRoles(
            organization.id,
            target.id
          )
        ).toEqual(["member"]);
      });

      it("should roll back the transfer when the target already owns another personal organization", async () => {
        const currentOwner = await createUser(
          "personal-transfer-current-owner@example.com"
        );
        const target = await createUser(
          "personal-transfer-target@example.com"
        );

        await activateUser(target.id);

        const sourceOrganization = await createOrganization(
          currentOwner.id,
          "personal-transfer-source",
          "personal"
        );

        await createOrganization(
          target.id,
          "personal-transfer-existing",
          "personal"
        );

        await addOrganizationMember(
          sourceOrganization.id,
          target.id,
          "member"
        );

        await expect(
          organizationService.transferOwnership(
            sourceOrganization.id,
            currentOwner.id,
            target.id
          )
        ).rejects.toMatchObject({
          statusCode: 409,
        });

        const unchangedOrganization = await organizationRepository.findById(
          sourceOrganization.id
        );

        expect(unchangedOrganization?.ownerUserId).toBe(currentOwner.id);

        const memberships = await testPool.query(
          `SELECT user_id, role
          FROM organization_members
          WHERE organization_id = $1
            AND user_id = ANY($2::uuid[])`,
          [sourceOrganization.id, [currentOwner.id, target.id]]
        );

        const membershipByUserId = new Map(
          memberships.rows.map((row) => [row.user_id, row.role])
        );

        expect(membershipByUserId.get(currentOwner.id)).toBe("owner");
        expect(membershipByUserId.get(target.id)).toBe("member");

        expect(
          await roleAssignmentRepository.findOrganizationBaseRoles(
            sourceOrganization.id,
            currentOwner.id
          )
        ).toEqual(["owner"]);

        expect(
          await roleAssignmentRepository.findOrganizationBaseRoles(
            sourceOrganization.id,
            target.id
          )
        ).toEqual(["member"]);
      });
    });
  });
});

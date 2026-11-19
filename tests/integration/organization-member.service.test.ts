import { randomUUID } from "node:crypto";

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
import { PostgresProjectRepository } from "../../src/projects/postgres-project.repository.js";
import { PostgresProjectMemberRepository } from "../../src/project-members/postgres-project-member.repository.js";

import { OrganizationMemberService } from "../../src/organization-members/organization-member.service.js";
import { OrganizationPermissionService } from "../../src/permissions/organization-permission.service.js";
import { ProjectService } from "../../src/projects/project.service.js";

describe("OrganizationMemberService integration", () => {
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

  const organizationPermissionRepository =
    new PostgresOrganizationPermissionRepository(
      testPool,
      transactionManager
    );

  const organizationPermissionService =
    new OrganizationPermissionService(
      organizationPermissionRepository
    );

  const organizationMemberService = new OrganizationMemberService(
    organizationRepository,
    organizationMemberRepository,
    organizationPermissionService,
    userRepository,
    roleAssignmentRepository,
    transactionManager
  );

  const projectService = new ProjectService(
    projectRepository,
    projectMemberRepository,
    organizationMemberRepository,
    roleAssignmentRepository,
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
      "addTestOrganizationMember",
      async (client) => {
        const membership = await organizationMemberRepository.create(
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

        return membership;
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

  describe("listMembers", () => {
    it("should allow an owner to view the basic member directory", async () => {
      const owner = await createUser("owner@example.com", "Workspace Owner");
      const member = await createUser("member@example.com", "Workspace Member");

      const organization = await createOrganization(
        owner.id,
        "owner-directory-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      const members = await organizationMemberService.listMembers(
        organization.id,
        owner.id
      );

      expect(members).toHaveLength(2);
      expect(members).toEqual(
        expect.arrayContaining([
          {
            userId: owner.id,
            displayName: "Workspace Owner",
          },
          {
            userId: member.id,
            displayName: "Workspace Member",
          },
        ])
      );

      for (const entry of members) {
        expect(Object.keys(entry).sort()).toEqual([
          "displayName",
          "userId",
        ]);
      }
    });

    it("should allow an admin to view the basic member directory", async () => {
      const owner = await createUser("admin-owner@example.com");
      const admin = await createUser(
        "admin@example.com",
        "Workspace Admin"
      );

      const organization = await createOrganization(
        owner.id,
        "admin-directory-workspace"
      );

      await addOrganizationMember(
        organization.id,
        admin.id,
        "admin"
      );

      const members = await organizationMemberService.listMembers(
        organization.id,
        admin.id
      );

      expect(members).toHaveLength(2);
      expect(members).toContainEqual({
        userId: admin.id,
        displayName: "Workspace Admin",
      });
    });

    it("should allow an ordinary member to view the basic member directory", async () => {
      const owner = await createUser("member-owner@example.com");
      const member = await createUser(
        "ordinary-member@example.com",
        "Ordinary Member"
      );

      const organization = await createOrganization(
        owner.id,
        "member-directory-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      const members = await organizationMemberService.listMembers(
        organization.id,
        member.id
      );

      expect(members).toHaveLength(2);
      expect(members).toContainEqual({
        userId: member.id,
        displayName: "Ordinary Member",
      });
    });

    it("should include suspended target memberships without exposing membership status", async () => {
      const owner = await createUser("suspended-target-owner@example.com");
      const member = await createUser(
        "suspended-target@example.com",
        "Suspended Target"
      );

      const organization = await createOrganization(
        owner.id,
        "suspended-target-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      await testPool.query(
        `UPDATE organization_members
         SET status = 'suspended'
         WHERE organization_id = $1
           AND user_id = $2`,
        [organization.id, member.id]
      );

      const members = await organizationMemberService.listMembers(
        organization.id,
        owner.id
      );

      const suspendedMember = members.find(
        (item) => item.userId === member.id
      );

      expect(suspendedMember).toEqual({
        userId: member.id,
        displayName: "Suspended Target",
      });
    });

    it("should reject suspended requesters", async () => {
      const owner = await createUser("suspended-requester-owner@example.com");
      const member = await createUser("suspended-requester@example.com");

      const organization = await createOrganization(
        owner.id,
        "suspended-requester-workspace"
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
        organizationMemberService.listMembers(
          organization.id,
          member.id
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("should reject users without organization membership", async () => {
      const owner = await createUser("outsider-owner@example.com");
      const outsider = await createUser("outsider@example.com");

      const organization = await createOrganization(
        owner.id,
        "outsider-workspace"
      );

      await expect(
        organizationMemberService.listMembers(
          organization.id,
          outsider.id
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("should return 404 when the organization does not exist", async () => {
      const requester = await createUser("missing-org-requester@example.com");

      await expect(
        organizationMemberService.listMembers(
          randomUUID(),
          requester.id
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("getMember", () => {
    it("should allow an owner to view extended member details", async () => {
      const owner = await createUser("details-owner@example.com");
      const admin = await createUser(
        "details-admin@example.com",
        "Workspace Admin"
      );

      const organization = await createOrganization(
        owner.id,
        "owner-details-workspace"
      );

      await addOrganizationMember(
        organization.id,
        admin.id,
        "admin"
      );

      const result = await organizationMemberService.getMember(
        organization.id,
        admin.id,
        owner.id
      );

      expect(result).toMatchObject({
        organizationId: organization.id,
        userId: admin.id,
        email: "details-admin@example.com",
        displayName: "Workspace Admin",
        userStatus: "pending",
        status: "active",
        roles: [
          expect.objectContaining({
            key: "admin",
            name: "Organization Admin",
            isSystem: true,
          }),
        ],
      });

      expect(result.joinedAt).toBeInstanceOf(Date);
    });

    it("should deny extended details to an admin by default", async () => {
      const owner = await createUser("admin-details-owner@example.com");
      const admin = await createUser("admin-details@example.com");
      const target = await createUser("admin-details-target@example.com");

      const organization = await createOrganization(
        owner.id,
        "admin-details-workspace"
      );

      await addOrganizationMember(
        organization.id,
        admin.id,
        "admin"
      );

      await addOrganizationMember(organization.id, target.id);

      await expect(
        organizationMemberService.getMember(
          organization.id,
          target.id,
          admin.id
        )
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("should deny extended details to an ordinary member by default", async () => {
      const owner = await createUser("member-details-owner@example.com");
      const member = await createUser("member-details@example.com");
      const target = await createUser("member-details-target@example.com");

      const organization = await createOrganization(
        owner.id,
        "member-details-workspace"
      );

      await addOrganizationMember(organization.id, member.id);
      await addOrganizationMember(organization.id, target.id);

      await expect(
        organizationMemberService.getMember(
          organization.id,
          target.id,
          member.id
        )
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("should return 404 when the requested user is not an organization member", async () => {
      const owner = await createUser("missing-member-owner@example.com");
      const outsider = await createUser("missing-member-outsider@example.com");

      const organization = await createOrganization(
        owner.id,
        "missing-member-workspace"
      );

      await expect(
        organizationMemberService.getMember(
          organization.id,
          outsider.id,
          owner.id
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("should reject requesters without active organization membership", async () => {
      const owner = await createUser("unauthorized-owner@example.com");
      const outsider = await createUser("unauthorized-outsider@example.com");

      const organization = await createOrganization(
        owner.id,
        "unauthorized-member-workspace"
      );

      await expect(
        organizationMemberService.getMember(
          organization.id,
          owner.id,
          outsider.id
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("should reject suspended requesters", async () => {
      const owner = await createUser("details-suspended-owner@example.com");
      const member = await createUser("details-suspended@example.com");

      const organization = await createOrganization(
        owner.id,
        "details-suspended-workspace"
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
        organizationMemberService.getMember(
          organization.id,
          owner.id,
          member.id
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("should return 404 when the organization does not exist", async () => {
      const requester = await createUser("details-missing-org@example.com");
      const target = await createUser("details-missing-target@example.com");

      await expect(
        organizationMemberService.getMember(
          randomUUID(),
          target.id,
          requester.id
        )
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("membership lifecycle", () => {
    it("allows the owner to suspend an ordinary member", async () => {
      const owner = await createUser("lifecycle-owner@example.com");
      const member = await createUser("lifecycle-member@example.com");

      const organization = await createOrganization(
        owner.id,
        "lifecycle-suspend-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      const result = await organizationMemberService.suspendMember(
        organization.id,
        member.id,
        owner.id
      );

      expect(result.status).toBe("suspended");

      const persisted =
        await organizationMemberRepository.findByOrganizationAndUser(
          organization.id,
          member.id
        );

      expect(persisted?.status).toBe("suspended");

      const baseRoles =
        await roleAssignmentRepository.findOrganizationBaseRoles(
          organization.id,
          member.id
        );

      expect(baseRoles).toEqual(["member"]);
    });

    it("allows an admin to suspend an ordinary member", async () => {
      const owner = await createUser("lifecycle-admin-owner@example.com");
      const admin = await createUser("lifecycle-admin@example.com");
      const member = await createUser("lifecycle-admin-member@example.com");

      const organization = await createOrganization(
        owner.id,
        "lifecycle-admin-suspend-workspace"
      );

      await addOrganizationMember(organization.id, admin.id, "admin");
      await addOrganizationMember(organization.id, member.id);

      const result = await organizationMemberService.suspendMember(
        organization.id,
        member.id,
        admin.id
      );

      expect(result.status).toBe("suspended");
    });

    it("prevents an admin from suspending another admin", async () => {
      const owner = await createUser("lifecycle-two-admin-owner@example.com");
      const admin = await createUser("lifecycle-first-admin@example.com");
      const anotherAdmin = await createUser(
        "lifecycle-second-admin@example.com"
      );

      const organization = await createOrganization(
        owner.id,
        "lifecycle-two-admin-workspace"
      );

      await addOrganizationMember(organization.id, admin.id, "admin");
      await addOrganizationMember(
        organization.id,
        anotherAdmin.id,
        "admin"
      );

      await expect(
        organizationMemberService.suspendMember(
          organization.id,
          anotherAdmin.id,
          admin.id
        )
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      const persisted =
        await organizationMemberRepository.findByOrganizationAndUser(
          organization.id,
          anotherAdmin.id
        );

      expect(persisted?.status).toBe("active");
    });

    it("allows the owner to reactivate a suspended member with an active user account", async () => {
      const owner = await createUser("lifecycle-reactivate-owner@example.com");
      const member = await createUser(
        "lifecycle-reactivate-member@example.com"
      );

      const organization = await createOrganization(
        owner.id,
        "lifecycle-reactivate-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      await testPool.query(
        `UPDATE users
         SET status = 'active'
         WHERE id = $1`,
        [member.id]
      );

      await testPool.query(
        `UPDATE organization_members
         SET status = 'suspended'
         WHERE organization_id = $1
           AND user_id = $2`,
        [organization.id, member.id]
      );

      const result = await organizationMemberService.reactivateMember(
        organization.id,
        member.id,
        owner.id
      );

      expect(result.status).toBe("active");

      const persisted =
        await organizationMemberRepository.findByOrganizationAndUser(
          organization.id,
          member.id
        );

      expect(persisted?.status).toBe("active");

      const baseRoles =
        await roleAssignmentRepository.findOrganizationBaseRoles(
          organization.id,
          member.id
        );

      expect(baseRoles).toEqual(["member"]);
    });

    it("rejects reactivation when the target user account is not active", async () => {
      const owner = await createUser("lifecycle-inactive-owner@example.com");
      const member = await createUser(
        "lifecycle-inactive-member@example.com"
      );

      const organization = await createOrganization(
        owner.id,
        "lifecycle-inactive-workspace"
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
        organizationMemberService.reactivateMember(
          organization.id,
          member.id,
          owner.id
        )
      ).rejects.toMatchObject({
        statusCode: 409,
      });

      const persisted =
        await organizationMemberRepository.findByOrganizationAndUser(
          organization.id,
          member.id
        );

      expect(persisted?.status).toBe("suspended");
    });

    it("allows the owner to promote and demote an ordinary member", async () => {
      const owner = await createUser("lifecycle-role-owner@example.com");
      const member = await createUser("lifecycle-role-member@example.com");

      const organization = await createOrganization(
        owner.id,
        "lifecycle-role-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      const promoted = await organizationMemberService.changeMemberRole(
        organization.id,
        member.id,
        "admin",
        owner.id
      );

      expect(promoted.role).toBe("admin");

      let baseRoles =
        await roleAssignmentRepository.findOrganizationBaseRoles(
          organization.id,
          member.id
        );

      expect(baseRoles).toEqual(["admin"]);

      const demoted = await organizationMemberService.changeMemberRole(
        organization.id,
        member.id,
        "member",
        owner.id
      );

      expect(demoted.role).toBe("member");

      baseRoles =
        await roleAssignmentRepository.findOrganizationBaseRoles(
          organization.id,
          member.id
        );

      expect(baseRoles).toEqual(["member"]);
    });

    it("preserves organization and project roles and memberships when a member is suspended and reactivated", async () => {
      const owner = await createUser(
        "lifecycle-preservation-owner@example.com"
      );
      const member = await createUser(
        "lifecycle-preservation-member@example.com"
      );

      const organization = await createOrganization(
        owner.id,
        "lifecycle-preservation-workspace"
      );

      await addOrganizationMember(organization.id, member.id);

      // Create and assign a custom organization role.
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
      'custom_analyst',
      'Custom Analyst',
      'Organization-specific test role',
      FALSE
    )
    RETURNING id`,
        [organization.id]
      );

      await testPool.query(
        `INSERT INTO organization_member_roles (
      organization_id,
      user_id,
      role_id,
      assigned_by
    )
    VALUES ($1, $2, $3, $4)`,
        [organization.id, member.id, customRoleResult.rows[0]!.id, owner.id]
      );

      // Create a project and assign the member to it.
      const project = await projectService.create(owner.id, {
        organizationId: organization.id,
        name: "Lifecycle Preservation Project",
      });

      await projectMemberRepository.create({
        projectId: project.id,
        organizationId: organization.id,
        userId: member.id,
        role: "developer",
        status: "active",
      });

      await roleAssignmentRepository.assignProjectRole({
        projectId: project.id,
        organizationId: organization.id,
        userId: member.id,
        roleKey: "developer",
        assignedBy: owner.id,
      });

      // Suspend the organization membership.
      await organizationMemberService.suspendMember(
        organization.id,
        member.id,
        owner.id
      );

      // Organization base and custom roles must both remain assigned.
      const organizationRoleRows = await testPool.query<{
        key: string;
        is_system: boolean;
      }>(
        `SELECT r.key, r.is_system
     FROM organization_member_roles omr
     INNER JOIN roles r ON r.id = omr.role_id
     WHERE omr.organization_id = $1
       AND omr.user_id = $2
     ORDER BY r.key`,
        [organization.id, member.id]
      );

      expect(organizationRoleRows.rows).toEqual([
        { key: "custom_analyst", is_system: false },
        { key: "member", is_system: true },
      ]);

      // Project membership must remain unchanged.
      const projectMembership =
        await projectMemberRepository.findByProjectAndUser(
          project.id,
          member.id
        );

      expect(projectMembership).toMatchObject({
        projectId: project.id,
        organizationId: organization.id,
        userId: member.id,
        role: "developer",
        status: "active",
      });

      // Project role assignment must remain unchanged.
      const projectRoleRows = await testPool.query<{ key: string }>(
        `SELECT r.key
     FROM project_member_roles pmr
     INNER JOIN roles r ON r.id = pmr.role_id
     WHERE pmr.project_id = $1
       AND pmr.user_id = $2`,
        [project.id, member.id]
      );

      expect(projectRoleRows.rows.map((row) => row.key)).toEqual([
        "developer",
      ]);

      // Organization suspension must deny project access.
      await expect(
        projectService.getById(project.id, member.id)
      ).rejects.toMatchObject({ statusCode: 404 });

      // The test user must have an active account before reactivation.
      await testPool.query(
        `UPDATE users
     SET status = 'active'
     WHERE id = $1`,
        [member.id]
      );

      await organizationMemberService.reactivateMember(
        organization.id,
        member.id,
        owner.id
      );

      // Reactivation must restore access without recreating role records.
      await expect(
        projectService.getById(project.id, member.id)
      ).resolves.toMatchObject({ id: project.id });

      const organizationRolesAfterReactivation =
        await testPool.query<{ key: string; is_system: boolean }>(
          `SELECT r.key, r.is_system
       FROM organization_member_roles omr
       INNER JOIN roles r ON r.id = omr.role_id
       WHERE omr.organization_id = $1
         AND omr.user_id = $2
       ORDER BY r.key`,
          [organization.id, member.id]
        );

      expect(organizationRolesAfterReactivation.rows).toEqual([
        { key: "custom_analyst", is_system: false },
        { key: "member", is_system: true },
      ]);

      const projectMembershipAfterReactivation =
        await projectMemberRepository.findByProjectAndUser(
          project.id,
          member.id
        );

      expect(projectMembershipAfterReactivation).toMatchObject({
        projectId: project.id,
        organizationId: organization.id,
        userId: member.id,
        role: "developer",
        status: "active",
      });

      const projectRolesAfterReactivation =
        await testPool.query<{ key: string }>(
          `SELECT r.key
       FROM project_member_roles pmr
       INNER JOIN roles r ON r.id = pmr.role_id
       WHERE pmr.project_id = $1
         AND pmr.user_id = $2`,
          [project.id, member.id]
        );

      expect(projectRolesAfterReactivation.rows.map((row) => row.key)).toEqual([
        "developer",
      ]);
    });
  });
});

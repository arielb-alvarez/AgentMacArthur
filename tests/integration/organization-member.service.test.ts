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

import { OrganizationMemberService } from "../../src/organization-members/organization-member.service.js";

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

  const roleAssignmentRepository =
    new PostgresRoleAssignmentRepository(
      testPool,
      transactionManager
    );

  const organizationMemberService = new OrganizationMemberService(
    organizationRepository,
    organizationMemberRepository,
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
    it("should list members of an organization for an active member", async () => {
      const owner = await createUser("owner@example.com");
      const member = await createUser("member@example.com");

      const organization = await createOrganization(
        owner.id,
        "list-members-workspace"
      );

      await addOrganizationMember(
        organization.id,
        member.id
      );

      const members = await organizationMemberService.listMembers(
        organization.id,
        owner.id
      );

      expect(members).toHaveLength(2);

      const memberDetails = members.find(
        (item) => item.userId === member.id
      );

      expect(memberDetails).toMatchObject({
        organizationId: organization.id,
        userId: member.id,
        email: "member@example.com",
        displayName: "Test User",
        status: "active",
        roles: [
          expect.objectContaining({
            key: "member",
            isSystem: true,
          }),
        ],
      });
    });

    it("should include suspended members in the organization member list", async () => {
      const owner = await createUser("owner@example.com");
      const member = await createUser("suspended@example.com");

      const organization = await createOrganization(
        owner.id,
        "suspended-target-workspace"
      );

      await addOrganizationMember(
        organization.id,
        member.id
      );

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

      expect(suspendedMember?.status).toBe("suspended");
    });

    it("should reject suspended requesters", async () => {
      const owner = await createUser("owner@example.com");
      const member = await createUser("suspended-requester@example.com");

      const organization = await createOrganization(
        owner.id,
        "suspended-requester-workspace"
      );

      await addOrganizationMember(
        organization.id,
        member.id
      );

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
      const owner = await createUser("owner@example.com");
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
      const requester = await createUser("requester@example.com");

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
    it("should return member details including assigned roles", async () => {
      const owner = await createUser("owner@example.com");
      const member = await createUser(
        "admin@example.com",
        "Workspace Admin"
      );

      const organization = await createOrganization(
        owner.id,
        "get-member-workspace"
      );

      await addOrganizationMember(
        organization.id,
        member.id,
        "admin"
      );

      const result = await organizationMemberService.getMember(
        organization.id,
        member.id,
        owner.id
      );

      expect(result).toMatchObject({
        organizationId: organization.id,
        userId: member.id,
        email: "admin@example.com",
        displayName: "Workspace Admin",
        userStatus: "pending",
        status: "active",
        roles: [
            expect.objectContaining({
            key: "admin",
            name: "Organization Admin",
            description: "Manages organization settings and membership.",
            isSystem: true,
            }),
        ],
      });

      expect(result.joinedAt).toBeInstanceOf(Date);
    });

    it("should return 404 when the requested user is not an organization member", async () => {
      const owner = await createUser("owner@example.com");
      const outsider = await createUser("outsider@example.com");

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
      const owner = await createUser("owner@example.com");
      const outsider = await createUser("outsider@example.com");

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

    it("should return 404 when the organization does not exist", async () => {
      const requester = await createUser("requester@example.com");
      const target = await createUser("target@example.com");

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
});

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { testPool } from "../../src/config/test-database.js";
import {
  clearIdentityTestDatabase,
  setupTestDatabase,
} from "../helpers/database-setup.js";

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresOrganizationRepository } from "../../src/organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../../src/organization-members/postgres-organization-member.repository.js";
import { PostgresRoleAssignmentRepository } from "../../src/role-assignments/postgres-role-assignment.repository.js";

import type { CreateOrganizationInput } from "../../src/organizations/organization.types.js";

describe("PostgresOrganizationMemberRepository", () => {
  const userRepository = new PostgresUserRepository(testPool);
  const organizationRepository =
    new PostgresOrganizationRepository(testPool);
  const repository =
    new PostgresOrganizationMemberRepository(testPool);

  const createOwner = async (email = "owner@example.com") => {
    return userRepository.create({
      email,
      passwordHash: "test-password-hash",
      displayName: "Alex",
    });
  };

  const createOrganizationInput = (
    ownerUserId: string,
    slug = "alex-workspace"
  ): CreateOrganizationInput => ({
    name: "Alex's Workspace",
    slug,
    type: "personal",
    ownerUserId,
  });

  // Creates an organization and its owner membership atomically.
  const createOrganizationForOwner = async (
    ownerUserId: string,
    slug = "alex-workspace"
  ) => {
    const client = await testPool.connect();

    try {
      await client.query("BEGIN");

      const organization = await organizationRepository.create(
        createOrganizationInput(ownerUserId, slug),
        client
      );

      const membership = await repository.create(
        {
          organizationId: organization.id,
          userId: ownerUserId,
          role: "owner",
          status: "active",
        },
        client
      );

      await client.query("COMMIT");

      return { organization, membership };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  const roleAssignmentRepository =
    new PostgresRoleAssignmentRepository(testPool);

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearIdentityTestDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it("should create an organization membership", async () => {
    const user = await createOwner();

    const { organization, membership } =
      await createOrganizationForOwner(user.id);

    expect(membership.organizationId).toBe(organization.id);
    expect(membership.userId).toBe(user.id);
    expect(membership.role).toBe("owner");
    expect(membership.status).toBe("active");
    expect(membership.joinedAt).toBeInstanceOf(Date);
  });

  it("should update an organization membership status", async () => {
    const owner = await createOwner();
    const { organization } = await createOrganizationForOwner(owner.id);

    const member = await userRepository.create({
      email: "member@example.com",
      passwordHash: "test-password-hash",
      displayName: "Member",
    });

    await repository.create({
      organizationId: organization.id,
      userId: member.id,
      role: "member",
      status: "active",
    });

    const updated = await repository.updateStatus(
      organization.id,
      member.id,
      "suspended"
    );

    expect(updated).toMatchObject({
      organizationId: organization.id,
      userId: member.id,
      role: "member",
      status: "suspended",
    });
    expect(updated?.joinedAt).toBeInstanceOf(Date);

    const persisted = await repository.findByOrganizationAndUser(
      organization.id,
      member.id
    );

    expect(persisted?.status).toBe("suspended");
  });

  it("should update an organization membership legacy role", async () => {
    const owner = await createOwner();
    const { organization } = await createOrganizationForOwner(owner.id);

    const member = await userRepository.create({
      email: "member@example.com",
      passwordHash: "test-password-hash",
      displayName: "Member",
    });

    await repository.create({
      organizationId: organization.id,
      userId: member.id,
      role: "member",
      status: "active",
    });

    const updated = await repository.updateRole(
      organization.id,
      member.id,
      "admin"
    );

    expect(updated).toMatchObject({
      organizationId: organization.id,
      userId: member.id,
      role: "admin",
      status: "active",
    });
    expect(updated?.joinedAt).toBeInstanceOf(Date);

    const persisted = await repository.findByOrganizationAndUser(
      organization.id,
      member.id
    );

    expect(persisted?.role).toBe("admin");
  });

  it("should return undefined when updating the status of a missing membership", async () => {
    const result = await repository.updateStatus(
      "00000000-0000-4000-8000-000000000000",
      "00000000-0000-4000-8000-000000000000",
      "suspended"
    );

    expect(result).toBeUndefined();
  });

  it("should return undefined when updating the role of a missing membership", async () => {
    const result = await repository.updateRole(
      "00000000-0000-4000-8000-000000000000",
      "00000000-0000-4000-8000-000000000000",
      "admin"
    );

    expect(result).toBeUndefined();
  });

  it("should find a member by organization ID and user ID", async () => {
    const user = await createOwner();

    const { organization, membership } =
      await createOrganizationForOwner(user.id);

    const result = await repository.findByOrganizationAndUser(
      organization.id,
      user.id
    );

    expect(result).toEqual(membership);
  });

  it("should return undefined for a missing membership", async () => {
    const user = await createOwner();

    const { organization } =
      await createOrganizationForOwner(user.id);

    const anotherUser = await userRepository.create({
      email: "another@example.com",
      passwordHash: "test-password-hash",
      displayName: "Another User",
    });

    const result = await repository.findByOrganizationAndUser(
      organization.id,
      anotherUser.id
    );

    expect(result).toBeUndefined();
  });

  it("should find all organization memberships for a user", async () => {
    const firstOwner = await createOwner("first@example.com");
    const secondOwner = await createOwner("second@example.com");

    const first = await createOrganizationForOwner(
      firstOwner.id,
      "first-workspace"
    );

    const second = await createOrganizationForOwner(
      secondOwner.id,
      "second-workspace"
    );

    const user = await userRepository.create({
      email: "member@example.com",
      passwordHash: "test-password-hash",
      displayName: "Member",
    });

    await repository.create({
      organizationId: first.organization.id,
      userId: user.id,
      role: "member",
      status: "active",
    });

    await repository.create({
      organizationId: second.organization.id,
      userId: user.id,
      role: "admin",
      status: "active",
    });

    const memberships = await repository.findByUserId(user.id);

    expect(memberships).toHaveLength(2);
    expect(
      memberships.map((membership) => membership.organizationId)
    ).toEqual(
      expect.arrayContaining([
        first.organization.id,
        second.organization.id,
      ])
    );
  });

  it("should return an empty array when a user has no memberships", async () => {
    const user = await createOwner();

    const memberships = await repository.findByUserId(user.id);

    expect(memberships).toEqual([]);
  });

  it("should reject duplicate membership for the same organization and user", async () => {
    const user = await createOwner();

    const { organization } =
      await createOrganizationForOwner(user.id);

    await expect(
      repository.create({
        organizationId: organization.id,
        userId: user.id,
        role: "owner",
        status: "active",
      })
    ).rejects.toThrow();
  });

  it("should list only basic directory fields, including suspended members", async () => {
    const owner = await createOwner();

    const { organization } =
      await createOrganizationForOwner(owner.id);

    const activeMember = await userRepository.create({
      email: "active@example.com",
      passwordHash: "test-password-hash",
      displayName: "Taylor",
    });

    const suspendedMember = await userRepository.create({
      email: "suspended@example.com",
      passwordHash: "test-password-hash",
      displayName: "Jordan",
    });

    await repository.create({
      organizationId: organization.id,
      userId: activeMember.id,
      role: "member",
      status: "active",
    });

    await repository.create({
      organizationId: organization.id,
      userId: suspendedMember.id,
      role: "member",
      status: "suspended",
    });

    const members = await repository.findAllBasicByOrganizationId(
      organization.id
    );

    expect(members).toHaveLength(3);

    expect(members).toEqual(
      expect.arrayContaining([
        {
          userId: owner.id,
          displayName: owner.displayName,
        },
        {
          userId: activeMember.id,
          displayName: activeMember.displayName,
        },
        {
          userId: suspendedMember.id,
          displayName: suspendedMember.displayName,
        },
      ])
    );

    for (const member of members) {
      expect(Object.keys(member).sort()).toEqual([
        "displayName",
        "userId",
      ]);
    }
  });

  it("should return an empty basic directory for an organization without members", async () => {
    const members = await repository.findAllBasicByOrganizationId(
      "00000000-0000-4000-8000-000000000000"
    );

    expect(members).toEqual([]);
  });

  it("should list organization members with their assigned roles", async () => {
    const owner = await createOwner();

    const { organization } =
      await createOrganizationForOwner(owner.id);

    const member = await userRepository.create({
      email: "member@example.com",
      passwordHash: "test-password-hash",
      displayName: "Taylor",
    });

    await repository.create({
      organizationId: organization.id,
      userId: member.id,
      role: "member",
      status: "active",
    });

    await roleAssignmentRepository.assignOrganizationRole({
      organizationId: organization.id,
      userId: member.id,
      roleKey: "admin",
      assignedBy: owner.id,
    });

    await roleAssignmentRepository.assignOrganizationRole({
      organizationId: organization.id,
      userId: member.id,
      roleKey: "member",
      assignedBy: owner.id,
    });

    const members = await repository.findAllByOrganizationId(
      organization.id
    );

    expect(members).toHaveLength(2);

    const result = members.find(
      (item) => item.userId === member.id
    );

    expect(result).toBeDefined();
    expect(result?.email).toBe(member.email);
    expect(result?.displayName).toBe(member.displayName);
    expect(result?.status).toBe("active");
    expect(result?.roles).toHaveLength(2);
    expect(result?.roles.map((role) => role.key)).toEqual(
      expect.arrayContaining(["admin", "member"])
    );
  });

  it("should return an empty roles array for a member without assigned roles", async () => {
    const owner = await createOwner();

    const { organization } =
      await createOrganizationForOwner(owner.id);

    const result =
      await repository.findDetailsByOrganizationAndUser(
        organization.id,
        owner.id
      );

    expect(result).toBeDefined();
    expect(result?.userId).toBe(owner.id);
    expect(result?.roles).toEqual([]);
  });

  it("should include suspended memberships in the organization member list", async () => {
    const owner = await createOwner();

    const { organization } =
      await createOrganizationForOwner(owner.id);

    const suspendedUser = await userRepository.create({
      email: "suspended@example.com",
      passwordHash: "test-password-hash",
      displayName: "Suspended User",
    });

    await repository.create({
      organizationId: organization.id,
      userId: suspendedUser.id,
      role: "member",
      status: "suspended",
    });

    const members = await repository.findAllByOrganizationId(
      organization.id
    );

    const result = members.find(
      (item) => item.userId === suspendedUser.id
    );

    expect(result).toBeDefined();
    expect(result?.status).toBe("suspended");
  });

  it("should retrieve detailed information for an organization member", async () => {
    const owner = await createOwner();

    const { organization } =
      await createOrganizationForOwner(owner.id);

    const result =
      await repository.findDetailsByOrganizationAndUser(
        organization.id,
        owner.id
      );

    expect(result).toBeDefined();
    expect(result).toMatchObject({
      organizationId: organization.id,
      userId: owner.id,
      email: owner.email,
      displayName: owner.displayName,
      status: "active",
      roles: [],
    });

    expect(result?.joinedAt).toBeInstanceOf(Date);
    expect(result?.userStatus).toBe(owner.status);
  });

  it("should return undefined for a member who does not belong to the organization", async () => {
    const owner = await createOwner();

    const { organization } =
      await createOrganizationForOwner(owner.id);

    const anotherUser = await userRepository.create({
      email: "another@example.com",
      passwordHash: "test-password-hash",
      displayName: "Another User",
    });

    const result =
      await repository.findDetailsByOrganizationAndUser(
        organization.id,
        anotherUser.id
      );

    expect(result).toBeUndefined();
  });

  it("should return an empty list when an organization has no members", async () => {
    const owner = await createOwner();

    const { organization } =
      await createOrganizationForOwner(owner.id);

    const members = await repository.findAllByOrganizationId(
      "00000000-0000-4000-8000-000000000000"
    );

    expect(members).toEqual([]);
    expect(organization.id).not.toBe(
      "00000000-0000-4000-8000-000000000000"
    );
  });
});

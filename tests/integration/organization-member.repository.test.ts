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
});

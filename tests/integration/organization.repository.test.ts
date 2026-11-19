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

import type { CreateOrganizationInput } from "../../src/organizations/organization.types.js";

describe("PostgresOrganizationRepository", () => {
  const userRepository = new PostgresUserRepository(testPool);
  const repository = new PostgresOrganizationRepository(testPool);

  const createOrganizationInput = (
    ownerUserId: string,
    overrides: Partial<CreateOrganizationInput> = {}
  ): CreateOrganizationInput => ({
    name: "Alex's Workspace",
    slug: "alex-workspace",
    type: "personal",
    ownerUserId,
    ...overrides,
  });

  const createOwner = async () => {
    return userRepository.create({
      email: "alex@example.com",
      passwordHash: "test-password-hash",
      displayName: "Alex",
    });
  };

  // Creates an organization and its owner membership
  // within the same transaction.
  const createPersonalOrganization = async (
    ownerUserId: string,
    overrides: Partial<CreateOrganizationInput> = {}
  ) => {
    const client = await testPool.connect();

    try {
      await client.query("BEGIN");

      const organization = await repository.create(
        createOrganizationInput(ownerUserId, overrides),
        client
      );

      await client.query(
        `INSERT INTO organization_members (
          organization_id,
          user_id,
          role,
          status
        )
        VALUES ($1, $2, 'owner', 'active')`,
        [organization.id, ownerUserId]
      );

      await client.query("COMMIT");

      return organization;
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

  it("should create an organization", async () => {
    const user = await createOwner();

    const organization = await createPersonalOrganization(user.id);

    expect(organization.id).toBeDefined();
    expect(organization.name).toBe("Alex's Workspace");
    expect(organization.slug).toBe("alex-workspace");
    expect(organization.type).toBe("personal");
    expect(organization.ownerUserId).toBe(user.id);
    expect(organization.createdAt).toBeInstanceOf(Date);
    expect(organization.updatedAt).toBeInstanceOf(Date);
  });

  it("should normalize organization name and slug", async () => {
    const user = await createOwner();

    const organization = await createPersonalOrganization(user.id, {
      name: "  Alex's Workspace  ",
      slug: "  ALEX-WORKSPACE  ",
    });

    expect(organization.name).toBe("Alex's Workspace");
    expect(organization.slug).toBe("alex-workspace");
  });

  it("should find an organization by ID", async () => {
    const user = await createOwner();
    const created = await createPersonalOrganization(user.id);

    const organization = await repository.findById(created.id);

    expect(organization?.id).toBe(created.id);
    expect(organization?.ownerUserId).toBe(user.id);
  });

  it("should find and lock an organization within a transaction", async () => {
    const user = await createOwner();
    const created = await createPersonalOrganization(user.id);

    const client = await testPool.connect();

    try {
      await client.query("BEGIN");

      const organization = await repository.findByIdForUpdate(
        created.id,
        client
      );

      expect(organization?.id).toBe(created.id);
      expect(organization?.ownerUserId).toBe(user.id);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  it("should update an organization's owner within a transaction", async () => {
    const previousOwner = await createOwner();

    const organization = await createPersonalOrganization(
      previousOwner.id
    );

    const newOwner = await userRepository.create({
      email: "new-owner@example.com",
      passwordHash: "test-password-hash",
      displayName: "New Owner",
    });

    const client = await testPool.connect();

    try {
      await client.query("BEGIN");

      // The deferred owner-membership foreign key requires
      // the incoming owner to have a membership row.
      await client.query(
        `INSERT INTO organization_members (
          organization_id,
          user_id,
          role,
          status
        )
        VALUES ($1, $2, 'member', 'active')`,
        [organization.id, newOwner.id]
      );

      const updated = await repository.updateOwner(
        organization.id,
        newOwner.id,
        client
      );

      expect(updated?.id).toBe(organization.id);
      expect(updated?.ownerUserId).toBe(newOwner.id);
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        organization.updatedAt.getTime()
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  it("should return undefined for an unknown organization ID", async () => {
    const organization = await repository.findById(
      "00000000-0000-4000-8000-000000000001"
    );

    expect(organization).toBeUndefined();
  });

  it("should find an organization by slug", async () => {
    const user = await createOwner();
    const created = await createPersonalOrganization(user.id);

    const organization = await repository.findBySlug("alex-workspace");

    expect(organization?.id).toBe(created.id);
  });

  it("should normalize slug lookup input", async () => {
    const user = await createOwner();
    const created = await createPersonalOrganization(user.id);

    const organization = await repository.findBySlug(
      "  ALEX-WORKSPACE  "
    );

    expect(organization?.id).toBe(created.id);
  });

  it("should return undefined for an unknown slug", async () => {
    const organization = await repository.findBySlug(
      "missing-workspace"
    );

    expect(organization).toBeUndefined();
  });

  it("should find a personal organization by owner ID", async () => {
    const user = await createOwner();
    const created = await createPersonalOrganization(user.id);

    const organization =
      await repository.findPersonalByOwnerId(user.id);

    expect(organization?.id).toBe(created.id);
    expect(organization?.ownerUserId).toBe(user.id);
  });

  it("should return undefined when the owner has no personal organization", async () => {
    const user = await createOwner();

    const organization =
      await repository.findPersonalByOwnerId(user.id);

    expect(organization).toBeUndefined();
  });

  it("should not expose an organization without its owner membership at transaction commit", async () => {
    const user = await createOwner();

    // Deliberately create the organization without its owner membership.
    // The deferred foreign key should reject the transaction at commit.
    await expect(
      repository.create(createOrganizationInput(user.id))
    ).rejects.toThrow();
  });

  it("should find organizations where the user has active membership", async () => {
    const owner = await createOwner();

    const organization = await createPersonalOrganization(owner.id);

    const memberships = await repository.findByUserId(owner.id);

    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.id).toBe(organization.id);
  });

  it("should not return organizations where the user's membership is suspended", async () => {
    const owner = await createOwner();

    const organization = await createPersonalOrganization(owner.id);

    await testPool.query(
      `UPDATE organization_members
       SET status = 'suspended'
       WHERE organization_id = $1
         AND user_id = $2`,
      [organization.id, owner.id]
    );

    const memberships = await repository.findByUserId(owner.id);

    expect(memberships).toEqual([]);
  });

  it("should update an organization's name", async () => {
    const owner = await createOwner();

    const organization = await createPersonalOrganization(owner.id);

    const updated = await repository.update(organization.id, {
      name: "Updated Workspace",
    });

    expect(updated?.name).toBe("Updated Workspace");
    expect(updated?.slug).toBe(organization.slug);
    expect(updated?.ownerUserId).toBe(owner.id);
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      organization.updatedAt.getTime()
    );
  });

  it("should return undefined when updating an unknown organization", async () => {
    const result = await repository.update(
      "00000000-0000-4000-8000-000000000001",
      { name: "Updated Workspace" }
    );

    expect(result).toBeUndefined();
  });
});

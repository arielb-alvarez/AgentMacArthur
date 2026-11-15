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

import type { CreateUserInput } from "../../src/users/user.types.js";

describe("PostgresUserRepository", () => {
  const repository = new PostgresUserRepository(testPool);

  const createInput = (
    overrides: Partial<CreateUserInput> = {}
  ): CreateUserInput => ({
    email: "alex@example.com",
    passwordHash: "test-password-hash",
    displayName: "Alex",
    ...overrides,
  });

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearIdentityTestDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it("should create a user", async () => {
    const user = await repository.create(createInput());

    expect(user.id).toBeDefined();
    expect(user.email).toBe("alex@example.com");
    expect(user.displayName).toBe("Alex");
    expect(user.status).toBe("pending");
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("should normalize email and display name when creating a user", async () => {
    const user = await repository.create(
      createInput({
        email: "  ALEX@EXAMPLE.COM  ",
        displayName: "  Alex Morgan  ",
      })
    );

    expect(user.email).toBe("alex@example.com");
    expect(user.displayName).toBe("Alex Morgan");
  });

  it("should not expose the password hash in public user data", async () => {
    const user = await repository.create(createInput());

    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password_hash");
  });

  it("should find a user by ID", async () => {
    const createdUser = await repository.create(createInput());

    const user = await repository.findById(createdUser.id);

    expect(user?.id).toBe(createdUser.id);
    expect(user?.email).toBe(createdUser.email);
  });

  it("should return undefined for an unknown user ID", async () => {
    const user = await repository.findById(
      "00000000-0000-4000-8000-000000000001"
    );

    expect(user).toBeUndefined();
  });

  it("should find a user by email without case sensitivity", async () => {
    const createdUser = await repository.create(createInput());

    const user = await repository.findByEmail("ALEX@EXAMPLE.COM");

    expect(user?.id).toBe(createdUser.id);
    expect(user?.email).toBe("alex@example.com");
  });

  it("should return undefined for an unknown email", async () => {
    const user = await repository.findByEmail("missing@example.com");

    expect(user).toBeUndefined();
  });

  it("should retrieve credentials for authentication", async () => {
    const passwordHash = "test-password-hash";

    const createdUser = await repository.create(
      createInput({ passwordHash })
    );

    const credentials =
      await repository.findCredentialsByEmail("alex@example.com");

    expect(credentials?.user.id).toBe(createdUser.id);
    expect(credentials?.passwordHash).toBe(passwordHash);

    expect(credentials?.user).not.toHaveProperty("passwordHash");
    expect(credentials?.user).not.toHaveProperty("password_hash");
  });

  it("should return undefined when credentials do not exist", async () => {
    const credentials =
      await repository.findCredentialsByEmail("missing@example.com");

    expect(credentials).toBeUndefined();
  });

  it("should update a user's status", async () => {
    const createdUser = await repository.create(createInput());

    const updatedUser = await repository.updateStatus(
      createdUser.id,
      "active"
    );

    expect(updatedUser?.status).toBe("active");
    expect(updatedUser?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      createdUser.updatedAt.getTime()
    );
  });

  it("should return undefined when updating an unknown user", async () => {
    const user = await repository.updateStatus(
      "00000000-0000-4000-8000-000000000001",
      "suspended"
    );

    expect(user).toBeUndefined();
  });


  it("should verify a pending user's email and activate the account", async () => {
    const createdUser = await repository.create(createInput());

    const verifiedUser = await repository.verifyEmail(
      createdUser.id
    );

    expect(verifiedUser?.status).toBe("active");
    expect(verifiedUser?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(
      verifiedUser?.emailVerifiedAt?.getTime()
    ).toBeGreaterThanOrEqual(createdUser.createdAt.getTime());
    expect(verifiedUser?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      createdUser.updatedAt.getTime()
    );
  });

  it("should return undefined when verifying an unknown user", async () => {
    const user = await repository.verifyEmail(
      "00000000-0000-4000-8000-000000000001"
    );

    expect(user).toBeUndefined();
  });

  it("should not reactivate a suspended user through email verification", async () => {
    const createdUser = await repository.create(createInput());

    await repository.updateStatus(createdUser.id, "suspended");

    const verifiedUser = await repository.verifyEmail(
      createdUser.id
    );

    expect(verifiedUser).toBeUndefined();

    const persistedUser = await repository.findById(
      createdUser.id
    );

    expect(persistedUser?.status).toBe("suspended");
    expect(persistedUser?.emailVerifiedAt).toBeNull();
  });

  it("should not verify an account more than once", async () => {
    const createdUser = await repository.create(createInput());

    const firstVerification = await repository.verifyEmail(
      createdUser.id
    );

    const secondVerification = await repository.verifyEmail(
      createdUser.id
    );

    expect(firstVerification?.status).toBe("active");
    expect(secondVerification).toBeUndefined();
  });
});

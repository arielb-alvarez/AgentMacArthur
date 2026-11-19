import { describe, expect, it, vi } from "vitest";

import type { Pool } from "pg";

import { PostgresInvitationRepository } from "../../src/invitations/postgres-invitation.repository.js";
import { PostgresTransactionManager } from "../../src/database/transaction-manager.js";

describe("PostgresInvitationRepository constructor", () => {
  it("should create a transaction manager when one is not provided", () => {
    const db = {
      query: vi.fn(),
      connect: vi.fn(),
    } as unknown as Pool;

    const repository = new PostgresInvitationRepository(db);

    expect(repository).toBeInstanceOf(PostgresInvitationRepository);
  });

  it("should accept a supplied transaction manager", () => {
    const db = {
      query: vi.fn(),
      connect: vi.fn(),
    } as unknown as Pool;

    const transactionManager = new PostgresTransactionManager(db);

    const repository = new PostgresInvitationRepository(
      db,
      transactionManager
    );

    expect(repository).toBeInstanceOf(PostgresInvitationRepository);
  });
});

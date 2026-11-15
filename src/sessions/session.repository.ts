import type { PoolClient } from "pg";

import type {
  CreateSessionInput,
  Session,
} from "./session.types.js";

export interface SessionRepository {
  create(
    input: CreateSessionInput,
    client?: PoolClient
  ): Promise<Session>;

  findActiveByTokenHash(
    tokenHash: string,
    client?: PoolClient
  ): Promise<Session | undefined>;

  updateLastUsed(
    id: string,
    client?: PoolClient
  ): Promise<Session | undefined>;

  revoke(
    id: string,
    client?: PoolClient
  ): Promise<Session | undefined>;

  revokeAllByUserId(
    userId: string,
    client?: PoolClient
  ): Promise<number>;
}

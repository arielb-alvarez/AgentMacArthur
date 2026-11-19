import type { PoolClient } from "pg";

import type {
  AuthToken,
  AuthTokenPurpose,
  CreateAuthTokenInput,
} from "./auth-token.types.js";

export interface AuthTokenRepository {
  create(
    input: CreateAuthTokenInput,
    client?: PoolClient
  ): Promise<AuthToken>;

  findActiveByTokenHash(
    tokenHash: string,
    purpose: AuthTokenPurpose,
    client?: PoolClient
  ): Promise<AuthToken | undefined>;

  consume(
    id: string,
    client?: PoolClient
  ): Promise<AuthToken | undefined>;

  invalidateActiveByUserAndPurpose(
    userId: string,
    purpose: AuthTokenPurpose,
    client?: PoolClient
  ): Promise<number>;
}

import type { PoolClient } from "pg";

import type {
  CreateUserInput,
  User,
  UserCredentials,
  UserStatus,
} from "./user.types.js";

export interface UserRepository {
  create(
    input: CreateUserInput,
    client?: PoolClient
  ): Promise<User>;

  findById(
    id: string,
    client?: PoolClient
  ): Promise<User | undefined>;

  findByEmail(
    email: string,
    client?: PoolClient
  ): Promise<User | undefined>;

  findCredentialsByEmail(
    email: string,
    client?: PoolClient
  ): Promise<UserCredentials | undefined>;

  updateStatus(
    id: string,
    status: UserStatus,
    client?: PoolClient
  ): Promise<User | undefined>;

  verifyEmail(
    id: string,
    client?: PoolClient
  ): Promise<User | undefined>;
}

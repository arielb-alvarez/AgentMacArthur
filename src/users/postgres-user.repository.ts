import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { pool as defaultPool } from "../config/database.js";

import { PostgresTransactionManager } from "../database/transaction-manager.js";

import type { TransactionManager } from "../database/transaction-manager.js";

import type { UserRepository } from "./user.repository.js";

import type {
  CreateUserInput,
  User,
  UserCredentials,
  UserStatus,
} from "./user.types.js";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  status: UserStatus;
  email_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface UserCredentialsRow extends UserRow {
  password_hash: string;
}

export class PostgresUserRepository implements UserRepository {
  private readonly transactionManager: TransactionManager;

  constructor(
    private readonly db: Pool = defaultPool,
    transactionManager?: TransactionManager
  ) {
    this.transactionManager =
      transactionManager ?? new PostgresTransactionManager(this.db);
  }

  private async execute<T>(
    operationName: string,
    operation: (client: PoolClient) => Promise<T>,
    client?: PoolClient
  ): Promise<T> {
    if (client) {
      return operation(client);
    }

    return this.transactionManager.runInTransaction(
      operationName,
      operation
    );
  }

  private mapUser(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      status: row.status,
      emailVerifiedAt: row.email_verified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(
    input: CreateUserInput,
    client?: PoolClient
  ): Promise<User> {
    return this.execute(
      "createUser",
      async (connection) => {
        const result = await connection.query<UserRow>(
          `INSERT INTO users (
            id,
            email,
            password_hash,
            display_name
          )
          VALUES ($1, $2, $3, $4)
          RETURNING
            id,
            email,
            display_name,
            status,
            email_verified_at,
            created_at,
            updated_at`,
          [
            randomUUID(),
            input.email.trim().toLowerCase(),
            input.passwordHash,
            input.displayName.trim(),
          ]
        );

        return this.mapUser(result.rows[0]);
      },
      client
    );
  }

  async findById(
    id: string,
    client?: PoolClient
  ): Promise<User | undefined> {
    return this.execute(
      "findUserById",
      async (connection) => {
        const result = await connection.query<UserRow>(
          `SELECT
            id,
            email,
            display_name,
            status,
            email_verified_at,
            created_at,
            updated_at
          FROM users
          WHERE id = $1`,
          [id]
        );

        const row = result.rows[0];

        return row ? this.mapUser(row) : undefined;
      },
      client
    );
  }

  async findByEmail(
    email: string,
    client?: PoolClient
  ): Promise<User | undefined> {
    return this.execute(
      "findUserByEmail",
      async (connection) => {
        const result = await connection.query<UserRow>(
          `SELECT
            id,
            email,
            display_name,
            status,
            email_verified_at,
            created_at,
            updated_at
          FROM users
          WHERE email = $1`,
          [email.trim().toLowerCase()]
        );

        const row = result.rows[0];

        return row ? this.mapUser(row) : undefined;
      },
      client
    );
  }

  async findCredentialsByEmail(
    email: string,
    client?: PoolClient
  ): Promise<UserCredentials | undefined> {
    return this.execute(
      "findUserCredentialsByEmail",
      async (connection) => {
        const result = await connection.query<UserCredentialsRow>(
          `SELECT
            id,
            email,
            password_hash,
            display_name,
            status,
            email_verified_at,
            created_at,
            updated_at
          FROM users
          WHERE email = $1`,
          [email.trim().toLowerCase()]
        );

        const row = result.rows[0];

        if (!row) {
          return undefined;
        }

        const {
          password_hash: passwordHash,
          ...userRow
        } = row;

        return {
          user: this.mapUser(userRow),
          passwordHash,
        };
      },
      client
    );
  }

  async updateStatus(
    id: string,
    status: UserStatus,
    client?: PoolClient
  ): Promise<User | undefined> {
    return this.execute(
      "updateUserStatus",
      async (connection) => {
        const result = await connection.query<UserRow>(
          `UPDATE users
           SET status = $2,
               updated_at = NOW()
           WHERE id = $1
           RETURNING
             id,
             email,
             display_name,
             status,
             email_verified_at,
             created_at,
             updated_at`,
          [id, status]
        );

        const row = result.rows[0];

        return row ? this.mapUser(row) : undefined;
      },
      client
    );
  }

  async verifyEmail(
    id: string,
    client?: PoolClient
  ): Promise<User | undefined> {
    return this.execute(
      "verifyUserEmail",
      async (connection) => {
        const result = await connection.query<UserRow>(
          `UPDATE users
           SET email_verified_at = NOW(),
               status = 'active',
               updated_at = NOW()
           WHERE id = $1
             AND status = 'pending'
             AND email_verified_at IS NULL
           RETURNING
             id,
             email,
             display_name,
             status,
             email_verified_at,
             created_at,
             updated_at`,
          [id]
        );

        const row = result.rows[0];

        return row ? this.mapUser(row) : undefined;
      },
      client
    );
  }
}

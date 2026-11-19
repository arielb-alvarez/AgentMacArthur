import type {
  Pool,
  PoolClient,
  QueryResult,
  QueryResultRow,
} from "pg";

import { pool as defaultPool } from "../config/database.js";
import {
  PostgresTransactionManager,
  type TransactionManager,
} from "../database/transaction-manager.js";

import type { InvitationRepository } from "./invitation.repository.js";

import type {
  CreateInvitationInput,
  Invitation,
  InvitationEmailDeliveryStatus,
  InvitationStatus,
  RecordInvitationDeliveryInput,
  ReplaceInvitationTokenInput,
} from "./invitation.types.js";

interface InvitationRow extends QueryResultRow {
  id: string;
  organization_id: string;
  project_id: string | null;
  email: string;
  role_id: string;
  role_key: string;
  role_name: string;
  invited_by: string;
  accepted_by: string | null;
  status: InvitationStatus;
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Date;
  email_delivery_status: InvitationEmailDeliveryStatus;
  email_delivery_attempts: number;
  email_last_attempt_at: Date | null;
  email_sent_at: Date | null;
  email_delivery_attempt_id: string | null;
  email_delivery_started_at: Date | null;
}

interface InvitationIdRow extends QueryResultRow {
  id: string;
}

export class PostgresInvitationRepository
  implements InvitationRepository
{
  private readonly transactionManager: TransactionManager;

  constructor(
    private readonly db: Pool = defaultPool,
    transactionManager?: TransactionManager
  ) {
    this.transactionManager =
      transactionManager ?? new PostgresTransactionManager(this.db);
  }

  private async execute<T extends QueryResultRow>(
    operationName: string,
    client: PoolClient | undefined,
    query: string,
    values: unknown[] = []
  ): Promise<QueryResult<T>> {
    if (client) {
      return client.query<T>(query, values);
    }

    return this.transactionManager.runInTransaction(
      operationName,
      async (transactionClient) =>
        transactionClient.query<T>(query, values)
    );
  }

  private mapInvitation(row: InvitationRow): Invitation {
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      email: row.email,
      roleId: row.role_id,
      roleKey: row.role_key,
      roleName: row.role_name,
      invitedBy: row.invited_by,
      acceptedBy: row.accepted_by,
      status: row.status,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
      emailDeliveryStatus: row.email_delivery_status,
      emailDeliveryAttempts: row.email_delivery_attempts,
      emailLastAttemptAt: row.email_last_attempt_at,
      emailSentAt: row.email_sent_at,
      emailDeliveryAttemptId: row.email_delivery_attempt_id,
      emailDeliveryStartedAt: row.email_delivery_started_at,
    };
  }

  private invitationSelect(): string {
    return `
      SELECT
        i.id,
        i.organization_id,
        i.project_id,
        i.email,
        i.role_id,
        r.key AS role_key,
        r.name AS role_name,
        i.invited_by,
        i.accepted_by,
        i.status,
        i.expires_at,
        i.accepted_at,
        i.created_at,
        i.email_delivery_status,
        i.email_delivery_attempts,
        i.email_last_attempt_at,
        i.email_sent_at,
        i.email_delivery_attempt_id,
        i.email_delivery_started_at
      FROM invitations i
      INNER JOIN roles r
        ON r.id = i.role_id
    `;
  }

  async expirePendingByOrganizationAndEmail(
    organizationId: string,
    email: string,
    client?: PoolClient
  ): Promise<number> {
    const result = await this.execute<InvitationIdRow>(
      "expirePendingInvitations",
      client,
      `UPDATE invitations
       SET
         status = 'expired',
         email_delivery_status = CASE
           WHEN email_delivery_attempt_id IS NOT NULL
             THEN 'unknown'
           ELSE email_delivery_status
         END,
         email_delivery_attempt_id = NULL,
         email_delivery_started_at = NULL
       WHERE organization_id = $1
         AND project_id IS NULL
         AND LOWER(email) = LOWER($2)
         AND status = 'pending'
         AND expires_at <= NOW()
       RETURNING id`,
      [organizationId, email]
    );

    return result.rowCount ?? 0;
  }

  async create(
    input: CreateInvitationInput,
    client?: PoolClient
  ): Promise<Invitation> {
    if (!client) {
      return this.transactionManager.runInTransaction(
        "createInvitation",
        async (transactionClient) =>
          this.create(input, transactionClient)
      );
    }

    const result = await client.query<InvitationIdRow>(
      `INSERT INTO invitations (
        id,
        organization_id,
        project_id,
        email,
        role_id,
        token_hash,
        invited_by,
        status,
        expires_at,
        email_delivery_status,
        email_delivery_attempts,
        email_last_attempt_at,
        email_sent_at,
        email_delivery_attempt_id,
        email_delivery_started_at
      )
      SELECT
        gen_random_uuid(),
        $1,
        NULL,
        $2,
        r.id,
        $3,
        $4,
        'pending',
        $5,
        'pending',
        1,
        $7,
        NULL,
        $6,
        $7
      FROM roles r
      WHERE r.scope = 'organization'
        AND r.key = $8
        AND r.is_system = TRUE
        AND r.organization_id IS NULL
      RETURNING id`,
      [
        input.organizationId,
        input.email,
        input.tokenHash,
        input.invitedBy,
        input.expiresAt,
        input.emailDeliveryAttemptId,
        input.emailDeliveryStartedAt,
        input.roleKey,
      ]
    );

    const invitationId = result.rows[0]?.id;

    if (!invitationId) {
      throw new Error(
        `Built-in organization role "${input.roleKey}" does not exist.`
      );
    }

    const invitation = await this.findByIdForOrganization(
      input.organizationId,
      invitationId,
      client
    );

    if (!invitation) {
      throw new Error(
        "Created invitation could not be retrieved."
      );
    }

    return invitation;
  }

  async findAllByOrganizationId(
    organizationId: string,
    client?: PoolClient
  ): Promise<Invitation[]> {
    const result = await this.execute<InvitationRow>(
      "findOrganizationInvitations",
      client,
      `${this.invitationSelect()}
       WHERE i.organization_id = $1
         AND i.project_id IS NULL
       ORDER BY i.created_at DESC, i.id ASC`,
      [organizationId]
    );

    return result.rows.map((row) => this.mapInvitation(row));
  }

  async findByIdForOrganization(
    organizationId: string,
    invitationId: string,
    client?: PoolClient
  ): Promise<Invitation | undefined> {
    const result = await this.execute<InvitationRow>(
      "findOrganizationInvitation",
      client,
      `${this.invitationSelect()}
       WHERE i.organization_id = $1
         AND i.id = $2`,
      [organizationId, invitationId]
    );

    const row = result.rows[0];

    return row ? this.mapInvitation(row) : undefined;
  }

  async lockOrganizationEmail(
    organizationId: string,
    email: string,
    client: PoolClient
  ): Promise<void> {
    await client.query(
      `SELECT pg_advisory_xact_lock(
        hashtext($1),
        hashtext($2)
      )`,
      [organizationId, email.trim().toLowerCase()]
    );
  }

  async findByTokenHash(
    tokenHash: string,
    client: PoolClient
  ): Promise<Invitation | undefined> {
    const result = await client.query<InvitationRow>(
      `${this.invitationSelect()}
       WHERE i.token_hash = $1`,
      [tokenHash]
    );

    const row = result.rows[0];

    return row ? this.mapInvitation(row) : undefined;
  }

  async findByTokenHashForUpdate(
    tokenHash: string,
    client: PoolClient
  ): Promise<Invitation | undefined> {
    const result = await client.query<InvitationRow>(
      `${this.invitationSelect()}
       WHERE i.token_hash = $1
       FOR UPDATE OF i`,
      [tokenHash]
    );

    const row = result.rows[0];

    return row ? this.mapInvitation(row) : undefined;
  }

  async replaceToken(
    input: ReplaceInvitationTokenInput,
    client: PoolClient
  ): Promise<Invitation | undefined> {
    const result = await client.query<InvitationIdRow>(
      `UPDATE invitations
       SET
         token_hash = $3,
         expires_at = $4,
         email_delivery_status = 'pending',
         email_delivery_attempts = email_delivery_attempts + 1,
         email_last_attempt_at = $6,
         email_sent_at = NULL,
         email_delivery_attempt_id = $5,
         email_delivery_started_at = $6
       WHERE id = $1
         AND organization_id = $2
         AND project_id IS NULL
         AND status = 'pending'
         AND expires_at > NOW()
         AND (
           email_delivery_attempt_id IS NULL
           OR email_delivery_started_at <= $7
         )
       RETURNING id`,
      [
        input.invitationId,
        input.organizationId,
        input.tokenHash,
        input.expiresAt,
        input.emailDeliveryAttemptId,
        input.emailDeliveryStartedAt,
        input.staleAttemptBefore,
      ]
    );

    const invitationId = result.rows[0]?.id;

    if (!invitationId) {
      return undefined;
    }

    const invitationResult = await client.query<InvitationRow>(
      `${this.invitationSelect()}
       WHERE i.id = $1`,
      [invitationId]
    );

    const row = invitationResult.rows[0];

    return row ? this.mapInvitation(row) : undefined;
  }

  async recordEmailDelivery(
    input: RecordInvitationDeliveryInput,
    client?: PoolClient
  ): Promise<boolean> {
    const result = await this.execute<InvitationIdRow>(
      "recordInvitationEmailDelivery",
      client,
      `UPDATE invitations
       SET
         email_delivery_status = $3,
         email_sent_at = $4,
         email_delivery_attempt_id = NULL,
         email_delivery_started_at = NULL
       WHERE id = $1
         AND email_delivery_attempt_id = $2
         AND status = 'pending'
       RETURNING id`,
      [
        input.invitationId,
        input.emailDeliveryAttemptId,
        input.status,
        input.sentAt,
      ]
    );

    return result.rowCount === 1;
  }

  async revoke(
    organizationId: string,
    invitationId: string,
    client?: PoolClient
  ): Promise<Invitation | undefined> {
    const result = await this.execute<InvitationRow>(
      "revokeOrganizationInvitation",
      client,
      `UPDATE invitations i
       SET
         status = 'revoked',
         email_delivery_status = CASE
           WHEN i.email_delivery_attempt_id IS NOT NULL
             THEN 'unknown'
           ELSE i.email_delivery_status
         END,
         email_delivery_attempt_id = NULL,
         email_delivery_started_at = NULL
       WHERE i.organization_id = $1
         AND i.id = $2
         AND i.project_id IS NULL
         AND i.status = 'pending'
       RETURNING
         i.id,
         i.organization_id,
         i.project_id,
         i.email,
         i.role_id,
         (
           SELECT r.key
           FROM roles r
           WHERE r.id = i.role_id
         ) AS role_key,
         (
           SELECT r.name
           FROM roles r
           WHERE r.id = i.role_id
         ) AS role_name,
         i.invited_by,
         i.accepted_by,
         i.status,
         i.expires_at,
         i.accepted_at,
         i.created_at,
         i.email_delivery_status,
         i.email_delivery_attempts,
         i.email_last_attempt_at,
         i.email_sent_at,
         i.email_delivery_attempt_id,
         i.email_delivery_started_at`,
      [organizationId, invitationId]
    );

    const row = result.rows[0];

    return row ? this.mapInvitation(row) : undefined;
  }

  async markAccepted(
    invitationId: string,
    userId: string,
    client: PoolClient
  ): Promise<Invitation | undefined> {
    const result = await client.query<InvitationRow>(
      `UPDATE invitations i
       SET
         status = 'accepted',
         accepted_by = $2,
         accepted_at = NOW(),
         email_delivery_status = CASE
           WHEN i.email_delivery_attempt_id IS NOT NULL
             THEN 'unknown'
           ELSE i.email_delivery_status
         END,
         email_delivery_attempt_id = NULL,
         email_delivery_started_at = NULL
       WHERE i.id = $1
         AND i.status = 'pending'
         AND i.expires_at > NOW()
       RETURNING
         i.id,
         i.organization_id,
         i.project_id,
         i.email,
         i.role_id,
         (
           SELECT r.key
           FROM roles r
           WHERE r.id = i.role_id
         ) AS role_key,
         (
           SELECT r.name
           FROM roles r
           WHERE r.id = i.role_id
         ) AS role_name,
         i.invited_by,
         i.accepted_by,
         i.status,
         i.expires_at,
         i.accepted_at,
         i.created_at,
         i.email_delivery_status,
         i.email_delivery_attempts,
         i.email_last_attempt_at,
         i.email_sent_at,
         i.email_delivery_attempt_id,
         i.email_delivery_started_at`,
      [invitationId, userId]
    );

    const row = result.rows[0];

    return row ? this.mapInvitation(row) : undefined;
  }
}

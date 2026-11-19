import type { PoolClient } from "pg";

import type {
  CreateInvitationInput,
  Invitation,
  RecordInvitationDeliveryInput,
  ReplaceInvitationTokenInput,
} from "./invitation.types.js";

export interface InvitationRepository {
  expirePendingByOrganizationAndEmail(
    organizationId: string,
    email: string,
    client?: PoolClient
  ): Promise<number>;

  create(
    input: CreateInvitationInput,
    client?: PoolClient
  ): Promise<Invitation>;

  findAllByOrganizationId(
    organizationId: string,
    client?: PoolClient
  ): Promise<Invitation[]>;

  findByIdForOrganization(
    organizationId: string,
    invitationId: string,
    client?: PoolClient
  ): Promise<Invitation | undefined>;

  findByTokenHashForUpdate(
    tokenHash: string,
    client: PoolClient
  ): Promise<Invitation | undefined>;

  replaceToken(
    input: ReplaceInvitationTokenInput,
    client: PoolClient
  ): Promise<Invitation | undefined>;

  recordEmailDelivery(
    input: RecordInvitationDeliveryInput,
    client?: PoolClient
  ): Promise<boolean>;

  revoke(
    organizationId: string,
    invitationId: string,
    client?: PoolClient
  ): Promise<Invitation | undefined>;

  markAccepted(
    invitationId: string,
    userId: string,
    client: PoolClient
  ): Promise<Invitation | undefined>;

    lockOrganizationEmail(
    organizationId: string,
    email: string,
    client: PoolClient
  ): Promise<void>;

  findByTokenHash(
    tokenHash: string,
    client: PoolClient
  ): Promise<Invitation | undefined>;
}

import type { PoolClient } from "pg";

import { AppError } from "../errors/app.error.js";
import type { TransactionManager } from "../database/transaction-manager.js";
import type { OrganizationRepository } from "../organizations/organization.repository.js";
import type { OrganizationMemberRepository } from "./organization-member.repository.js";
import type { OrganizationMemberDetails } from "./organization-member.types.js";

export class OrganizationMemberService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly transactionManager: TransactionManager
  ) {}

  async listMembers(
    organizationId: string,
    requesterUserId: string
  ): Promise<OrganizationMemberDetails[]> {
    return this.transactionManager.runInTransaction(
      "listOrganizationMembers",
      async (client) => {
        await this.assertCanViewMembers(
          organizationId,
          requesterUserId,
          client
        );

        return this.organizationMemberRepository.findAllByOrganizationId(
          organizationId,
          client
        );
      }
    );
  }

  async getMember(
    organizationId: string,
    targetUserId: string,
    requesterUserId: string
  ): Promise<OrganizationMemberDetails> {
    return this.transactionManager.runInTransaction(
      "getOrganizationMember",
      async (client) => {
        await this.assertCanViewMembers(
          organizationId,
          requesterUserId,
          client
        );

        const member =
          await this.organizationMemberRepository.findDetailsByOrganizationAndUser(
            organizationId,
            targetUserId,
            client
          );

        if (!member) {
          throw this.memberNotFoundError();
        }

        return member;
      }
    );
  }

  private async assertCanViewMembers(
    organizationId: string,
    requesterUserId: string,
    client: PoolClient
  ): Promise<void> {
    const organization =
      await this.organizationRepository.findById(
        organizationId,
        client
      );

    if (!organization) {
      throw this.organizationNotFoundError();
    }

    const membership =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        organizationId,
        requesterUserId,
        client
      );

    if (!membership || membership.status !== "active") {
      throw this.organizationNotFoundError();
    }
  }

  private organizationNotFoundError(): AppError {
    return new AppError(
      "Organization not found or you do not have access.",
      404
    );
  }

  private memberNotFoundError(): AppError {
    return new AppError(
      "Organization member not found.",
      404
    );
  }
}

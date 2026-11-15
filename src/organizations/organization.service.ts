import { AppError } from "../errors/app.error.js";

import type { TransactionManager } from "../database/transaction-manager.js";
import type { OrganizationMemberRepository } from "../organization-members/organization-member.repository.js";
import type { Organization } from "./organization.types.js";
import type { OrganizationRepository } from "./organization.repository.js";
import type { UpdateOrganizationInput } from "./organization.types.js";

export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly transactionManager: TransactionManager
  ) {}

  async list(userId: string): Promise<Organization[]> {
    return this.organizationRepository.findByUserId(userId);
  }

  async getById(
    organizationId: string,
    userId: string
  ): Promise<Organization> {
    return this.transactionManager.runInTransaction(
      "getAccessibleOrganization",
      async (client) => {
        const organization =
          await this.organizationRepository.findById(
            organizationId,
            client
          );

        if (!organization) {
          throw this.organizationNotFoundError();
        }

        await this.assertCanViewOrganization(
          organizationId,
          userId,
          client
        );

        return organization;
      }
    );
  }

  async update(
    organizationId: string,
    userId: string,
    input: UpdateOrganizationInput
  ): Promise<Organization> {
    return this.transactionManager.runInTransaction(
      "updateOrganization",
      async (client) => {
        const organization =
          await this.organizationRepository.findById(
            organizationId,
            client
          );

        if (!organization) {
          throw this.organizationNotFoundError();
        }

        const member =
          await this.organizationMemberRepository.findByOrganizationAndUser(
            organizationId,
            userId,
            client
          );

        if (!member || member.status !== "active") {
          throw this.organizationNotFoundError();
        }

        if (
          member.role !== "owner" &&
          member.role !== "admin"
        ) {
          throw new AppError(
            "You do not have permission to update this organization.",
            403
          );
        }

        const updatedOrganization =
          await this.organizationRepository.update(
            organizationId,
            input,
            client
          );

        if (!updatedOrganization) {
          throw this.organizationNotFoundError();
        }

        return updatedOrganization;
      }
    );
  }

  private async assertCanViewOrganization(
    organizationId: string,
    userId: string,
    client: import("pg").PoolClient
  ): Promise<void> {
    const member =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        organizationId,
        userId,
        client
      );

    if (!member || member.status !== "active") {
      throw this.organizationNotFoundError();
    }
  }

  private organizationNotFoundError(): AppError {
    return new AppError(
      "Organization not found or you do not have access.",
      404
    );
  }
}

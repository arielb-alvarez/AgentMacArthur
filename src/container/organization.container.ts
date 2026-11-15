import { pool } from "../config/database.js";

import { PostgresTransactionManager } from "../database/transaction-manager.js";

import { PostgresOrganizationRepository } from "../organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../organization-members/postgres-organization-member.repository.js";

import { OrganizationService } from "../organizations/organization.service.js";
import { createOrganizationController } from "../controllers/organization.controller.js";

const transactionManager = new PostgresTransactionManager(pool);

const organizationRepository =
  new PostgresOrganizationRepository(
    pool,
    transactionManager
  );

const organizationMemberRepository =
  new PostgresOrganizationMemberRepository(
    pool,
    transactionManager
  );

const organizationService = new OrganizationService(
  organizationRepository,
  organizationMemberRepository,
  transactionManager
);

export const organizationController =
  createOrganizationController(organizationService);

import { pool } from "../config/database.js";

import { PostgresTransactionManager } from "../database/transaction-manager.js";

import { PostgresOrganizationRepository } from "../organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../organization-members/postgres-organization-member.repository.js";
import { PostgresOrganizationPermissionRepository } from "../permissions/postgres-organization-permission.repository.js";

import { OrganizationPermissionService } from "../permissions/organization-permission.service.js";
import { OrganizationService } from "../organizations/organization.service.js";
import { OrganizationMemberService } from "../organization-members/organization-member.service.js";

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

const organizationPermissionRepository =
  new PostgresOrganizationPermissionRepository(
    pool,
    transactionManager
  );

const organizationPermissionService =
  new OrganizationPermissionService(
    organizationPermissionRepository
  );

const organizationService = new OrganizationService(
  organizationRepository,
  organizationMemberRepository,
  organizationPermissionService,
  transactionManager
);

const organizationMemberService =
  new OrganizationMemberService(
    organizationRepository,
    organizationMemberRepository,
    transactionManager
  );

export const organizationController =
  createOrganizationController(
    organizationService,
    organizationMemberService
  );

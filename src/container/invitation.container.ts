import { pool } from "../config/database.js";
import { env } from "../config/env.js";

import { PostgresTransactionManager } from "../database/transaction-manager.js";

import { PostgresInvitationRepository } from "../invitations/postgres-invitation.repository.js";
import { PostgresOrganizationRepository } from "../organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../organization-members/postgres-organization-member.repository.js";
import { PostgresUserRepository } from "../users/postgres-user.repository.js";
import { PostgresRoleAssignmentRepository } from "../role-assignments/postgres-role-assignment.repository.js";
import { PostgresOrganizationPermissionRepository } from "../permissions/postgres-organization-permission.repository.js";

import { OrganizationPermissionService } from "../permissions/organization-permission.service.js";
import { InvitationService } from "../invitations/invitation.service.js";

import { TokenService } from "../auth/token.service.js";

import { createInvitationController } from "../controllers/invitation.controller.js";

import { emailService } from "./email.container.js";

const transactionManager = new PostgresTransactionManager(pool);

// Repositories.
const invitationRepository = new PostgresInvitationRepository(
  pool,
  transactionManager
);

const organizationRepository = new PostgresOrganizationRepository(
  pool,
  transactionManager
);

const organizationMemberRepository =
  new PostgresOrganizationMemberRepository(
    pool,
    transactionManager
  );

const userRepository = new PostgresUserRepository(
  pool,
  transactionManager
);

const roleAssignmentRepository =
  new PostgresRoleAssignmentRepository(
    pool,
    transactionManager
  );

const organizationPermissionRepository =
  new PostgresOrganizationPermissionRepository(
    pool,
    transactionManager
  );

// Authorization and token utilities.
const permissionService = new OrganizationPermissionService(
  organizationPermissionRepository
);

const tokenService = new TokenService();

// Invitation application service.
export const invitationService = new InvitationService(
  invitationRepository,
  organizationRepository,
  organizationMemberRepository,
  userRepository,
  roleAssignmentRepository,
  permissionService,
  tokenService,
  emailService,
  transactionManager,
  env.FRONTEND_URL
);

// HTTP controller.
export const invitationController =
  createInvitationController(invitationService);

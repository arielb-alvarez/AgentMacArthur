import { pool } from "../config/database.js";

import { PostgresTransactionManager } from "../database/transaction-manager.js";

import { PostgresOrganizationMemberRepository } from "../organization-members/postgres-organization-member.repository.js";
import { PostgresOrganizationPermissionRepository } from "../permissions/postgres-organization-permission.repository.js";
import { OrganizationPermissionService } from "../permissions/organization-permission.service.js";
import { PostgresProjectRepository } from "../projects/postgres-project.repository.js";
import { PostgresProjectMemberRepository } from "../project-members/postgres-project-member.repository.js";
import { ProjectMemberService } from "../project-members/project-member.service.js";
import { PostgresRoleAssignmentRepository } from "../role-assignments/postgres-role-assignment.repository.js";
import { PostgresRoleManagementRepository } from "../role-management/postgres-role-management.repository.js";

import { ProjectService } from "../projects/project.service.js";
import { createProjectController } from "../controllers/project.controller.js";
import { createProjectMemberController } from "../controllers/project-member.controller.js";

const transactionManager = new PostgresTransactionManager(pool);

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

const projectRepository = new PostgresProjectRepository(
  pool,
  transactionManager
);

const projectMemberRepository =
  new PostgresProjectMemberRepository(
    pool,
    transactionManager
  );

const roleAssignmentRepository =
  new PostgresRoleAssignmentRepository(
    pool,
    transactionManager
  );

const roleManagementRepository =
  new PostgresRoleManagementRepository(
    pool,
    transactionManager
  );

const projectService = new ProjectService(
  projectRepository,
  projectMemberRepository,
  organizationMemberRepository,
  roleAssignmentRepository,
  organizationPermissionService,
  transactionManager
);

const projectMemberService = new ProjectMemberService(
  projectRepository,
  projectMemberRepository,
  organizationMemberRepository,
  roleAssignmentRepository,
  organizationPermissionService,
  roleManagementRepository,
  transactionManager
);

export const projectController =
  createProjectController(projectService);

export const projectMemberController =
  createProjectMemberController(projectMemberService);
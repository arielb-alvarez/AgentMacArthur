import { pool } from "../config/database.js";

import { PostgresTransactionManager } from "../database/transaction-manager.js";

import { PostgresOrganizationMemberRepository } from "../organization-members/postgres-organization-member.repository.js";
import { PostgresProjectRepository } from "../projects/postgres-project.repository.js";
import { PostgresProjectMemberRepository } from "../project-members/postgres-project-member.repository.js";
import { PostgresRoleAssignmentRepository } from "../role-assignments/postgres-role-assignment.repository.js";

import { ProjectService } from "../projects/project.service.js";
import { createProjectController } from "../controllers/project.controller.js";

const transactionManager = new PostgresTransactionManager(pool);

const organizationMemberRepository =
  new PostgresOrganizationMemberRepository(
    pool,
    transactionManager
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

const projectService = new ProjectService(
  projectRepository,
  projectMemberRepository,
  organizationMemberRepository,
  roleAssignmentRepository,
  transactionManager
);

export const projectController =
  createProjectController(projectService);
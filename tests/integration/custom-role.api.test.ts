import express from "express";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { testPool } from "../../src/config/test-database.js";
import { env } from "../../src/config/env.js";

import {
  setupTestDatabase,
  clearTestDatabase,
  clearIdentityTestDatabase,
} from "../helpers/database-setup.js";

import { PostgresTransactionManager } from "../../src/database/transaction-manager.js";

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresSessionRepository } from "../../src/sessions/postgres-session.repository.js";
import { TokenService } from "../../src/auth/token.service.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { AuthService } from "../../src/auth/auth.service.js";
import { SESSION_COOKIE_NAME } from "../../src/auth/session-cookie.js";

import { createAuthenticationMiddleware } from "../../src/middleware/auth.middleware.js";
import { errorMiddleware } from "../../src/middleware/error.middleware.js";

import { PostgresOrganizationRepository } from "../../src/organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../../src/organization-members/postgres-organization-member.repository.js";
import { OrganizationService } from "../../src/organizations/organization.service.js";
import { OrganizationMemberService } from "../../src/organization-members/organization-member.service.js";

import { PostgresOrganizationPermissionRepository } from "../../src/permissions/postgres-organization-permission.repository.js";
import { OrganizationPermissionService } from "../../src/permissions/organization-permission.service.js";

import { PostgresRoleAssignmentRepository } from "../../src/role-assignments/postgres-role-assignment.repository.js";
import { PostgresRoleManagementRepository } from "../../src/role-management/postgres-role-management.repository.js";
import { RoleManagementService } from "../../src/role-management/role-management.service.js";

import { PostgresProjectRepository } from "../../src/projects/postgres-project.repository.js";
import { PostgresProjectMemberRepository } from "../../src/project-members/postgres-project-member.repository.js";
import { ProjectService } from "../../src/projects/project.service.js";
import { ProjectMemberService } from "../../src/project-members/project-member.service.js";

import { createOrganizationController } from "../../src/controllers/organization.controller.js";
import { createProjectController } from "../../src/controllers/project.controller.js";
import { createProjectMemberController } from "../../src/controllers/project-member.controller.js";

import { createOrganizationRouter } from "../../src/routes/organization.routes.js";
import { createProjectRouter } from "../../src/routes/project.routes.js";

describe("Custom role API integration", () => {
  const transactionManager = new PostgresTransactionManager(testPool);

  const userRepository = new PostgresUserRepository(
    testPool,
    transactionManager
  );

  const sessionRepository = new PostgresSessionRepository(
    testPool,
    transactionManager
  );

  const tokenService = new TokenService();

  const authService = new AuthService(
    userRepository,
    sessionRepository,
    new PasswordService(),
    tokenService,
    transactionManager
  );

  const authentication = createAuthenticationMiddleware(authService);

  const organizationRepository = new PostgresOrganizationRepository(
    testPool,
    transactionManager
  );

  const organizationMemberRepository =
    new PostgresOrganizationMemberRepository(
      testPool,
      transactionManager
    );

  const permissionRepository =
    new PostgresOrganizationPermissionRepository(
      testPool,
      transactionManager
    );

  const permissionService = new OrganizationPermissionService(
    permissionRepository
  );

  const roleAssignmentRepository =
    new PostgresRoleAssignmentRepository(
      testPool,
      transactionManager
    );

  const roleManagementRepository =
    new PostgresRoleManagementRepository(
      testPool,
      transactionManager
    );

  const organizationService = new OrganizationService(
    organizationRepository,
    organizationMemberRepository,
    permissionService,
    userRepository,
    roleAssignmentRepository,
    transactionManager
  );

  const organizationMemberService = new OrganizationMemberService(
    organizationRepository,
    organizationMemberRepository,
    permissionService,
    userRepository,
    roleAssignmentRepository,
    transactionManager
  );

  const roleManagementService = new RoleManagementService(
    organizationRepository,
    organizationMemberRepository,
    roleAssignmentRepository,
    roleManagementRepository,
    transactionManager
  );

  const organizationController = createOrganizationController(
    organizationService,
    organizationMemberService,
    roleManagementService
  );

  const projectRepository = new PostgresProjectRepository(
    testPool,
    transactionManager
  );

  const projectMemberRepository =
    new PostgresProjectMemberRepository(
      testPool,
      transactionManager
    );

  const projectService = new ProjectService(
    projectRepository,
    projectMemberRepository,
    organizationMemberRepository,
    roleAssignmentRepository,
    permissionService,
    transactionManager
  );

  const projectMemberService = new ProjectMemberService(
    projectRepository,
    projectMemberRepository,
    organizationMemberRepository,
    roleAssignmentRepository,
    permissionService,
    roleManagementRepository,
    transactionManager
  );

  const projectController = createProjectController(projectService);

  const projectMemberController = createProjectMemberController(
    projectMemberService
  );

  const app = express();

  app.use(express.json());

  app.use(
    "/api/organizations",
    createOrganizationRouter(
      organizationController,
      authentication
    )
  );

  app.use(
    "/api/projects",
    createProjectRouter(
      projectController,
      projectMemberController,
      authentication
    )
  );

  app.use(errorMiddleware);

  const allowedOrigin = env.CORS_ORIGINS[0];

  let ownerId: string;
  let targetUserId: string;
  let regularMemberId: string;
  let organizationId: string;
  let projectId: string;

  const sessionCookies = new Map<string, string>();

  const createUser = async (
    email: string,
    displayName: string
  ): Promise<string> => {
    const user = await userRepository.create({
      email,
      passwordHash: "test-password-hash",
      displayName,
    });

    const verifiedUser = await userRepository.verifyEmail(user.id);

    if (!verifiedUser) {
      throw new Error(`Failed to verify test user: ${email}`);
    }

    return verifiedUser.id;
  };

  const createSessionCookie = async (
    userId: string
  ): Promise<string> => {
    const generatedToken = tokenService.generate();

    await sessionRepository.create({
      userId,
      tokenHash: generatedToken.tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const cookie =
      `${SESSION_COOKIE_NAME}=${generatedToken.rawToken}`;

    sessionCookies.set(userId, cookie);

    return cookie;
  };

  const authenticatedPost = (
    path: string,
    userId: string
  ) => {
    const cookie = sessionCookies.get(userId);

    if (!cookie) {
      throw new Error(`No session cookie for user ${userId}`);
    }

    return request(app)
      .post(path)
      .set("Origin", allowedOrigin)
      .set("Cookie", cookie);
  };

  const authenticatedDelete = (
    path: string,
    userId: string
  ) => {
    const cookie = sessionCookies.get(userId);

    if (!cookie) {
      throw new Error(`No session cookie for user ${userId}`);
    }

    return request(app)
      .delete(path)
      .set("Origin", allowedOrigin)
      .set("Cookie", cookie);
  };

  const createOrganization = async (
    ownerUserId: string,
    slug: string
  ) => {
    return transactionManager.runInTransaction(
      "createCustomRoleApiOrganization",
      async (client) => {
        const organization = await organizationRepository.create(
          {
            name: `${slug} Workspace`,
            slug,
            type: "team",
            ownerUserId,
          },
          client
        );

        await organizationMemberRepository.create(
          {
            organizationId: organization.id,
            userId: ownerUserId,
            role: "owner",
            status: "active",
          },
          client
        );

        await roleAssignmentRepository.assignOrganizationRole(
          {
            organizationId: organization.id,
            userId: ownerUserId,
            roleKey: "owner",
            assignedBy: ownerUserId,
          },
          client
        );

        return organization;
      }
    );
  };

  const addOrganizationMember = async (
    organizationId: string,
    userId: string
  ) => {
    return transactionManager.runInTransaction(
      "addCustomRoleApiOrganizationMember",
      async (client) => {
        const membership = await organizationMemberRepository.create(
          {
            organizationId,
            userId,
            role: "member",
            status: "active",
          },
          client
        );

        await roleAssignmentRepository.assignOrganizationRole(
          {
            organizationId,
            userId,
            roleKey: "member",
          },
          client
        );

        return membership;
      }
    );
  };

  const createCustomRole = async (
    scope: "organization" | "project",
    key: string
  ): Promise<string> => {
    const response = await authenticatedPost(
      `/api/organizations/${organizationId}/roles`,
      ownerId
    ).send({
      scope,
      key,
      name: key.replaceAll("_", " "),
      description: "Custom role API integration test.",
    });

    expect(response.status).toBe(201);
    expect(response.body.role).toBeDefined();

    return response.body.role.id as string;
  };

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await clearIdentityTestDatabase();

    sessionCookies.clear();

    ownerId = await createUser(
      "custom-role-owner@example.com",
      "Custom Role Owner"
    );

    targetUserId = await createUser(
      "custom-role-target@example.com",
      "Custom Role Target"
    );

    regularMemberId = await createUser(
      "custom-role-member@example.com",
      "Custom Role Member"
    );

    await createSessionCookie(ownerId);
    await createSessionCookie(targetUserId);
    await createSessionCookie(regularMemberId);

    const organization = await createOrganization(
      ownerId,
      "custom-role-api-test"
    );

    organizationId = organization.id;

    await addOrganizationMember(organizationId, targetUserId);
    await addOrganizationMember(organizationId, regularMemberId);

    const project = await projectService.create(ownerId, {
      organizationId,
      name: "Custom Role API Test Project",
    });

    projectId = project.id;

    await projectMemberRepository.create({
      projectId,
      organizationId,
      userId: targetUserId,
      role: "developer",
      status: "active",
    });

    await projectMemberRepository.create({
      projectId,
      organizationId,
      userId: regularMemberId,
      role: "developer",
      status: "active",
    });
  });

  afterAll(async () => {
    await testPool.end();
  });

  it("should reject anonymous project custom-role assignment requests", async () => {
    const response = await request(app)
      .post(
        `/api/projects/${projectId}/members/${targetUserId}/roles/${crypto.randomUUID()}`
      )
      .set("Origin", allowedOrigin);

    expect(response.status).toBe(401);
  });

  it("should allow the project owner to assign and remove a project custom role", async () => {
    const roleId = await createCustomRole(
      "project",
      "api_test_project_role"
    );

    const assignResponse = await authenticatedPost(
      `/api/projects/${projectId}/members/${targetUserId}/roles/${roleId}`,
      ownerId
    );

    expect(assignResponse.status).toBe(200);
    expect(assignResponse.body).toMatchObject({
      success: true,
      message: "Project custom role assigned successfully.",
    });

    const assigned = await testPool.query(
      `SELECT role_id
       FROM project_member_roles
       WHERE project_id = $1
         AND user_id = $2
         AND role_id = $3`,
      [projectId, targetUserId, roleId]
    );

    expect(assigned.rowCount).toBe(1);

    const removeResponse = await authenticatedDelete(
      `/api/projects/${projectId}/members/${targetUserId}/roles/${roleId}`,
      ownerId
    );

    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body).toMatchObject({
      success: true,
      message: "Project custom role removed successfully.",
    });

    const removed = await testPool.query(
      `SELECT role_id
       FROM project_member_roles
       WHERE project_id = $1
         AND user_id = $2
         AND role_id = $3`,
      [projectId, targetUserId, roleId]
    );

    expect(removed.rowCount).toBe(0);
  });

  it("should reject project custom-role assignment by a member without project.members.manage", async () => {
    const roleId = await createCustomRole(
      "project",
      "api_test_restricted_role"
    );

    const response = await authenticatedPost(
      `/api/projects/${projectId}/members/${targetUserId}/roles/${roleId}`,
      regularMemberId
    );

    expect(response.status).toBe(403);

    const assignment = await testPool.query(
      `SELECT role_id
       FROM project_member_roles
       WHERE project_id = $1
         AND user_id = $2
         AND role_id = $3`,
      [projectId, targetUserId, roleId]
    );

    expect(assignment.rowCount).toBe(0);
  });

  it("should reject organization-scoped roles on project member assignment endpoints", async () => {
    const roleId = await createCustomRole(
      "organization",
      "api_test_organization_role"
    );

    const response = await authenticatedPost(
      `/api/projects/${projectId}/members/${targetUserId}/roles/${roleId}`,
      ownerId
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Only project-scoped custom roles can be assigned to project members."
    );

    const assignment = await testPool.query(
      `SELECT role_id
       FROM project_member_roles
       WHERE project_id = $1
         AND user_id = $2
         AND role_id = $3`,
      [projectId, targetUserId, roleId]
    );

    expect(assignment.rowCount).toBe(0);
  });


  it("should allow a project member with project.members.manage to assign and remove custom roles", async () => {
    // Create the custom role that grants member-management permission.
    const managerRoleId = await createCustomRole(
      "project",
      "api_test_project_manager"
    );

    // Retrieve the project's available permissions.
    const permissionsResponse = await request(app)
      .get(`/api/organizations/${organizationId}/permissions?scope=project`)
      .set("Origin", allowedOrigin)
      .set("Cookie", sessionCookies.get(ownerId)!);

    expect(permissionsResponse.status).toBe(200);

    const managePermission = permissionsResponse.body.permissions.find(
      (permission: { key: string }) =>
        permission.key === "project.members.manage"
    );

    expect(managePermission).toBeDefined();

    // Grant project.members.manage to the custom role.
    const grantResponse = await request(app)
      .put(
        `/api/organizations/${organizationId}/roles/${managerRoleId}/permissions`
      )
      .set("Origin", allowedOrigin)
      .set("Cookie", sessionCookies.get(ownerId)!)
      .send({
        permissionIds: [managePermission.id],
      });

    expect(grantResponse.status).toBe(200);

    // Create another custom role to assign to the target member.
    const targetRoleId = await createCustomRole(
      "project",
      "api_test_delegated_role"
    );

    // The project owner assigns the manager role to the regular member.
    const managerAssignmentResponse = await authenticatedPost(
      `/api/projects/${projectId}/members/${regularMemberId}/roles/${managerRoleId}`,
      ownerId
    );

    expect(managerAssignmentResponse.status).toBe(200);

    // The regular member can now assign a custom role to another member.
    const assignResponse = await authenticatedPost(
      `/api/projects/${projectId}/members/${targetUserId}/roles/${targetRoleId}`,
      regularMemberId
    );

    expect(assignResponse.status).toBe(200);

    const assigned = await testPool.query(
      `SELECT role_id
     FROM project_member_roles
     WHERE project_id = $1
       AND user_id = $2
       AND role_id = $3`,
      [projectId, targetUserId, targetRoleId]
    );

    expect(assigned.rowCount).toBe(1);

    // The same permission also authorizes removal.
    const removeResponse = await authenticatedDelete(
      `/api/projects/${projectId}/members/${targetUserId}/roles/${targetRoleId}`,
      regularMemberId
    );

    expect(removeResponse.status).toBe(200);

    const removed = await testPool.query(
      `SELECT role_id
     FROM project_member_roles
     WHERE project_id = $1
       AND user_id = $2
       AND role_id = $3`,
      [projectId, targetUserId, targetRoleId]
    );

    expect(removed.rowCount).toBe(0);
  });
});

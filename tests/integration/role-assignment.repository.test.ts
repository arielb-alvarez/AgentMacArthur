import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { testPool } from "../../src/config/test-database.js";
import { PostgresTransactionManager } from "../../src/database/transaction-manager.js";

import {
  clearIdentityTestDatabase,
  setupTestDatabase,
} from "../helpers/database-setup.js";

import { PostgresUserRepository } from "../../src/users/postgres-user.repository.js";
import { PostgresOrganizationRepository } from "../../src/organizations/postgres-organization.repository.js";
import { PostgresOrganizationMemberRepository } from "../../src/organization-members/postgres-organization-member.repository.js";
import { PostgresProjectRepository } from "../../src/projects/postgres-project.repository.js";
import { PostgresProjectMemberRepository } from "../../src/project-members/postgres-project-member.repository.js";
import { PostgresRoleAssignmentRepository } from "../../src/role-assignments/postgres-role-assignment.repository.js";

import { ProjectService } from "../../src/projects/project.service.js";

describe("PostgresRoleAssignmentRepository integration", () => {
  const transactionManager = new PostgresTransactionManager(testPool);

  const userRepository = new PostgresUserRepository(
    testPool,
    transactionManager
  );

  const organizationRepository = new PostgresOrganizationRepository(
    testPool,
    transactionManager
  );

  const organizationMemberRepository =
    new PostgresOrganizationMemberRepository(
      testPool,
      transactionManager
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

  const roleAssignmentRepository =
    new PostgresRoleAssignmentRepository(
      testPool,
      transactionManager
    );

  const projectService = new ProjectService(
    projectRepository,
    projectMemberRepository,
    organizationMemberRepository,
    roleAssignmentRepository,
    transactionManager
    );

  const createUser = async (email: string) => {
    return userRepository.create({
      email,
      passwordHash: "test-password-hash",
      displayName: "Test User",
    });
  };

  const createOrganization = async (ownerUserId: string) => {
    return transactionManager.runInTransaction(
      "createRoleAssignmentTestOrganization",
      async (client) => {
        const organization = await organizationRepository.create(
          {
            name: "Role Assignment Workspace",
            slug: `workspace-${crypto.randomUUID()}`,
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

        return organization;
      }
    );
  };

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearIdentityTestDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it("should persist an organization role assignment", async () => {
    const user = await createUser("org-owner@example.com");
    const organization = await createOrganization(user.id);

    await roleAssignmentRepository.assignOrganizationRole({
      organizationId: organization.id,
      userId: user.id,
      roleKey: "owner",
      assignedBy: user.id,
    });

    const result = await testPool.query(
      `SELECT
         r.scope,
         r.key,
         r.is_system,
         omr.assigned_by
       FROM organization_member_roles omr
       INNER JOIN roles r ON r.id = omr.role_id
       WHERE omr.organization_id = $1
         AND omr.user_id = $2`,
      [organization.id, user.id]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      scope: "organization",
      key: "owner",
      is_system: true,
      assigned_by: user.id,
    });
  });

  it("should not create duplicate organization role assignments", async () => {
    const user = await createUser("duplicate-org@example.com");
    const organization = await createOrganization(user.id);

    const input = {
      organizationId: organization.id,
      userId: user.id,
      roleKey: "owner",
      assignedBy: user.id,
    };

    await roleAssignmentRepository.assignOrganizationRole(input);
    await roleAssignmentRepository.assignOrganizationRole(input);

    const result = await testPool.query(
      `SELECT COUNT(*)::int AS count
       FROM organization_member_roles omr
       INNER JOIN roles r ON r.id = omr.role_id
       WHERE omr.organization_id = $1
         AND omr.user_id = $2
         AND r.key = $3`,
      [organization.id, user.id, "owner"]
    );

    expect(result.rows[0]?.count).toBe(1);
  });

  it("should persist a project role assignment", async () => {
    const user = await createUser("project-owner@example.com");
    const organization = await createOrganization(user.id);

    const project = await projectService.create(user.id, {
      organizationId: organization.id,
      name: "Role Assignment Test Project",
    });

    await roleAssignmentRepository.assignProjectRole({
      projectId: project.id,
      organizationId: organization.id,
      userId: user.id,
      roleKey: "code_reviewer",
      assignedBy: user.id,
    });

    const result = await testPool.query(
      `SELECT
        r.scope,
        r.key,
        r.is_system,
        pmr.assigned_by
      FROM project_member_roles pmr
      INNER JOIN roles r ON r.id = pmr.role_id
      WHERE pmr.project_id = $1
        AND pmr.user_id = $2
        AND r.key = $3`,
      [project.id, user.id, "code_reviewer"]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      scope: "project",
      key: "code_reviewer",
      is_system: true,
      assigned_by: user.id,
    });
  });

  it("should reject assigning a project role without project membership", async () => {
    const owner = await createUser("membership-owner@example.com");
    const otherUser = await createUser("non-member@example.com");
    const organization = await createOrganization(owner.id);

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Membership Constraint Test",
    });

    await expect(
      roleAssignmentRepository.assignProjectRole({
        projectId: project.id,
        organizationId: organization.id,
        userId: otherUser.id,
        roleKey: "developer",
        assignedBy: owner.id,
      })
    ).rejects.toThrow();

    const result = await testPool.query(
      `SELECT COUNT(*)::int AS count
       FROM project_member_roles
       WHERE project_id = $1
         AND user_id = $2`,
      [project.id, otherUser.id]
    );

    expect(result.rows[0]?.count).toBe(0);
  });

  it("should reject assigning an unknown organization role", async () => {
    const user = await createUser("unknown-org@example.com");
    const organization = await createOrganization(user.id);

    await expect(
      roleAssignmentRepository.assignOrganizationRole({
        organizationId: organization.id,
        userId: user.id,
        roleKey: "unknown_role",
        assignedBy: user.id,
      })
    ).rejects.toThrow(
      'Built-in organization role "unknown_role" does not exist.'
    );
  });

  it("should reject assigning an unknown project role", async () => {
    const user = await createUser("unknown-project@example.com");
    const organization = await createOrganization(user.id);

    const project = await projectService.create(user.id, {
      organizationId: organization.id,
      name: "Unknown Role Test",
    });

    await expect(
      roleAssignmentRepository.assignProjectRole({
        projectId: project.id,
        organizationId: organization.id,
        userId: user.id,
        roleKey: "unknown_role",
        assignedBy: user.id,
      })
    ).rejects.toThrow(
      'Built-in project role "unknown_role" does not exist.'
    );
  });
});

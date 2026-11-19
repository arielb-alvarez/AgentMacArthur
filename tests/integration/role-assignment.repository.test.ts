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
import { PostgresOrganizationPermissionRepository } from "../../src/permissions/postgres-organization-permission.repository.js";
import { OrganizationPermissionService } from "../../src/permissions/organization-permission.service.js";

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

  const organizationPermissionRepository =
    new PostgresOrganizationPermissionRepository(
      testPool,
      transactionManager
    );

  const organizationPermissionService =
    new OrganizationPermissionService(
      organizationPermissionRepository
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
    organizationPermissionService,
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

  it("should discover only built-in base roles and exclude custom roles", async () => {
    const owner = await createUser("base-role-discovery@example.com");
    const organization = await createOrganization(owner.id);
    const member = await createUser("custom-role-member@example.com");

    await organizationMemberRepository.create({
      organizationId: organization.id,
      userId: member.id,
      role: "member",
      status: "active",
    });

    await roleAssignmentRepository.assignOrganizationRole({
      organizationId: organization.id,
      userId: member.id,
      roleKey: "member",
      assignedBy: owner.id,
    });

    const customRoleResult = await testPool.query(
      `INSERT INTO roles (
         organization_id,
         scope,
         key,
         name,
         description,
         is_system
       )
       VALUES ($1, 'organization', 'custom_analyst', 'Custom Analyst',
               'Organization-specific test role', FALSE)
       RETURNING id`,
      [organization.id]
    );

    await testPool.query(
      `INSERT INTO organization_member_roles (
         organization_id,
         user_id,
         role_id,
         assigned_by
       )
       VALUES ($1, $2, $3, $4)`,
      [
        organization.id,
        member.id,
        customRoleResult.rows[0].id,
        owner.id,
      ]
    );

    const result =
      await roleAssignmentRepository.findOrganizationBaseRoles(
        organization.id,
        member.id
      );

    expect(result).toEqual(["member"]);
  });

  it("should replace a member's base role while preserving custom role assignments", async () => {
    const owner = await createUser("base-role-owner@example.com");
    const organization = await createOrganization(owner.id);
    const member = await createUser("base-role-target@example.com");

    await organizationMemberRepository.create({
      organizationId: organization.id,
      userId: member.id,
      role: "member",
      status: "active",
    });

    await roleAssignmentRepository.assignOrganizationRole({
      organizationId: organization.id,
      userId: member.id,
      roleKey: "member",
      assignedBy: owner.id,
    });

    const customRoleResult = await testPool.query(
      `INSERT INTO roles (
         organization_id,
         scope,
         key,
         name,
         description,
         is_system
       )
       VALUES ($1, 'organization', 'custom_analyst', 'Custom Analyst',
               'Organization-specific test role', FALSE)
       RETURNING id`,
      [organization.id]
    );

    await testPool.query(
      `INSERT INTO organization_member_roles (
         organization_id,
         user_id,
         role_id,
         assigned_by
       )
       VALUES ($1, $2, $3, $4)`,
      [
        organization.id,
        member.id,
        customRoleResult.rows[0].id,
        owner.id,
      ]
    );

    await transactionManager.runInTransaction(
      "replaceOrganizationBaseRoleIntegrationTest",
      async (client) => {
        await roleAssignmentRepository.replaceOrganizationBaseRole(
          {
            organizationId: organization.id,
            userId: member.id,
            roleKey: "admin",
            assignedBy: owner.id,
          },
          client
        );
      }
    );

    const result = await testPool.query(
      `SELECT r.key, r.is_system
       FROM organization_member_roles omr
       INNER JOIN roles r ON r.id = omr.role_id
       WHERE omr.organization_id = $1
         AND omr.user_id = $2
       ORDER BY r.key`,
      [organization.id, member.id]
    );

    expect(result.rows).toEqual([
      { key: "admin", is_system: true },
      { key: "custom_analyst", is_system: false },
    ]);

    const baseRoles =
      await roleAssignmentRepository.findOrganizationBaseRoles(
        organization.id,
        member.id
      );

    expect(baseRoles).toEqual(["admin"]);
  });


  it("should assign, deduplicate, and remove an organization custom role", async () => {
    const owner = await createUser("org-custom-owner@example.com");
    const organization = await createOrganization(owner.id);
    const member = await createUser("org-custom-member@example.com");

    await organizationMemberRepository.create({
      organizationId: organization.id,
      userId: member.id,
      role: "member",
      status: "active",
    });

    const roleResult = await testPool.query(
      `INSERT INTO roles (
         organization_id,
         scope,
         key,
         name,
         description,
         is_system
       )
       VALUES ($1, 'organization', 'custom_analyst', 'Custom Analyst',
               'Organization custom role test', FALSE)
       RETURNING id`,
      [organization.id]
    );

    const input = {
      organizationId: organization.id,
      userId: member.id,
      roleId: roleResult.rows[0].id,
      assignedBy: owner.id,
    };

    await roleAssignmentRepository.assignOrganizationCustomRole(input);
    await roleAssignmentRepository.assignOrganizationCustomRole(input);

    const assigned = await testPool.query(
      `SELECT COUNT(*)::int AS count
       FROM organization_member_roles
       WHERE organization_id = $1
         AND user_id = $2
         AND role_id = $3`,
      [organization.id, member.id, input.roleId]
    );

    expect(assigned.rows[0]?.count).toBe(1);

    await roleAssignmentRepository.removeOrganizationCustomRole(input);

    const removed = await testPool.query(
      `SELECT COUNT(*)::int AS count
       FROM organization_member_roles
       WHERE organization_id = $1
         AND user_id = $2
         AND role_id = $3`,
      [organization.id, member.id, input.roleId]
    );

    expect(removed.rows[0]?.count).toBe(0);
  });

  it("should reject an organization custom role owned by another organization", async () => {
    const ownerA = await createUser("org-custom-owner-a@example.com");
    const organizationA = await createOrganization(ownerA.id);
    const member = await createUser("org-custom-target-a@example.com");

    await organizationMemberRepository.create({
      organizationId: organizationA.id,
      userId: member.id,
      role: "member",
      status: "active",
    });

    const ownerB = await createUser("org-custom-owner-b@example.com");
    const organizationB = await createOrganization(ownerB.id);

    const roleResult = await testPool.query(
      `INSERT INTO roles (
         organization_id,
         scope,
         key,
         name,
         description,
         is_system
       )
       VALUES ($1, 'organization', 'foreign_analyst', 'Foreign Analyst',
               'Role belonging to another organization', FALSE)
       RETURNING id`,
      [organizationB.id]
    );

    await expect(
      roleAssignmentRepository.assignOrganizationCustomRole({
        organizationId: organizationA.id,
        userId: member.id,
        roleId: roleResult.rows[0].id,
        assignedBy: ownerA.id,
      })
    ).rejects.toThrow(/Cannot assign custom organization role/);

    const assignments = await testPool.query(
      `SELECT COUNT(*)::int AS count
       FROM organization_member_roles
       WHERE organization_id = $1
         AND user_id = $2`,
      [organizationA.id, member.id]
    );

    expect(assignments.rows[0]?.count).toBe(0);
  });

  it("should assign, deduplicate, and remove a project custom role", async () => {
    const owner = await createUser("project-custom-owner@example.com");
    const organization = await createOrganization(owner.id);

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Project Custom Role Test",
    });

    const roleResult = await testPool.query(
      `INSERT INTO roles (
         organization_id,
         scope,
         key,
         name,
         description,
         is_system
       )
       VALUES ($1, 'project', 'custom_technical_advisor',
               'Custom Technical Advisor',
               'Project custom role test', FALSE)
       RETURNING id`,
      [organization.id]
    );

    const input = {
      projectId: project.id,
      organizationId: organization.id,
      userId: owner.id,
      roleId: roleResult.rows[0].id,
      assignedBy: owner.id,
    };

    await roleAssignmentRepository.assignProjectCustomRole(input);
    await roleAssignmentRepository.assignProjectCustomRole(input);

    const assigned = await testPool.query(
      `SELECT COUNT(*)::int AS count
       FROM project_member_roles
       WHERE project_id = $1
         AND organization_id = $2
         AND user_id = $3
         AND role_id = $4`,
      [
        project.id,
        organization.id,
        owner.id,
        input.roleId,
      ]
    );

    expect(assigned.rows[0]?.count).toBe(1);

    await roleAssignmentRepository.removeProjectCustomRole(input);

    const removed = await testPool.query(
      `SELECT COUNT(*)::int AS count
       FROM project_member_roles
       WHERE project_id = $1
         AND organization_id = $2
         AND user_id = $3
         AND role_id = $4`,
      [
        project.id,
        organization.id,
        owner.id,
        input.roleId,
      ]
    );

    expect(removed.rows[0]?.count).toBe(0);
  });

  it("should reject a project custom role owned by another organization", async () => {
    const ownerA = await createUser("project-custom-owner-a@example.com");
    const organizationA = await createOrganization(ownerA.id);

    const project = await projectService.create(ownerA.id, {
      organizationId: organizationA.id,
      name: "Foreign Custom Role Test",
    });

    const ownerB = await createUser("project-custom-owner-b@example.com");
    const organizationB = await createOrganization(ownerB.id);

    const roleResult = await testPool.query(
      `INSERT INTO roles (
         organization_id,
         scope,
         key,
         name,
         description,
         is_system
       )
       VALUES ($1, 'project', 'foreign_developer', 'Foreign Developer',
               'Role belonging to another organization', FALSE)
       RETURNING id`,
      [organizationB.id]
    );

    await expect(
      roleAssignmentRepository.assignProjectCustomRole({
        projectId: project.id,
        organizationId: organizationA.id,
        userId: ownerA.id,
        roleId: roleResult.rows[0].id,
        assignedBy: ownerA.id,
      })
    ).rejects.toThrow(/Cannot assign custom project role/);

    const assignments = await testPool.query(
      `SELECT COUNT(*)::int AS count
       FROM project_member_roles
       WHERE project_id = $1
         AND user_id = $2
         AND role_id = $3`,
      [project.id, ownerA.id, roleResult.rows[0].id]
    );

    expect(assignments.rows[0]?.count).toBe(0);
  });

  it("should preserve additive behavior when assigning organization roles", async () => {
    const owner = await createUser("additive-role-owner@example.com");
    const organization = await createOrganization(owner.id);

    await roleAssignmentRepository.assignOrganizationRole({
      organizationId: organization.id,
      userId: owner.id,
      roleKey: "admin",
      assignedBy: owner.id,
    });

    const result = await testPool.query(
      `SELECT r.key
       FROM organization_member_roles omr
       INNER JOIN roles r ON r.id = omr.role_id
       WHERE omr.organization_id = $1
         AND omr.user_id = $2
       ORDER BY r.key`,
      [organization.id, owner.id]
    );

    expect(result.rows.map((row) => row.key)).toEqual([
      "admin",
      "owner",
    ]);
  });
});

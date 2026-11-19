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

describe("ProjectService integration", () => {
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

  const organizationPermissionRepository =
    new PostgresOrganizationPermissionRepository(
      testPool,
      transactionManager
    );

  const organizationPermissionService =
    new OrganizationPermissionService(
      organizationPermissionRepository
    );

  const projectService = new ProjectService(
    projectRepository,
    projectMemberRepository,
    organizationMemberRepository,
    roleAssignmentRepository,
    organizationPermissionService,
    transactionManager
  );

  const createUser = async (
    email: string,
    displayName = "Test User"
  ) => {
    return userRepository.create({
      email,
      passwordHash: "test-password-hash",
      displayName,
    });
  };

  const createOrganization = async (
    ownerUserId: string,
    slug: string
  ) => {
    return transactionManager.runInTransaction(
      "createTestOrganization",
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
    userId: string,
    role: "admin" | "member" = "member"
  ) => {
    return transactionManager.runInTransaction(
      "addTestOrganizationMember",
      async (client) => {
        const membership = await organizationMemberRepository.create(
          {
            organizationId,
            userId,
            role,
            status: "active",
          },
          client
        );

        await roleAssignmentRepository.assignOrganizationRole(
          {
            organizationId,
            userId,
            roleKey: role,
          },
          client
        );

        return membership;
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

  it("should create a project and persist the creator as project owner", async () => {
    const owner = await createUser("owner@example.com");
    const organization = await createOrganization(
      owner.id,
      "owner-workspace"
    );

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "AgentMacarthur",
      description: "AI-powered project management platform",
    });

    expect(project.id).toBeDefined();
    expect(project.organizationId).toBe(organization.id);
    expect(project.name).toBe("AgentMacarthur");
    expect(project.description).toBe(
      "AI-powered project management platform"
    );
    expect(project.status).toBe("draft");
    expect(project.createdBy).toBe(owner.id);

    const membership =
      await projectMemberRepository.findByProjectAndUser(
        project.id,
        owner.id
      );

    expect(membership).toBeDefined();
    expect(membership?.role).toBe("project_owner");
    expect(membership?.status).toBe("active");

    const roleAssignment = await testPool.query<{
      scope: string;
      key: string;
      assigned_by: string;
    }>(
      `SELECT r.scope, r.key, pmr.assigned_by
      FROM project_member_roles pmr
      INNER JOIN roles r ON r.id = pmr.role_id
      WHERE pmr.project_id = $1
        AND pmr.user_id = $2`,
      [project.id, owner.id]
    );

    expect(roleAssignment.rows).toHaveLength(1);
    expect(roleAssignment.rows[0]).toMatchObject({
      scope: "project",
      key: "project_owner",
      assigned_by: owner.id,
    });
  });

  it("should allow an active organization member to create a project", async () => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");

    const organization = await createOrganization(
      owner.id,
      "member-workspace"
    );

    await addOrganizationMember(organization.id, member.id);

    const project = await projectService.create(member.id, {
      organizationId: organization.id,
      name: "Member Created Project",
    });

    const membership =
      await projectMemberRepository.findByProjectAndUser(
        project.id,
        member.id
      );

    expect(project.createdBy).toBe(member.id);
    expect(membership?.role).toBe("project_owner");
  });

  it("should reject project creation by a suspended organization member", async () => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("suspended@example.com");

    const organization = await createOrganization(
      owner.id,
      "suspended-workspace"
    );

    await addOrganizationMember(organization.id, member.id);

    await testPool.query(
      `UPDATE organization_members
       SET status = 'suspended'
       WHERE organization_id = $1
         AND user_id = $2`,
      [organization.id, member.id]
    );

    await expect(
      projectService.create(member.id, {
        organizationId: organization.id,
        name: "Should Not Exist",
      })
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    const projects = await projectRepository.findByOrganizationId(
      organization.id
    );

    expect(projects).toHaveLength(0);
  });

  it("should list only projects accessible to the current user", async () => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");
    const otherOwner = await createUser("other@example.com");

    const organization = await createOrganization(
      owner.id,
      "first-workspace"
    );

    const otherOrganization = await createOrganization(
      otherOwner.id,
      "second-workspace"
    );

    await addOrganizationMember(organization.id, member.id);

    const ownerProject = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Owner Project",
    });

    const memberProject = await projectService.create(member.id, {
      organizationId: organization.id,
      name: "Member Project",
    });

    await projectService.create(otherOwner.id, {
      organizationId: otherOrganization.id,
      name: "Other Organization Project",
    });

    const ownerProjects = await projectService.list(owner.id);
    const memberProjects = await projectService.list(member.id);

    expect(ownerProjects).toHaveLength(2);
    expect(memberProjects).toHaveLength(1);
    expect(memberProjects[0]?.id).toBe(memberProject.id);
    expect(
      memberProjects.some(
        (item) => item.id === ownerProject.id
      )
    ).toBe(false);
  });

  it("should allow organization admins to view all organization projects", async () => {
    const owner = await createUser("owner@example.com");
    const admin = await createUser("admin@example.com");
    const developer = await createUser("developer@example.com");

    const organization = await createOrganization(
      owner.id,
      "admin-workspace"
    );

    await addOrganizationMember(
      organization.id,
      admin.id,
      "admin"
    );

    await addOrganizationMember(
      organization.id,
      developer.id
    );

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Private Project",
    });

    const adminProjects = await projectService.list(admin.id);

    expect(adminProjects).toHaveLength(1);
    expect(adminProjects[0]?.id).toBe(project.id);

    await expect(
      projectService.getById(project.id, admin.id)
    ).resolves.toMatchObject({
      id: project.id,
    });
  });

  it("should not expose projects to suspended organization members", async () => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");

    const organization = await createOrganization(
      owner.id,
      "access-workspace"
    );

    await addOrganizationMember(organization.id, member.id);

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Restricted Project",
    });

    await projectMemberRepository.create({
      projectId: project.id,
      organizationId: organization.id,
      userId: member.id,
      role: "developer",
      status: "active",
    });

    await testPool.query(
      `UPDATE organization_members
       SET status = 'suspended'
       WHERE organization_id = $1
         AND user_id = $2`,
      [organization.id, member.id]
    );

    const projects = await projectService.list(member.id);

    expect(projects).toHaveLength(0);

    await expect(
      projectService.getById(project.id, member.id)
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("should not expose a project to a suspended project member", async () => {
    const owner = await createUser("owner@example.com");
    const member = await createUser("member@example.com");

    const organization = await createOrganization(
      owner.id,
      "project-membership-workspace"
    );

    await addOrganizationMember(organization.id, member.id);

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Restricted Project",
    });

    await projectMemberRepository.create({
      projectId: project.id,
      organizationId: organization.id,
      userId: member.id,
      role: "developer",
      status: "suspended",
    });

    await roleAssignmentRepository.assignProjectRole({
      projectId: project.id,
      organizationId: organization.id,
      userId: member.id,
      roleKey: "developer",
    });

    const projects = await projectService.list(member.id);

    expect(projects).toHaveLength(0);

    await expect(
      projectService.getById(project.id, member.id)
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("should allow a project owner to update project details and status", async () => {
    const owner = await createUser("owner@example.com");
    const organization = await createOrganization(
      owner.id,
      "update-workspace"
    );

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Original Project",
    });

    const updated = await projectService.update(
      project.id,
      owner.id,
      {
        name: "Updated Project",
        description: "Updated description",
      }
    );

    expect(updated.name).toBe("Updated Project");
    expect(updated.description).toBe("Updated description");

    const statusUpdated = await projectService.updateStatus(
      project.id,
      owner.id,
      "active"
    );

    expect(statusUpdated.status).toBe("active");
  });

  it("should deny project updates to regular project members", async () => {
    const owner = await createUser("owner@example.com");
    const developer = await createUser("developer@example.com");

    const organization = await createOrganization(
      owner.id,
      "developer-workspace"
    );

    await addOrganizationMember(organization.id, developer.id);

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Protected Project",
    });

    await projectMemberRepository.create({
      projectId: project.id,
      organizationId: organization.id,
      userId: developer.id,
      role: "developer",
      status: "active",
    });

    await roleAssignmentRepository.assignProjectRole({
      projectId: project.id,
      organizationId: organization.id,
      userId: developer.id,
      roleKey: "developer",
    });

    await expect(
      projectService.update(project.id, developer.id, {
        name: "Unauthorized Update",
      })
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    await expect(
      projectService.updateStatus(
        project.id,
        developer.id,
        "completed"
      )
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("should allow organization admins to update projects without project membership", async () => {
    const owner = await createUser("owner@example.com");
    const admin = await createUser("admin@example.com");

    const organization = await createOrganization(
      owner.id,
      "admin-update-workspace"
    );

    await addOrganizationMember(
      organization.id,
      admin.id,
      "admin"
    );

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Admin Managed Project",
    });

    const updated = await projectService.update(
      project.id,
      admin.id,
      {
        name: "Admin Updated Project",
      }
    );

    expect(updated.name).toBe("Admin Updated Project");

    const adminMembership =
      await projectMemberRepository.findByProjectAndUser(
        project.id,
        admin.id
      );

    expect(adminMembership).toBeUndefined();
  });

  it("should roll back project creation if initial membership creation fails", async () => {
    const owner = await createUser("rollback@example.com");
    const organization = await createOrganization(
      owner.id,
      "rollback-workspace"
    );

    const failingProjectMemberRepository = {
      create: async () => {
        throw new Error("Simulated membership persistence failure");
      },
      findByProjectAndUser:
        projectMemberRepository.findByProjectAndUser.bind(
          projectMemberRepository
        ),
      findByProjectId:
        projectMemberRepository.findByProjectId.bind(
          projectMemberRepository
        ),
      findByUserId:
        projectMemberRepository.findByUserId.bind(
          projectMemberRepository
        ),
    };

    const failingService = new ProjectService(
      projectRepository,
      failingProjectMemberRepository,
      organizationMemberRepository,
      roleAssignmentRepository,
      organizationPermissionService,
      transactionManager
    );

    await expect(
      failingService.create(owner.id, {
        organizationId: organization.id,
        name: "Rollback Project",
      })
    ).rejects.toThrow(
      "Simulated membership persistence failure"
    );

    const projects = await projectRepository.findByOrganizationId(
      organization.id
    );

    expect(projects).toHaveLength(0);
  });

  it("should roll back project and membership creation if project owner role assignment fails", async () => {
    const owner = await createUser("role-rollback@example.com");
    const organization = await createOrganization(
      owner.id,
      "role-rollback-workspace"
    );

    const failingRoleAssignmentRepository = {
      assignOrganizationRole:
        roleAssignmentRepository.assignOrganizationRole.bind(
          roleAssignmentRepository
        ),
      assignProjectRole: async () => {
        throw new Error("Simulated project role assignment failure");
      },
    };

    const failingService = new ProjectService(
      projectRepository,
      projectMemberRepository,
      organizationMemberRepository,
      failingRoleAssignmentRepository,
      organizationPermissionService,
      transactionManager
    );

    await expect(
      failingService.create(owner.id, {
        organizationId: organization.id,
        name: "Role Rollback Project",
      })
    ).rejects.toThrow(
      "Simulated project role assignment failure"
    );

    const projects = await projectRepository.findByOrganizationId(
      organization.id
    );

    expect(projects).toHaveLength(0);

    const memberships = await testPool.query(
      `SELECT project_id
      FROM project_members
      WHERE organization_id = $1
        AND user_id = $2`,
      [organization.id, owner.id]
    );

    expect(memberships.rows).toHaveLength(0);

    const roleAssignments = await testPool.query(
      `SELECT pmr.project_id
      FROM project_member_roles pmr
      INNER JOIN projects p ON p.id = pmr.project_id
      WHERE p.organization_id = $1`,
      [organization.id]
    );

    expect(roleAssignments.rows).toHaveLength(0);
    expect(memberships.rows).toHaveLength(0);
  });

  it("should query project memberships by project and user", async () => {
    const owner = await createUser("repository-owner@example.com");
    const member = await createUser("repository-member@example.com");

    const organization = await createOrganization(
      owner.id,
      "repository-members-workspace"
    );

    await addOrganizationMember(organization.id, member.id);

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Repository Membership Project",
    });

    const createdMember = await projectMemberRepository.create({
      projectId: project.id,
      organizationId: organization.id,
      userId: member.id,
      role: "developer",
    });

    expect(createdMember.status).toBe("active");

    const byProjectAndUser =
      await projectMemberRepository.findByProjectAndUser(
        project.id,
        member.id
      );

    expect(byProjectAndUser).toMatchObject({
      projectId: project.id,
      organizationId: organization.id,
      userId: member.id,
      role: "developer",
      status: "active",
    });

    const missingMember =
      await projectMemberRepository.findByProjectAndUser(
        project.id,
        "00000000-0000-4000-8000-000000000004"
      );

    expect(missingMember).toBeUndefined();
  });

  it("should list project memberships by project and user", async () => {
    const owner = await createUser("list-owner@example.com");
    const member = await createUser("list-member@example.com");
    const unrelatedUser = await createUser("list-unrelated@example.com");

    const organization = await createOrganization(
      owner.id,
      "repository-list-workspace"
    );

    await addOrganizationMember(organization.id, member.id);
    await addOrganizationMember(organization.id, unrelatedUser.id);

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Repository List Project",
    });

    await projectMemberRepository.create({
      projectId: project.id,
      organizationId: organization.id,
      userId: member.id,
      role: "developer",
      status: "suspended",
    });

    const projectMembers =
      await projectMemberRepository.findByProjectId(project.id);

    expect(projectMembers).toHaveLength(2);
    expect(projectMembers.map((item) => item.userId)).toContain(owner.id);
    expect(projectMembers.map((item) => item.userId)).toContain(member.id);

    const userMemberships =
      await projectMemberRepository.findByUserId(member.id);

    expect(userMemberships).toHaveLength(1);
    expect(userMemberships[0]).toMatchObject({
      projectId: project.id,
      userId: member.id,
      role: "developer",
      status: "suspended",
    });

    expect(
      await projectMemberRepository.findByUserId(unrelatedUser.id)
    ).toHaveLength(0);
  });

  it("should filter accessible projects by organization", async () => {
    const owner = await createUser("filter-owner@example.com");
    const member = await createUser("filter-member@example.com");
    const otherOwner = await createUser("filter-other@example.com");

    const organization = await createOrganization(
      owner.id,
      "repository-filter-workspace"
    );

    const otherOrganization = await createOrganization(
      otherOwner.id,
      "repository-other-filter-workspace"
    );

    await addOrganizationMember(organization.id, member.id);
    await addOrganizationMember(otherOrganization.id, member.id);

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Filtered Project",
    });

    await projectService.create(otherOwner.id, {
      organizationId: otherOrganization.id,
      name: "Other Filtered Project",
    });

    const filteredProjects =
      await projectRepository.findAccessibleByUserId(
        member.id,
        organization.id
      );

    expect(filteredProjects).toHaveLength(0);

    const ownerProjects =
      await projectRepository.findAccessibleByUserId(
        owner.id,
        organization.id
      );

    expect(ownerProjects).toHaveLength(1);
    expect(ownerProjects[0]?.id).toBe(project.id);
  });

  it("should update project descriptions including clearing them", async () => {
    const owner = await createUser("description-owner@example.com");

    const organization = await createOrganization(
      owner.id,
      "repository-description-workspace"
    );

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Description Project",
      description: "Original description",
    });

    const cleared = await projectRepository.update(
      project.id,
      organization.id,
      { description: null }
    );

    expect(cleared?.description).toBeNull();

    const renamed = await projectRepository.update(
      project.id,
      organization.id,
      { name: "Renamed Description Project" }
    );

    expect(renamed?.name).toBe("Renamed Description Project");
    expect(renamed?.description).toBeNull();
  });

  it("should return undefined when updating a project outside its organization", async () => {
    const owner = await createUser("missing-owner@example.com");

    const organization = await createOrganization(
      owner.id,
      "repository-missing-workspace"
    );

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Existing Project",
    });

    const wrongOrganizationUpdate =
      await projectRepository.update(
        project.id,
        "00000000-0000-4000-8000-000000000001",
        { name: "Should Not Update" }
      );

    const missingStatusUpdate =
      await projectRepository.updateStatus(
        "00000000-0000-4000-8000-000000000002",
        organization.id,
        { status: "completed" }
      );

    expect(wrongOrganizationUpdate).toBeUndefined();
    expect(missingStatusUpdate).toBeUndefined();
  });

  it("should find projects by ID and enforce organization scope", async () => {
    const owner = await createUser("lookup-owner@example.com");
    const otherOwner = await createUser("lookup-other@example.com");

    const organization = await createOrganization(
      owner.id,
      "repository-lookup-workspace"
    );

    const otherOrganization = await createOrganization(
      otherOwner.id,
      "repository-other-lookup-workspace"
    );

    const project = await projectService.create(owner.id, {
      organizationId: organization.id,
      name: "Lookup Project",
    });

    await expect(
      projectRepository.findById(project.id)
    ).resolves.toMatchObject({
      id: project.id,
      organizationId: organization.id,
    });

    await expect(
      projectRepository.findByIdAndOrganization(
        project.id,
        otherOrganization.id
      )
    ).resolves.toBeUndefined();

    await expect(
      projectRepository.findById(
        "00000000-0000-4000-8000-000000000003"
      )
    ).resolves.toBeUndefined();
  });
});

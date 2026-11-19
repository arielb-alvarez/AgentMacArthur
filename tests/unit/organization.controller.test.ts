import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { createOrganizationController } from "../../src/controllers/organization.controller.js";
import type { OrganizationService } from "../../src/organizations/organization.service.js";
import type { OrganizationMemberService } from "../../src/organization-members/organization-member.service.js";
import type { RoleManagementService } from "../../src/role-management/role-management.service.js";

const userId = "user-123";
const organizationId = "organization-123";
const memberUserId = "member-456";

const testOrganization = {
  id: organizationId,
  name: "Test Organization",
};

const testMember = {
  userId: memberUserId,
  email: "member@example.com",
};

const createRequest = (
  options: {
    authenticated?: boolean;
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {}
) =>
  ({
    auth: options.authenticated === false
      ? undefined
      : { user: { id: userId } },
    body: options.body ?? {},
  }) as unknown as Request;

const createResponse = (
  params: Record<string, string> = {},
  query: Record<string, string> = {}
) => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  locals: {
    validatedRequest: { params, query },
  },
});

describe("Organization Controller", () => {
  let organizationService: {
    list: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    transferOwnership: ReturnType<typeof vi.fn>;
  };

  let organizationMemberService: {
    listMembers: ReturnType<typeof vi.fn>;
    getMember: ReturnType<typeof vi.fn>;
    suspendMember: ReturnType<typeof vi.fn>;
    reactivateMember: ReturnType<typeof vi.fn>;
    changeMemberRole: ReturnType<typeof vi.fn>;
  };

  let roleManagementService: {
    listRoles: ReturnType<typeof vi.fn>;
    listPermissions: ReturnType<typeof vi.fn>;
    createRole: ReturnType<typeof vi.fn>;
    updateRole: ReturnType<typeof vi.fn>;
    deleteRole: ReturnType<typeof vi.fn>;
    replacePermissions: ReturnType<typeof vi.fn>;
    assignOrganizationCustomRole: ReturnType<typeof vi.fn>;
    removeOrganizationCustomRole: ReturnType<typeof vi.fn>;
  };

  let controller: ReturnType<typeof createOrganizationController>;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    organizationService = {
      list: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      transferOwnership: vi.fn(),
    };

    organizationMemberService = {
      listMembers: vi.fn(),
      getMember: vi.fn(),
      suspendMember: vi.fn(),
      reactivateMember: vi.fn(),
      changeMemberRole: vi.fn(),
    };

    roleManagementService = {
      listRoles: vi.fn(),
      listPermissions: vi.fn(),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn(),
      replacePermissions: vi.fn(),
      assignOrganizationCustomRole: vi.fn(),
      removeOrganizationCustomRole: vi.fn(),
    };

    controller = createOrganizationController(
      organizationService as unknown as OrganizationService,
      organizationMemberService as unknown as OrganizationMemberService,
      roleManagementService as unknown as RoleManagementService
    );

    next = vi.fn();
  });

  it("should list organizations for the authenticated user", async () => {
    organizationService.list.mockResolvedValue([testOrganization]);

    const res = createResponse();

    await controller.list(
      createRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(organizationService.list).toHaveBeenCalledWith(userId);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      organizations: [testOrganization],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should get an organization by ID", async () => {
    organizationService.getById.mockResolvedValue(testOrganization);

    const res = createResponse({ organizationId });

    await controller.getById(
      createRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(organizationService.getById).toHaveBeenCalledWith(
      organizationId,
      userId
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      organization: testOrganization,
    });
  });

  it("should update an organization", async () => {
    const body = { name: "Updated Organization" };
    const updatedOrganization = { ...testOrganization, ...body };

    organizationService.update.mockResolvedValue(updatedOrganization);

    const res = createResponse({ organizationId });

    await controller.update(
      createRequest({ body }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(organizationService.update).toHaveBeenCalledWith(
      organizationId,
      userId,
      body
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Organization updated successfully.",
      organization: updatedOrganization,
    });
  });

  it("should list organization members", async () => {
    organizationMemberService.listMembers.mockResolvedValue([testMember]);

    const res = createResponse({ organizationId });

    await controller.listMembers(
      createRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(organizationMemberService.listMembers).toHaveBeenCalledWith(
      organizationId,
      userId
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      members: [testMember],
    });
  });

  it("should get a specific organization member", async () => {
    organizationMemberService.getMember.mockResolvedValue(testMember);

    const res = createResponse({
      organizationId,
      userId: memberUserId,
    });

    await controller.getMember(
      createRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(organizationMemberService.getMember).toHaveBeenCalledWith(
      organizationId,
      memberUserId,
      userId
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      member: testMember,
    });
  });

  it("should transfer ownership using the authenticated user as requester", async () => {
    const body = { userId: memberUserId };
    const transferredOrganization = {
      ...testOrganization,
      ownerUserId: memberUserId,
    };

    organizationService.transferOwnership.mockResolvedValue(
      transferredOrganization
    );

    const res = createResponse({ organizationId });

    await controller.transferOwnership(
      createRequest({ body }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(organizationService.transferOwnership).toHaveBeenCalledWith(
      organizationId,
      userId,
      memberUserId
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Organization ownership transferred successfully.",
      organization: transferredOrganization,
    });
    expect(next).not.toHaveBeenCalled();
  });

  describe("updateMemberStatus", () => {
    it("should suspend a member when status is suspended", async () => {
      const suspendedMember = {
        ...testMember,
        status: "suspended",
      };

      organizationMemberService.suspendMember.mockResolvedValue(
        suspendedMember
      );

      const res = createResponse({
        organizationId,
        userId: memberUserId,
      });

      await controller.updateMemberStatus(
        createRequest({ body: { status: "suspended" } }),
        res as unknown as Response,
        next as NextFunction
      );

      expect(organizationMemberService.suspendMember).toHaveBeenCalledWith(
        organizationId,
        memberUserId,
        userId
      );

      expect(organizationMemberService.reactivateMember).not.toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Organization member suspended successfully.",
        member: suspendedMember,
      });

      expect(next).not.toHaveBeenCalled();
    });

    it("should reactivate a member when status is active", async () => {
      const activeMember = {
        ...testMember,
        status: "active",
      };

      organizationMemberService.reactivateMember.mockResolvedValue(
        activeMember
      );

      const res = createResponse({
        organizationId,
        userId: memberUserId,
      });

      await controller.updateMemberStatus(
        createRequest({ body: { status: "active" } }),
        res as unknown as Response,
        next as NextFunction
      );

      expect(organizationMemberService.reactivateMember).toHaveBeenCalledWith(
        organizationId,
        memberUserId,
        userId
      );

      expect(organizationMemberService.suspendMember).not.toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Organization member reactivated successfully.",
        member: activeMember,
      });

      expect(next).not.toHaveBeenCalled();
    });

    it("should forward status-update errors to next middleware", async () => {
      organizationMemberService.suspendMember.mockRejectedValue(
        new Error("Status update failed")
      );

      const res = createResponse({
        organizationId,
        userId: memberUserId,
      });

      await controller.updateMemberStatus(
        createRequest({ body: { status: "suspended" } }),
        res as unknown as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Status update failed",
        })
      );

      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("updateMemberRole", () => {
    it("should change a member's base role", async () => {
      const updatedMember = {
        ...testMember,
        role: "admin",
      };

      organizationMemberService.changeMemberRole.mockResolvedValue(
        updatedMember
      );

      const res = createResponse({
        organizationId,
        userId: memberUserId,
      });

      await controller.updateMemberRole(
        createRequest({ body: { role: "admin" } }),
        res as unknown as Response,
        next as NextFunction
      );

      expect(organizationMemberService.changeMemberRole).toHaveBeenCalledWith(
        organizationId,
        memberUserId,
        "admin",
        userId
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Organization member role updated successfully.",
        member: updatedMember,
      });

      expect(next).not.toHaveBeenCalled();
    });

    it("should forward role-update errors to next middleware", async () => {
      organizationMemberService.changeMemberRole.mockRejectedValue(
        new Error("Role update failed")
      );

      const res = createResponse({
        organizationId,
        userId: memberUserId,
      });

      await controller.updateMemberRole(
        createRequest({ body: { role: "member" } }),
        res as unknown as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Role update failed",
        })
      );

      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("Custom role management", () => {
    const roleId = "role-789";
    const permissionId = "permission-101";
    const role = {
      id: roleId,
      name: "Project Reviewer",
      scope: "project",
    };

    it("should list roles with the requested scope", async () => {
      roleManagementService.listRoles.mockResolvedValue([role]);

      const res = createResponse(
        { organizationId },
        { scope: "project" }
      );

      await controller.listRoles(
        createRequest(),
        res as unknown as Response,
        next as NextFunction
      );

      expect(roleManagementService.listRoles).toHaveBeenCalledWith(
        organizationId,
        userId,
        "project"
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        roles: [role],
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should list permissions for the requested scope", async () => {
      const permissions = [{ id: permissionId, key: "project.read" }];
      roleManagementService.listPermissions.mockResolvedValue(permissions);

      const res = createResponse(
        { organizationId },
        { scope: "project" }
      );

      await controller.listPermissions(
        createRequest(),
        res as unknown as Response,
        next as NextFunction
      );

      expect(roleManagementService.listPermissions).toHaveBeenCalledWith(
        organizationId,
        userId,
        "project"
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        permissions,
      });
    });

    it("should create a custom role", async () => {
      const body = {
        scope: "project",
        key: "project_reviewer",
        name: "Project Reviewer",
      };

      roleManagementService.createRole.mockResolvedValue(role);

      const res = createResponse({ organizationId });

      await controller.createRole(
        createRequest({ body }),
        res as unknown as Response,
        next as NextFunction
      );

      expect(roleManagementService.createRole).toHaveBeenCalledWith(
        organizationId,
        userId,
        body
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Custom role created successfully.",
        role,
      });
    });

    it("should update a custom role", async () => {
      const body = { name: "Senior Project Reviewer" };
      const updatedRole = { ...role, ...body };

      roleManagementService.updateRole.mockResolvedValue(updatedRole);

      const res = createResponse({
        organizationId,
        roleId,
      });

      await controller.updateRole(
        createRequest({ body }),
        res as unknown as Response,
        next as NextFunction
      );

      expect(roleManagementService.updateRole).toHaveBeenCalledWith(
        organizationId,
        userId,
        roleId,
        body
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Custom role updated successfully.",
        role: updatedRole,
      });
    });

    it("should delete a custom role", async () => {
      const res = createResponse({
        organizationId,
        roleId,
      });

      await controller.deleteRole(
        createRequest(),
        res as unknown as Response,
        next as NextFunction
      );

      expect(roleManagementService.deleteRole).toHaveBeenCalledWith(
        organizationId,
        userId,
        roleId
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Custom role deleted successfully.",
      });
    });

    it("should replace custom role permissions", async () => {
      const permissionIds = [permissionId];
      const result = { assignedCount: 1 };

      roleManagementService.replacePermissions.mockResolvedValue(result);

      const res = createResponse({
        organizationId,
        roleId,
      });

      await controller.replaceRolePermissions(
        createRequest({ body: { permissionIds } }),
        res as unknown as Response,
        next as NextFunction
      );

      expect(roleManagementService.replacePermissions).toHaveBeenCalledWith(
        organizationId,
        userId,
        roleId,
        permissionIds
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Custom role permissions updated successfully.",
        result,
      });
    });

    it("should assign an organization custom role to a member", async () => {
      const res = createResponse({
        organizationId,
        userId: memberUserId,
        roleId,
      });

      await controller.assignMemberRole(
        createRequest(),
        res as unknown as Response,
        next as NextFunction
      );

      expect(
        roleManagementService.assignOrganizationCustomRole
      ).toHaveBeenCalledWith(
        organizationId,
        userId,
        memberUserId,
        roleId
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Custom role assigned to organization member successfully.",
      });
    });

    it("should remove an organization custom role from a member", async () => {
      const res = createResponse({
        organizationId,
        userId: memberUserId,
        roleId,
      });

      await controller.removeMemberRole(
        createRequest(),
        res as unknown as Response,
        next as NextFunction
      );

      expect(
        roleManagementService.removeOrganizationCustomRole
      ).toHaveBeenCalledWith(
        organizationId,
        userId,
        memberUserId,
        roleId
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Custom role removed from organization member successfully.",
      });
    });

    it("should forward custom role service errors to next middleware", async () => {
      roleManagementService.createRole.mockRejectedValue(
        new Error("Role creation failed")
      );

      const res = createResponse({ organizationId });

      await controller.createRole(
        createRequest({
          body: {
            scope: "project",
            key: "project_reviewer",
            name: "Project Reviewer",
          },
        }),
        res as unknown as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Role creation failed",
        })
      );
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  it("should forward ownership-transfer errors to next middleware", async () => {
    organizationService.transferOwnership.mockRejectedValue(
      new Error("Ownership transfer failed")
    );

    const res = createResponse({ organizationId });

    await controller.transferOwnership(
      createRequest({ body: { userId: memberUserId } }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Ownership transfer failed",
      })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should reject unauthenticated requests", async () => {
    const res = createResponse();

    await controller.list(
      createRequest({ authenticated: false }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Authentication required.",
        statusCode: 401,
      })
    );
    expect(organizationService.list).not.toHaveBeenCalled();
  });

  it.each([
    ["list", () => organizationService.list.mockRejectedValue(new Error("List failed"))],
    ["getById", () => organizationService.getById.mockRejectedValue(new Error("Get failed"))],
    ["update", () => organizationService.update.mockRejectedValue(new Error("Update failed"))],
    ["listMembers", () => organizationMemberService.listMembers.mockRejectedValue(new Error("List members failed"))],
    ["getMember", () => organizationMemberService.getMember.mockRejectedValue(new Error("Get member failed"))],
  ])("should forward %s service errors to next middleware", async (method, rejectService) => {
    const error = new Error(`${method} failed`);
    rejectService();

    const params = {
      organizationId,
      userId: memberUserId,
    };

    const res = createResponse(params);
    const req = createRequest();

    await controller[method as keyof typeof controller](
      req,
      res as unknown as Response,
      next as NextFunction
    );

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});

import type { Request, Response, NextFunction } from "express";

import type { OrganizationService } from "../organizations/organization.service.js";
import type { OrganizationMemberService } from "../organization-members/organization-member.service.js";
import type { RoleManagementService } from "../role-management/role-management.service.js";

import { AppError } from "../errors/app.error.js";

export const createOrganizationController = (
  organizationService: OrganizationService,
  organizationMemberService: OrganizationMemberService,
  roleManagementService: RoleManagementService
) => {
  const getAuthenticatedUserId = (req: Request): string => {
    if (!req.auth) {
      throw new AppError("Authentication required.", 401);
    }

    return req.auth.user.id;
  };

  const getValidatedRequest = <T>(
    res: Response,
    part: "params" | "query"
  ): T => {
    return res.locals.validatedRequest?.[part] as T;
  };

  const list = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const organizations = await organizationService.list(
        getAuthenticatedUserId(req)
      );

      return res.status(200).json({
        success: true,
        organizations,
      });
    } catch (error) {
      next(error);
    }
  };

  const getById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
      }>(res, "params");

      const organization = await organizationService.getById(
        params.organizationId,
        getAuthenticatedUserId(req)
      );

      return res.status(200).json({
        success: true,
        organization,
      });
    } catch (error) {
      next(error);
    }
  };

  const update = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
      }>(res, "params");

      const organization = await organizationService.update(
        params.organizationId,
        getAuthenticatedUserId(req),
        req.body
      );

      return res.status(200).json({
        success: true,
        message: "Organization updated successfully.",
        organization,
      });
    } catch (error) {
      next(error);
    }
  };

  const listMembers = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
      }>(res, "params");

      const members = await organizationMemberService.listMembers(
        params.organizationId,
        getAuthenticatedUserId(req)
      );

      return res.status(200).json({
        success: true,
        members,
      });
    } catch (error) {
      next(error);
    }
  };

  const getMember = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
        userId: string;
      }>(res, "params");

      const member = await organizationMemberService.getMember(
        params.organizationId,
        params.userId,
        getAuthenticatedUserId(req)
      );

      return res.status(200).json({
        success: true,
        member,
      });
    } catch (error) {
      next(error);
    }
  };

  const updateMemberStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
        userId: string;
      }>(res, "params");

      const body = req.body as {
        status: "active" | "suspended";
      };

      const requesterUserId = getAuthenticatedUserId(req);

      const member =
        body.status === "suspended"
          ? await organizationMemberService.suspendMember(
              params.organizationId,
              params.userId,
              requesterUserId
            )
          : await organizationMemberService.reactivateMember(
              params.organizationId,
              params.userId,
              requesterUserId
            );

      return res.status(200).json({
        success: true,
        message: `Organization member ${body.status === "suspended" ? "suspended" : "reactivated"} successfully.`,
        member,
      });
    } catch (error) {
      next(error);
    }
  };

  const updateMemberRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
        userId: string;
      }>(res, "params");

      const body = req.body as {
        role: "admin" | "member";
      };

      const member = await organizationMemberService.changeMemberRole(
        params.organizationId,
        params.userId,
        body.role,
        getAuthenticatedUserId(req)
      );

      return res.status(200).json({
        success: true,
        message: "Organization member role updated successfully.",
        member,
      });
    } catch (error) {
      next(error);
    }
  };

  const transferOwnership = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
      }>(res, "params");

      const organization = await organizationService.transferOwnership(
        params.organizationId,
        getAuthenticatedUserId(req),
        req.body.userId
      );

      return res.status(200).json({
        success: true,
        message: "Organization ownership transferred successfully.",
        organization,
      });
    } catch (error) {
      next(error);
    }
  };

  const listRoles = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
      }>(res, "params");

      const query = getValidatedRequest<{
        scope?: "organization" | "project";
      }>(res, "query");

      const roles = await roleManagementService.listRoles(
        params.organizationId,
        getAuthenticatedUserId(req),
        query.scope
      );

      return res.status(200).json({
        success: true,
        roles,
      });
    } catch (error) {
      next(error);
    }
  };

  const listPermissions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
      }>(res, "params");

      const query = getValidatedRequest<{
        scope: "organization" | "project";
      }>(res, "query");

      const permissions = await roleManagementService.listPermissions(
        params.organizationId,
        getAuthenticatedUserId(req),
        query.scope
      );

      return res.status(200).json({
        success: true,
        permissions,
      });
    } catch (error) {
      next(error);
    }
  };

  const createRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
      }>(res, "params");

      const role = await roleManagementService.createRole(
        params.organizationId,
        getAuthenticatedUserId(req),
        req.body
      );

      return res.status(201).json({
        success: true,
        message: "Custom role created successfully.",
        role,
      });
    } catch (error) {
      next(error);
    }
  };

  const updateRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
        roleId: string;
      }>(res, "params");

      const role = await roleManagementService.updateRole(
        params.organizationId,
        getAuthenticatedUserId(req),
        params.roleId,
        req.body
      );

      return res.status(200).json({
        success: true,
        message: "Custom role updated successfully.",
        role,
      });
    } catch (error) {
      next(error);
    }
  };

  const deleteRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
        roleId: string;
      }>(res, "params");

      await roleManagementService.deleteRole(
        params.organizationId,
        getAuthenticatedUserId(req),
        params.roleId
      );

      return res.status(200).json({
        success: true,
        message: "Custom role deleted successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  const replaceRolePermissions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
        roleId: string;
      }>(res, "params");

      const result = await roleManagementService.replacePermissions(
        params.organizationId,
        getAuthenticatedUserId(req),
        params.roleId,
        req.body.permissionIds
      );

      return res.status(200).json({
        success: true,
        message: "Custom role permissions updated successfully.",
        result,
      });
    } catch (error) {
      next(error);
    }
  };

  const assignMemberRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
        userId: string;
        roleId: string;
      }>(res, "params");

      await roleManagementService.assignOrganizationCustomRole(
        params.organizationId,
        getAuthenticatedUserId(req),
        params.userId,
        params.roleId
      );

      return res.status(200).json({
        success: true,
        message: "Custom role assigned to organization member successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  const removeMemberRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
        userId: string;
        roleId: string;
      }>(res, "params");

      await roleManagementService.removeOrganizationCustomRole(
        params.organizationId,
        getAuthenticatedUserId(req),
        params.userId,
        params.roleId
      );

      return res.status(200).json({
        success: true,
        message: "Custom role removed from organization member successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  return {
    list,
    getById,
    update,
    listMembers,
    getMember,
    updateMemberStatus,
    updateMemberRole,
    transferOwnership,
    listRoles,
    listPermissions,
    createRole,
    updateRole,
    deleteRole,
    replaceRolePermissions,
    assignMemberRole,
    removeMemberRole,
  };
};

import type { Request, Response, NextFunction } from "express";

import { AppError } from "../errors/app.error.js";
import type { ProjectMemberService } from "../project-members/project-member.service.js";

export const createProjectMemberController = (
  projectMemberService: ProjectMemberService
) => {
  const getAuthenticatedUserId = (req: Request): string => {
    if (!req.auth) {
      throw new AppError("Authentication required.", 401);
    }

    return req.auth.user.id;
  };

  const getValidatedRequest = <T>(
    res: Response,
    part: "params"
  ): T => {
    return res.locals.validatedRequest?.[part] as T;
  };

  const list = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        projectId: string;
      }>(res, "params");

      const members = await projectMemberService.list(
        params.projectId,
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

  const add = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        projectId: string;
      }>(res, "params");

      const member = await projectMemberService.add(
        params.projectId,
        getAuthenticatedUserId(req),
        req.body
      );

      return res.status(201).json({
        success: true,
        message: "Project member added successfully.",
        member,
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
        projectId: string;
        userId: string;
      }>(res, "params");

      const member = await projectMemberService.updateRole(
        params.projectId,
        getAuthenticatedUserId(req),
        params.userId,
        req.body.role
      );

      return res.status(200).json({
        success: true,
        message: "Project member role updated successfully.",
        member,
      });
    } catch (error) {
      next(error);
    }
  };

  const updateStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        projectId: string;
        userId: string;
      }>(res, "params");

      const member = await projectMemberService.updateStatus(
        params.projectId,
        getAuthenticatedUserId(req),
        params.userId,
        req.body.status
      );

      return res.status(200).json({
        success: true,
        message: "Project member status updated successfully.",
        member,
      });
    } catch (error) {
      next(error);
    }
  };

  const remove = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        projectId: string;
        userId: string;
      }>(res, "params");

      await projectMemberService.remove(
        params.projectId,
        getAuthenticatedUserId(req),
        params.userId
      );

      return res.status(200).json({
        success: true,
        message: "Project member removed successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  const assignCustomRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        projectId: string;
        userId: string;
        roleId: string;
      }>(res, "params");

      await projectMemberService.assignCustomRole(
        params.projectId,
        getAuthenticatedUserId(req),
        params.userId,
        params.roleId
      );

      return res.status(200).json({
        success: true,
        message: "Project custom role assigned successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  const removeCustomRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        projectId: string;
        userId: string;
        roleId: string;
      }>(res, "params");

      await projectMemberService.removeCustomRole(
        params.projectId,
        getAuthenticatedUserId(req),
        params.userId,
        params.roleId
      );

      return res.status(200).json({
        success: true,
        message: "Project custom role removed successfully.",
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
        projectId: string;
      }>(res, "params");

      const result = await projectMemberService.transferOwnership(
        params.projectId,
        getAuthenticatedUserId(req),
        req.body
      );

      return res.status(200).json({
        success: true,
        message: "Project ownership transferred successfully.",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  return {
    list,
    add,
    updateRole,
    updateStatus,
    remove,
    assignCustomRole,
    removeCustomRole,
    transferOwnership,
  };
};

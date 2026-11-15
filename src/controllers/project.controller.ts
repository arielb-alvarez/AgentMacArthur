import type { Request, Response, NextFunction } from "express";

import type { ProjectService } from "../projects/project.service.js";
import { AppError } from "../errors/app.error.js";

export const createProjectController = (
  projectService: ProjectService
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

  const create = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const project = await projectService.create(
        getAuthenticatedUserId(req),
        req.body
      );

      return res.status(201).json({
        success: true,
        message: "Project created successfully.",
        project,
      });
    } catch (error) {
      next(error);
    }
  };

  const list = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const query = getValidatedRequest<{
        organizationId?: string;
      }>(res, "query");

      const projects = await projectService.list(
        getAuthenticatedUserId(req),
        query.organizationId
      );

      return res.status(200).json({
        success: true,
        projects,
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
        projectId: string;
      }>(res, "params");

      const project = await projectService.getById(
        params.projectId,
        getAuthenticatedUserId(req)
      );

      return res.status(200).json({
        success: true,
        project,
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
        projectId: string;
      }>(res, "params");

      const project = await projectService.update(
        params.projectId,
        getAuthenticatedUserId(req),
        req.body
      );

      return res.status(200).json({
        success: true,
        message: "Project updated successfully.",
        project,
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
      }>(res, "params");

      const project = await projectService.updateStatus(
        params.projectId,
        getAuthenticatedUserId(req),
        req.body.status
      );

      return res.status(200).json({
        success: true,
        message: "Project status updated successfully.",
        project,
      });
    } catch (error) {
      next(error);
    }
  };

  return {
    create,
    list,
    getById,
    update,
    updateStatus,
  };
};

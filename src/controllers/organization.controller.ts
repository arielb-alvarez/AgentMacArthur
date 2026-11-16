import type { Request, Response, NextFunction } from "express";

import type { OrganizationService } from "../organizations/organization.service.js";
import type { OrganizationMemberService } from "../organization-members/organization-member.service.js";

import { AppError } from "../errors/app.error.js";

export const createOrganizationController = (
  organizationService: OrganizationService,
  organizationMemberService: OrganizationMemberService
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

  return {
    list,
    getById,
    update,
    listMembers,
    getMember,
  };
};

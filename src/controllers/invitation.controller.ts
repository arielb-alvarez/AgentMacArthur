import type { Request, Response, NextFunction } from "express";

import type { InvitationService } from "../invitations/invitation.service.js";

import { AppError } from "../errors/app.error.js";

export const createInvitationController = (
  invitationService: InvitationService
) => {
  const getAuthenticatedUserId = (req: Request): string => {
    if (!req.auth) {
      throw new AppError("Authentication required.", 401);
    }

    return req.auth.user.id;
  };

  const getValidatedRequest = <T>(
    res: Response,
    part: "params",
  ): T => {
    return res.locals.validatedRequest?.[part] as T;
  };

  const create = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
      }>(res, "params");

      const body = req.body as {
        email: string;
        roleKey?: "admin" | "member";
      };

      const invitation =
        await invitationService.createInvitation({
          organizationId: params.organizationId,
          actorUserId: getAuthenticatedUserId(req),
          email: body.email,
          roleKey: body.roleKey,
        });

      return res.status(201).json({
        success: true,
        message: "Invitation created successfully.",
        invitation,
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
      const params = getValidatedRequest<{
        organizationId: string;
      }>(res, "params");

      const invitations =
        await invitationService.listInvitations(
          params.organizationId,
          getAuthenticatedUserId(req)
        );

      return res.status(200).json({
        success: true,
        invitations,
      });
    } catch (error) {
      next(error);
    }
  };

  const resend = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
        invitationId: string;
      }>(res, "params");

      const invitation =
        await invitationService.resendInvitation(
          params.organizationId,
          params.invitationId,
          getAuthenticatedUserId(req)
        );

      return res.status(200).json({
        success: true,
        message: "Invitation resend requested successfully.",
        invitation,
      });
    } catch (error) {
      next(error);
    }
  };

  const revoke = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const params = getValidatedRequest<{
        organizationId: string;
        invitationId: string;
      }>(res, "params");

      const invitation =
        await invitationService.revokeInvitation(
          params.organizationId,
          params.invitationId,
          getAuthenticatedUserId(req)
        );

      return res.status(200).json({
        success: true,
        message: "Invitation revoked successfully.",
        invitation,
      });
    } catch (error) {
      next(error);
    }
  };

  const accept = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const body = req.body as {
        token: string;
      };

      const invitation =
        await invitationService.acceptInvitation(
          getAuthenticatedUserId(req),
          body.token
        );

      return res.status(200).json({
        success: true,
        message: "Invitation accepted successfully.",
        invitation,
      });
    } catch (error) {
      next(error);
    }
  };

  return {
    create,
    list,
    resend,
    revoke,
    accept,
  };
};

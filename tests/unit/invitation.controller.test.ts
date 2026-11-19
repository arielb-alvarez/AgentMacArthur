import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { createInvitationController } from "../../src/controllers/invitation.controller.js";
import type { InvitationService } from "../../src/invitations/invitation.service.js";

const userId = "user-123";
const organizationId = "organization-123";
const invitationId = "invitation-123";

const testInvitation = {
  id: invitationId,
  organizationId,
  email: "invite@example.com",
  status: "pending",
};

describe("Invitation Controller", () => {
  let invitationService: {
    createInvitation: ReturnType<typeof vi.fn>;
    listInvitations: ReturnType<typeof vi.fn>;
    resendInvitation: ReturnType<typeof vi.fn>;
    revokeInvitation: ReturnType<typeof vi.fn>;
    acceptInvitation: ReturnType<typeof vi.fn>;
  };

  let controller: ReturnType<typeof createInvitationController>;

  let res: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    locals: {
      validatedRequest: {
        params?: Record<string, string>;
      };
    };
  };

  let next: ReturnType<typeof vi.fn>;

  const authenticatedRequest = (
    body: Record<string, unknown> = {},
    params: Record<string, string> = {}
  ) =>
    ({
      auth: {
        user: { id: userId },
      },
      body,
    }) as unknown as Request;

  beforeEach(() => {
    invitationService = {
      createInvitation: vi.fn(),
      listInvitations: vi.fn(),
      resendInvitation: vi.fn(),
      revokeInvitation: vi.fn(),
      acceptInvitation: vi.fn(),
    };

    controller = createInvitationController(
      invitationService as unknown as InvitationService
    );

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      locals: {
        validatedRequest: {
          params: { organizationId, invitationId },
        },
      },
    };

    next = vi.fn();
  });

  it("should create an invitation", async () => {
    invitationService.createInvitation.mockResolvedValue(testInvitation);

    await controller.create(
      authenticatedRequest({
        email: "invite@example.com",
        roleKey: "admin",
      }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(invitationService.createInvitation).toHaveBeenCalledWith({
      organizationId,
      actorUserId: userId,
      email: "invite@example.com",
      roleKey: "admin",
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Invitation created successfully.",
      invitation: testInvitation,
    });
  });

  it("should list organization invitations", async () => {
    invitationService.listInvitations.mockResolvedValue([testInvitation]);

    await controller.list(
      authenticatedRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(invitationService.listInvitations).toHaveBeenCalledWith(
      organizationId,
      userId
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      invitations: [testInvitation],
    });
  });

  it("should resend an invitation", async () => {
    invitationService.resendInvitation.mockResolvedValue(testInvitation);

    await controller.resend(
      authenticatedRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(invitationService.resendInvitation).toHaveBeenCalledWith(
      organizationId,
      invitationId,
      userId
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Invitation resend requested successfully.",
      invitation: testInvitation,
    });
  });

  it("should revoke an invitation", async () => {
    invitationService.revokeInvitation.mockResolvedValue(testInvitation);

    await controller.revoke(
      authenticatedRequest(),
      res as unknown as Response,
      next as NextFunction
    );

    expect(invitationService.revokeInvitation).toHaveBeenCalledWith(
      organizationId,
      invitationId,
      userId
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Invitation revoked successfully.",
      invitation: testInvitation,
    });
  });

  it("should accept an invitation", async () => {
    invitationService.acceptInvitation.mockResolvedValue(testInvitation);

    await controller.accept(
      authenticatedRequest({ token: "invitation-token" }),
      res as unknown as Response,
      next as NextFunction
    );

    expect(invitationService.acceptInvitation).toHaveBeenCalledWith(
      userId,
      "invitation-token"
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Invitation accepted successfully.",
      invitation: testInvitation,
    });
  });

  it("should reject an unauthenticated request", async () => {
    await controller.create(
      { body: { email: "invite@example.com" } } as Request,
      res as unknown as Response,
      next as NextFunction
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Authentication required.",
        statusCode: 401,
      })
    );

    expect(invitationService.createInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ["create", "createInvitation"],
    ["list", "listInvitations"],
    ["resend", "resendInvitation"],
    ["revoke", "revokeInvitation"],
    ["accept", "acceptInvitation"],
  ] as const)(
    "should forward %s service errors to next middleware",
    async (action, serviceMethod) => {
      const error = new Error(`${action} failed`);
      invitationService[serviceMethod].mockRejectedValue(error);

      const request =
        action === "create"
          ? authenticatedRequest({ email: "invite@example.com" })
          : action === "accept"
            ? authenticatedRequest({ token: "invitation-token" })
            : authenticatedRequest();

      await controller[action](
        request,
        res as unknown as Response,
        next as NextFunction
      );

      expect(next).toHaveBeenCalledWith(error);
    }
  );
});

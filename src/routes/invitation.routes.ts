import { Router } from "express";

import { invitationController } from "../container/invitation.container.js";
import { authMiddleware } from "../container/auth.container.js";
import { requireTrustedOrigin } from "../middleware/trusted-origin.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationParamsSchema,
  organizationInvitationParamsSchema,
} from "../validators/invitation.validator.js";

const router = Router();

/**
 * @openapi
 * /api/organizations/{organizationId}/invitations:
 *   post:
 *     tags:
 *       - Invitations
 *     summary: Create an organization invitation
 *     description: >
 *       Creates an invitation for a user to join an organization.
 *       The invitation expires after seven days. An invitation email
 *       is sent to the specified email address.
 *       Requires the organization.members.manage permission.
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateInvitationRequest'
 *     responses:
 *       201:
 *         description: Invitation created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InvitationActionResponse'
 *       400:
 *         description: Invalid request data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Insufficient organization permissions.
 *       404:
 *         description: Organization not found or inaccessible.
 *       409:
 *         description: The invited user is already an organization member.
 */
router.post(
  "/organizations/:organizationId/invitations",
  authMiddleware.requireAuth,
  requireTrustedOrigin,
  validate(organizationInvitationParamsSchema, "params"),
  validate(createInvitationSchema),
  invitationController.create
);

/**
 * @openapi
 * /api/organizations/{organizationId}/invitations:
 *   get:
 *     tags:
 *       - Invitations
 *     summary: List organization invitations
 *     description: >
 *       Returns invitations belonging to the specified organization.
 *       Requires the organization.members.manage permission.
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Invitations retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InvitationListResponse'
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Insufficient organization permissions.
 *       404:
 *         description: Organization not found or inaccessible.
 */
router.get(
  "/organizations/:organizationId/invitations",
  authMiddleware.requireAuth,
  validate(organizationInvitationParamsSchema, "params"),
  invitationController.list
);

/**
 * @openapi
 * /api/organizations/{organizationId}/invitations/{invitationId}/resend:
 *   post:
 *     tags:
 *       - Invitations
 *     summary: Resend an organization invitation
 *     description: >
 *       Generates a replacement invitation token, extends the invitation
 *       expiration, resets email delivery tracking, and sends a new
 *       invitation email. Only pending invitations can be resent.
 *       Requires the organization.members.manage permission.
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Invitation resend requested successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InvitationActionResponse'
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Insufficient organization permissions.
 *       404:
 *         description: Organization or invitation not found.
 *       409:
 *         description: Invitation is no longer pending or cannot be resent.
 *       410:
 *         description: Invitation has expired.
 */
router.post(
  "/organizations/:organizationId/invitations/:invitationId/resend",
  authMiddleware.requireAuth,
  requireTrustedOrigin,
  validate(invitationParamsSchema, "params"),
  invitationController.resend
);

/**
 * @openapi
 * /api/organizations/{organizationId}/invitations/{invitationId}:
 *   delete:
 *     tags:
 *       - Invitations
 *     summary: Revoke an organization invitation
 *     description: >
 *       Revokes a pending invitation so that it can no longer be accepted.
 *       Only pending invitations can be revoked.
 *       Requires the organization.members.manage permission.
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Invitation revoked successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InvitationActionResponse'
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Insufficient organization permissions.
 *       404:
 *         description: Organization or invitation not found.
 *       409:
 *         description: Invitation is no longer pending.
 */
router.delete(
  "/organizations/:organizationId/invitations/:invitationId",
  authMiddleware.requireAuth,
  requireTrustedOrigin,
  validate(invitationParamsSchema, "params"),
  invitationController.revoke
);

/**
 * @openapi
 * /api/invitations/accept:
 *   post:
 *     tags:
 *       - Invitations
 *     summary: Accept an organization invitation
 *     description: >
 *       Accepts an invitation using its raw token.
 *       The authenticated account must be active, have a verified email
 *       address, and match the email address the invitation was sent to.
 *       The user is added to the organization and assigned the invited role.
 *     security:
 *       - SessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AcceptInvitationRequest'
 *     responses:
 *       200:
 *         description: Invitation accepted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InvitationActionResponse'
 *       400:
 *         description: Invalid or expired invitation token.
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Account is not eligible or email does not match.
 *       409:
 *         description: Invitation is no longer pending or user is already a member.
 *       410:
 *         description: Invitation has expired.
 */
router.post(
  "/invitations/accept",
  authMiddleware.requireAuth,
  requireTrustedOrigin,
  validate(acceptInvitationSchema),
  invitationController.accept
);

export { router as invitationRouter };

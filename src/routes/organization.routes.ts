import { Router } from "express";

import {
  organizationController,
} from "../container/organization.container.js";

import {
  authMiddleware,
} from "../container/auth.container.js";

import { validate } from "../middleware/validate.middleware.js";

import {
  organizationIdParamsSchema,
  organizationMemberParamsSchema,
  transferOrganizationOwnershipSchema,
  updateOrganizationSchema,
  updateOrganizationMemberStatusSchema,
  updateOrganizationMemberRoleSchema,
  organizationRoleParamsSchema,
  organizationMemberRoleParamsSchema,
  createCustomRoleSchema,
  updateCustomRoleSchema,
  replaceRolePermissionsSchema,
  organizationRoleScopeQuerySchema,
  organizationPermissionScopeQuerySchema,
} from "../validators/organization.validator.js";

export const createOrganizationRouter = (
  controller = organizationController,
  authentication = authMiddleware
) => {
  const router = Router();

  /**
   * @openapi
   * /api/organizations:
   *   get:
   *     tags:
   *       - Organizations
   *     summary: List accessible organizations
   *     description: Returns organizations where the authenticated user has active membership.
   *     security:
   *       - SessionCookie: []
   *     responses:
   *       200:
   *         description: Accessible organizations returned.
   *       401:
   *         description: Authentication required.
   */
  router.get(
    "/",
    authentication.requireAuth,
    controller.list
  );

  /**
   * @openapi
   * /api/organizations/{organizationId}/members:
   *   get:
   *     tags:
   *       - Organizations
   *     summary: List organization members
   *     description: Returns a basic directory containing only member user IDs and display names. Requires the organization.members.view permission and active organization membership.
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
   *         description: Basic organization member directory returned.
   *       400:
   *         description: Invalid organization ID.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Missing organization.members.view permission.
   *       404:
   *         description: Organization not found or inaccessible.
   */
  router.get(
    "/:organizationId/members",
    authentication.requireAuth,
    validate(organizationIdParamsSchema, "params"),
    controller.listMembers
  );

  /**
   * @openapi
   * /api/organizations/{organizationId}/members/{userId}:
   *   get:
   *     tags:
   *       - Organizations
   *     summary: Get organization member details
   *     description: Returns extended member details, including email, display name, account status, membership status, assigned roles, and join date. Requires the organization.members.view_details permission and active organization membership.
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
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Extended organization member details returned.
   *       400:
   *         description: Invalid organization or user ID.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Missing organization.members.view_details permission.
   *       404:
   *         description: Organization or member not found or inaccessible.
   */
  router.get(
    "/:organizationId/members/:userId",
    authentication.requireAuth,
    validate(organizationMemberParamsSchema, "params"),
    controller.getMember
  );


  /**
   * @openapi
   * /api/organizations/{organizationId}/members/{userId}/status:
   *   patch:
   *     tags:
   *       - Organizations
   *     summary: Update organization member status
   *     description: Suspends or reactivates an organization member. Authorization and membership rules are enforced by the organization member service.
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
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             additionalProperties: false
   *             required:
   *               - status
   *             properties:
   *               status:
   *                 type: string
   *                 enum:
   *                   - active
   *                   - suspended
   *     responses:
   *       200:
   *         description: Organization member status updated.
   *       400:
   *         description: Invalid path parameters or request body.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Insufficient membership-management permissions.
   *       404:
   *         description: Organization or member not found or inaccessible.
   *       409:
   *         description: Requested status conflicts with the current member or user account state.
   */
  router.patch(
    "/:organizationId/members/:userId/status",
    authentication.requireAuth,
    validate(organizationMemberParamsSchema, "params"),
    validate(updateOrganizationMemberStatusSchema),
    controller.updateMemberStatus
  );

  /**
   * @openapi
   * /api/organizations/{organizationId}/members/{userId}/role:
   *   patch:
   *     tags:
   *       - Organizations
   *     summary: Change organization member base role
   *     description: Changes a member's base role to admin or member. Only the organization owner can change base roles. Ownership transfers must use the dedicated ownership-transfer endpoint. Custom roles are preserved.
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
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             additionalProperties: false
   *             required:
   *               - role
   *             properties:
   *               role:
   *                 type: string
   *                 enum:
   *                   - admin
   *                   - member
   *     responses:
   *       200:
   *         description: Organization member base role updated.
   *       400:
   *         description: Invalid path parameters or request body.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Only the organization owner can change member base roles.
   *       404:
   *         description: Organization or member not found or inaccessible.
   *       409:
   *         description: Requested role conflicts with the current member role or role assignments.
   */
  router.patch(
    "/:organizationId/members/:userId/role",
    authentication.requireAuth,
    validate(organizationMemberParamsSchema, "params"),
    validate(updateOrganizationMemberRoleSchema),
    controller.updateMemberRole
  );

  /**
   * @openapi
   * /api/organizations/{organizationId}/transfer-ownership:
   *   post:
   *     tags:
   *       - Organizations
   *     summary: Transfer organization ownership
   *     description: Transfers ownership to an active organization member. Only the current organization owner can initiate this operation. The previous owner becomes an admin. Custom organization roles are preserved.
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
   *             type: object
   *             additionalProperties: false
   *             required:
   *               - userId
   *             properties:
   *               userId:
   *                 type: string
   *                 format: uuid
   *                 description: ID of the active organization member who will become the new owner.
   *     responses:
   *       200:
   *         description: Organization ownership transferred successfully.
   *       400:
   *         description: Invalid organization ID or target user ID.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Only the current organization owner can transfer ownership.
   *       404:
   *         description: Organization or target user account not found.
   *       409:
   *         description: Ownership transfer conflicts with membership, account status, role consistency, or ownership constraints.
   */
  router.post(
    "/:organizationId/transfer-ownership",
    authentication.requireAuth,
    validate(organizationIdParamsSchema, "params"),
    validate(transferOrganizationOwnershipSchema),
    controller.transferOwnership
  );

  /**
   * @openapi
   * /api/organizations/{organizationId}:
   *   get:
   *     tags:
   *       - Organizations
   *     summary: Get organization details
   *     description: Returns organization details if the authenticated user has active membership.
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
   *         description: Organization returned.
   *       400:
   *         description: Invalid organization ID.
   *       401:
   *         description: Authentication required.
   *       404:
   *         description: Organization not found or inaccessible.
   */
  router.get(
    "/:organizationId",
    authentication.requireAuth,
    validate(organizationIdParamsSchema, "params"),
    controller.getById
  );


  /**
   * Custom role definitions and permission management.
   * Definitions and permission grants are organization-administered,
   * including definitions whose scope is project.
   */

  router.get(
    "/:organizationId/roles",
    authentication.requireAuth,
    validate(organizationIdParamsSchema, "params"),
    validate(organizationRoleScopeQuerySchema, "query"),
    controller.listRoles
  );

  router.post(
    "/:organizationId/roles",
    authentication.requireAuth,
    validate(organizationIdParamsSchema, "params"),
    validate(createCustomRoleSchema),
    controller.createRole
  );

  router.patch(
    "/:organizationId/roles/:roleId",
    authentication.requireAuth,
    validate(organizationRoleParamsSchema, "params"),
    validate(updateCustomRoleSchema),
    controller.updateRole
  );

  router.delete(
    "/:organizationId/roles/:roleId",
    authentication.requireAuth,
    validate(organizationRoleParamsSchema, "params"),
    controller.deleteRole
  );

  router.get(
    "/:organizationId/permissions",
    authentication.requireAuth,
    validate(organizationIdParamsSchema, "params"),
    validate(organizationPermissionScopeQuerySchema, "query"),
    controller.listPermissions
  );

  router.put(
    "/:organizationId/roles/:roleId/permissions",
    authentication.requireAuth,
    validate(organizationRoleParamsSchema, "params"),
    validate(replaceRolePermissionsSchema),
    controller.replaceRolePermissions
  );

  /**
   * Organization-scoped custom role assignments.
   * Project-scoped custom role assignments are handled by project routes.
   */

  router.post(
    "/:organizationId/members/:userId/roles/:roleId",
    authentication.requireAuth,
    validate(organizationMemberRoleParamsSchema, "params"),
    controller.assignMemberRole
  );

  router.delete(
    "/:organizationId/members/:userId/roles/:roleId",
    authentication.requireAuth,
    validate(organizationMemberRoleParamsSchema, "params"),
    controller.removeMemberRole
  );


  /**
   * @openapi
   * /api/organizations/{organizationId}:
   *   patch:
   *     tags:
   *       - Organizations
   *     summary: Update organization details
   *     description: Updates the organization name. Only organization owners and admins can perform this action.
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
   *             $ref: '#/components/schemas/UpdateOrganizationRequest'
   *     responses:
   *       200:
   *         description: Organization updated.
   *       400:
   *         description: Request validation failed.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Insufficient permissions.
   *       404:
   *         description: Organization not found or inaccessible.
   */
  router.patch(
    "/:organizationId",
    authentication.requireAuth,
    validate(organizationIdParamsSchema, "params"),
    validate(updateOrganizationSchema),
    controller.update
  );

  return router;
};

export default createOrganizationRouter();

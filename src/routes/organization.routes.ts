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
  updateOrganizationSchema,
} from "../validators/organization.validator.js";

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
  authMiddleware.requireAuth,
  organizationController.list
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
  authMiddleware.requireAuth,
  validate(organizationIdParamsSchema, "params"),
  organizationController.getById
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
  authMiddleware.requireAuth,
  validate(organizationIdParamsSchema, "params"),
  validate(updateOrganizationSchema),
  organizationController.update
);

export default router;

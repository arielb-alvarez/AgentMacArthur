import { Router } from "express";

import {
  projectController,
} from "../container/project.container.js";

import {
  authMiddleware,
} from "../container/auth.container.js";

import { validate } from "../middleware/validate.middleware.js";

import {
  createProjectSchema,
  listProjectsQuerySchema,
  projectIdParamsSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
} from "../validators/project.validator.js";

const router = Router();

/**
 * @openapi
 * /api/projects:
 *   post:
 *     tags:
 *       - Projects
 *     summary: Create a project
 *     description: Creates a project in an organization and assigns its creator as project owner.
 *     security:
 *       - SessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProjectRequest'
 *     responses:
 *       201:
 *         description: Project created successfully.
 *       400:
 *         description: Request validation failed.
 *       401:
 *         description: Authentication required.
 *       404:
 *         description: Organization not found or inaccessible.
 */
router.post(
  "/",
  authMiddleware.requireAuth,
  validate(createProjectSchema),
  projectController.create
);

/**
 * @openapi
 * /api/projects:
 *   get:
 *     tags:
 *       - Projects
 *     summary: List accessible projects
 *     description: Returns projects accessible to the authenticated user. Optionally filter by organization.
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Accessible projects returned.
 *       400:
 *         description: Invalid organization ID.
 *       401:
 *         description: Authentication required.
 */
router.get(
  "/",
  authMiddleware.requireAuth,
  validate(listProjectsQuerySchema, "query"),
  projectController.list
);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   get:
 *     tags:
 *       - Projects
 *     summary: Get project details
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Project returned.
 *       401:
 *         description: Authentication required.
 *       404:
 *         description: Project not found or inaccessible.
 */
router.get(
  "/:projectId",
  authMiddleware.requireAuth,
  validate(projectIdParamsSchema, "params"),
  projectController.getById
);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   patch:
 *     tags:
 *       - Projects
 *     summary: Update project details
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProjectRequest'
 *     responses:
 *       200:
 *         description: Project updated.
 *       400:
 *         description: Request validation failed.
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Insufficient permissions.
 *       404:
 *         description: Project not found or inaccessible.
 */
router.patch(
  "/:projectId",
  authMiddleware.requireAuth,
  validate(projectIdParamsSchema, "params"),
  validate(updateProjectSchema),
  projectController.update
);

/**
 * @openapi
 * /api/projects/{projectId}/status:
 *   patch:
 *     tags:
 *       - Projects
 *     summary: Update project status
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProjectStatusRequest'
 *     responses:
 *       200:
 *         description: Project status updated.
 *       400:
 *         description: Request validation failed.
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Insufficient permissions.
 *       404:
 *         description: Project not found or inaccessible.
 */
router.patch(
  "/:projectId/status",
  authMiddleware.requireAuth,
  validate(projectIdParamsSchema, "params"),
  validate(updateProjectStatusSchema),
  projectController.updateStatus
);

export default router;

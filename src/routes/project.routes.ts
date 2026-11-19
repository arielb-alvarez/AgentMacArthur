import { Router } from "express";

import {
  projectController,
  projectMemberController,
} from "../container/project.container.js";

import {
  authMiddleware,
} from "../container/auth.container.js";

import { validate } from "../middleware/validate.middleware.js";

import {
  createProjectSchema,
  listProjectsQuerySchema,
  projectIdParamsSchema,
  projectMemberParamsSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
  addProjectMemberSchema,
  updateProjectMemberRoleSchema,
  updateProjectMemberStatusSchema,
  transferProjectOwnershipSchema,
  projectMemberCustomRoleParamsSchema,
} from "../validators/project.validator.js";

export const createProjectRouter = (
  controller = projectController,
  memberController = projectMemberController,
  authentication = authMiddleware
) => {
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

  /**
   * @openapi
   * /api/projects/{projectId}/members:
   *   get:
   *     tags:
   *       - Project Members
   *     summary: List project members
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
   *         description: Project members returned.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Insufficient permissions.
   *       404:
   *         description: Project not found or inaccessible.
   */
  router.get(
    "/:projectId/members",
    authMiddleware.requireAuth,
    validate(projectIdParamsSchema, "params"),
    projectMemberController.list
  );

  /**
   * @openapi
   * /api/projects/{projectId}/members:
   *   post:
   *     tags:
   *       - Project Members
   *     summary: Add a project member
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
   *             type: object
   *             required:
   *               - userId
   *               - role
   *             properties:
   *               userId:
   *                 type: string
   *                 format: uuid
   *               role:
   *                 type: string
   *                 enum: [client, stakeholder, project_manager, technical_lead, developer, qa_engineer, viewer]
   *     responses:
   *       201:
   *         description: Project member added.
   *       400:
   *         description: Request validation failed or user is not an active organization member.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Insufficient permissions.
   *       409:
   *         description: User is already a project member.
   */
  router.post(
    "/:projectId/members",
    authMiddleware.requireAuth,
    validate(projectIdParamsSchema, "params"),
    validate(addProjectMemberSchema),
    projectMemberController.add
  );

  /**
   * @openapi
   * /api/projects/{projectId}/members/{userId}/role:
   *   patch:
   *     tags:
   *       - Project Members
   *     summary: Change a project member's role
   *     security:
   *       - SessionCookie: []
   *     parameters:
   *       - in: path
   *         name: projectId
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
   *             required: [role]
   *             properties:
   *               role:
   *                 type: string
   *                 enum: [client, stakeholder, project_manager, technical_lead, developer, qa_engineer, viewer]
   *     responses:
   *       200:
   *         description: Project member role updated.
   *       400:
   *         description: Request validation failed.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Insufficient permissions or self-role change.
   *       404:
   *         description: Project member not found.
   *       409:
   *         description: Project owner cannot be changed through this endpoint.
   */
  router.patch(
    "/:projectId/members/:userId/role",
    authMiddleware.requireAuth,
    validate(projectMemberParamsSchema, "params"),
    validate(updateProjectMemberRoleSchema),
    projectMemberController.updateRole
  );

  /**
   * @openapi
   * /api/projects/{projectId}/members/{userId}/status:
   *   patch:
   *     tags:
   *       - Project Members
   *     summary: Update a project member's status
   *     security:
   *       - SessionCookie: []
   *     parameters:
   *       - in: path
   *         name: projectId
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
   *             required: [status]
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [active, suspended]
   *     responses:
   *       200:
   *         description: Project member status updated.
   *       400:
   *         description: Request validation failed.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Insufficient permissions or self-status change.
   *       404:
   *         description: Project member not found.
   *       409:
   *         description: Project owner cannot be changed through this endpoint.
   */
  router.patch(
    "/:projectId/members/:userId/status",
    authMiddleware.requireAuth,
    validate(projectMemberParamsSchema, "params"),
    validate(updateProjectMemberStatusSchema),
    projectMemberController.updateStatus
  );

  /**
   * @openapi
   * /api/projects/{projectId}/members/{userId}:
   *   delete:
   *     tags:
   *       - Project Members
   *     summary: Remove a project member
   *     security:
   *       - SessionCookie: []
   *     parameters:
   *       - in: path
   *         name: projectId
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
   *         description: Project member removed.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Insufficient permissions or self-removal.
   *       404:
   *         description: Project member not found.
   *       409:
   *         description: Project owner cannot be removed.
   */
  router.delete(
    "/:projectId/members/:userId",
    authMiddleware.requireAuth,
    validate(projectMemberParamsSchema, "params"),
    projectMemberController.remove
  );

  /**
   * @openapi
   * /api/projects/{projectId}/members/{userId}/roles/{roleId}:
   *   post:
   *     tags:
   *       - Project Members
   *     summary: Assign a project custom role to a member
   *     security:
   *       - SessionCookie: []
   *     parameters:
   *       - in: path
   *         name: projectId
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
   *       - in: path
   *         name: roleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Project custom role assigned.
   *       400:
   *         description: Invalid role or target membership.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Insufficient permissions.
   *       404:
   *         description: Project, member, or custom role not found.
   */
  router.post(
    "/:projectId/members/:userId/roles/:roleId",
    authentication.requireAuth,
    validate(projectMemberCustomRoleParamsSchema, "params"),
    memberController.assignCustomRole
  );

  /**
   * @openapi
   * /api/projects/{projectId}/members/{userId}/roles/{roleId}:
   *   delete:
   *     tags:
   *       - Project Members
   *     summary: Remove a project custom role from a member
   *     security:
   *       - SessionCookie: []
   *     parameters:
   *       - in: path
   *         name: projectId
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
   *       - in: path
   *         name: roleId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Project custom role removed.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Insufficient permissions.
   *       404:
   *         description: Project, member, or custom role not found.
   */
  router.delete(
    "/:projectId/members/:userId/roles/:roleId",
    authentication.requireAuth,
    validate(projectMemberCustomRoleParamsSchema, "params"),
    memberController.removeCustomRole
  );

  /**
   * @openapi
   * /api/projects/{projectId}/ownership/transfer:
   *   post:
   *     tags:
   *       - Project Members
   *     summary: Transfer project ownership
   *     description: Transfers ownership to an existing active project member. The previous owner becomes a project manager.
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
   *             type: object
   *             required: [newOwnerUserId]
   *             properties:
   *               newOwnerUserId:
   *                 type: string
   *                 format: uuid
   *     responses:
   *       200:
   *         description: Project ownership transferred.
   *       400:
   *         description: Invalid ownership transfer request.
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Only the current project owner can transfer ownership.
   *       404:
   *         description: Project or target member not found.
   */
  router.post(
    "/:projectId/ownership/transfer",
    authMiddleware.requireAuth,
    validate(projectIdParamsSchema, "params"),
    validate(transferProjectOwnershipSchema),
    projectMemberController.transferOwnership
  );

  return router;
};

export default createProjectRouter();

import type { PoolClient } from "pg";

import { AppError } from "../errors/app.error.js";
import type { OrganizationPermissionService } from "../permissions/organization-permission.service.js";

import type {
  Conversation,
  ConversationAction,
} from "./conversation.types.js";

export class ConversationAccessService {
  constructor(
    private readonly permissionService: OrganizationPermissionService
  ) {}

  async assertAccess(
    conversation: Conversation,
    userId: string,
    action: ConversationAction,
    client: PoolClient
  ): Promise<void> {
    if (conversation.status !== "active") {
      throw new AppError(
        "You do not have permission to access this conversation.",
        403
      );
    }

    if (conversation.scope === "legacy") {
      throw new AppError(
        "You do not have permission to access this conversation.",
        403
      );
    }

    if (conversation.scope === "personal") {
      if (conversation.createdBy !== userId) {
        throw new AppError(
          "You do not have permission to access this conversation.",
          403
        );
      }

      return;
    }

    if (!conversation.organizationId) {
      throw new AppError(
        "You do not have permission to access this conversation.",
        403
      );
    }

    if (conversation.scope === "organization") {
      const allowed =
        await this.permissionService.hasOrganizationPermission(
          conversation.organizationId,
          userId,
          `organization.conversations.${action}`,
          client
        );

      if (!allowed) {
        throw new AppError(
          "You do not have permission to access this conversation.",
          403
        );
      }

      return;
    }

    if (
      conversation.scope === "project" &&
      conversation.projectId
    ) {
      // Organization-level permissions are inherited by projects.
      const organizationAllowed =
        await this.permissionService.hasOrganizationPermission(
          conversation.organizationId,
          userId,
          `organization.conversations.${action}`,
          client
        );

      if (organizationAllowed) {
        return;
      }

      const projectAllowed =
        await this.permissionService.hasProjectPermission(
          conversation.organizationId,
          conversation.projectId,
          userId,
          `project.conversations.${action}`,
          client
        );

      if (!projectAllowed) {
        throw new AppError(
          "You do not have permission to access this conversation.",
          403
        );
      }

      return;
    }

    throw new AppError(
      "You do not have permission to access this conversation.",
      403
    );
  }
}

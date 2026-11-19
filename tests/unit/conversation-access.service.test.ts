import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { PoolClient } from "pg";

import { AppError } from "../../src/errors/app.error.js";
import { ConversationAccessService } from "../../src/conversations/conversation-access.service.js";

import type { OrganizationPermissionService } from "../../src/permissions/organization-permission.service.js";
import type { Conversation } from "../../src/conversations/conversation.types.js";

describe("ConversationAccessService", () => {
  let service: ConversationAccessService;
  let permissionService: OrganizationPermissionService;
  let client: PoolClient;

  const userId = "user-123";
  const organizationId = "organization-123";
  const projectId = "project-123";

  const createConversation = (
    overrides: Partial<Conversation> = {}
  ): Conversation => ({
    id: "conversation-123",
    createdBy: userId,
    scope: "personal",
    organizationId: null,
    projectId: null,
    title: null,
    status: "active",
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    client = {} as PoolClient;

    permissionService = {
      hasOrganizationPermission: vi.fn().mockResolvedValue(false),
      hasProjectPermission: vi.fn().mockResolvedValue(false),
    } as unknown as OrganizationPermissionService;

    service = new ConversationAccessService(permissionService);
  });

  const expectForbidden = async (
    conversation: Conversation,
    action: "view" | "participate" | "manage" = "view"
  ) => {
    await expect(
      service.assertAccess(conversation, userId, action, client)
    ).rejects.toMatchObject({
      message: "You do not have permission to access this conversation.",
      statusCode: 403,
    });
  };

  describe("conversation status and scope", () => {
    it("denies access to archived conversations", async () => {
      await expectForbidden(
        createConversation({ status: "archived" })
      );

      expect(
        permissionService.hasOrganizationPermission
      ).not.toHaveBeenCalled();

      expect(
        permissionService.hasProjectPermission
      ).not.toHaveBeenCalled();
    });

    it("denies access to legacy conversations", async () => {
      await expectForbidden(
        createConversation({
          scope: "legacy",
          createdBy: null,
          status: "archived",
        })
      );

      expect(
        permissionService.hasOrganizationPermission
      ).not.toHaveBeenCalled();

      expect(
        permissionService.hasProjectPermission
      ).not.toHaveBeenCalled();
    });

    it("denies an unknown conversation scope", async () => {
      await expectForbidden(
        createConversation({
          scope: "unknown" as Conversation["scope"],
          organizationId,
        })
      );

      expect(
        permissionService.hasOrganizationPermission
      ).not.toHaveBeenCalled();

      expect(
        permissionService.hasProjectPermission
      ).not.toHaveBeenCalled();
    });
  });

  describe("personal conversations", () => {
    it("allows the creator to access their personal conversation", async () => {
      await expect(
        service.assertAccess(
          createConversation(),
          userId,
          "view",
          client
        )
      ).resolves.toBeUndefined();

      expect(
        permissionService.hasOrganizationPermission
      ).not.toHaveBeenCalled();

      expect(
        permissionService.hasProjectPermission
      ).not.toHaveBeenCalled();
    });

    it("denies another user access to a personal conversation", async () => {
      await expect(
        service.assertAccess(
          createConversation(),
          "another-user",
          "view",
          client
        )
      ).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(
        permissionService.hasOrganizationPermission
      ).not.toHaveBeenCalled();

      expect(
        permissionService.hasProjectPermission
      ).not.toHaveBeenCalled();
    });
  });

  describe("organization conversations", () => {
    it("denies access when the organization ID is missing", async () => {
      await expectForbidden(
        createConversation({
          scope: "organization",
          organizationId: null,
        })
      );

      expect(
        permissionService.hasOrganizationPermission
      ).not.toHaveBeenCalled();
    });

    it.each(["view", "participate", "manage"] as const)(
      "allows organization access with the %s permission",
      async (action) => {
        vi.mocked(
          permissionService.hasOrganizationPermission
        ).mockResolvedValue(true);

        await expect(
          service.assertAccess(
            createConversation({
              scope: "organization",
              organizationId,
            }),
            userId,
            action,
            client
          )
        ).resolves.toBeUndefined();

        expect(
          permissionService.hasOrganizationPermission
        ).toHaveBeenCalledWith(
          organizationId,
          userId,
          `organization.conversations.${action}`,
          client
        );

        expect(
          permissionService.hasProjectPermission
        ).not.toHaveBeenCalled();
      }
    );

    it.each(["view", "participate", "manage"] as const)(
      "denies organization access without the %s permission",
      async (action) => {
        await expectForbidden(
          createConversation({
            scope: "organization",
            organizationId,
          }),
          action
        );

        expect(
          permissionService.hasOrganizationPermission
        ).toHaveBeenCalledWith(
          organizationId,
          userId,
          `organization.conversations.${action}`,
          client
        );

        expect(
          permissionService.hasProjectPermission
        ).not.toHaveBeenCalled();
      }
    );
  });

  describe("project conversations", () => {
    const projectConversation = () =>
      createConversation({
        scope: "project",
        organizationId,
        projectId,
      });

    it("denies access when the organization ID is missing", async () => {
      await expectForbidden(
        createConversation({
          scope: "project",
          organizationId: null,
          projectId,
        })
      );

      expect(
        permissionService.hasOrganizationPermission
      ).not.toHaveBeenCalled();

      expect(
        permissionService.hasProjectPermission
      ).not.toHaveBeenCalled();
    });

    it("denies access when the project ID is missing", async () => {
      await expectForbidden(
        createConversation({
          scope: "project",
          organizationId,
          projectId: null,
        })
      );

      expect(
        permissionService.hasOrganizationPermission
      ).not.toHaveBeenCalled();

      expect(
        permissionService.hasProjectPermission
      ).not.toHaveBeenCalled();
    });

    it.each(["view", "participate", "manage"] as const)(
      "allows project access through inherited organization %s permission",
      async (action) => {
        vi.mocked(
          permissionService.hasOrganizationPermission
        ).mockResolvedValue(true);

        await expect(
          service.assertAccess(
            projectConversation(),
            userId,
            action,
            client
          )
        ).resolves.toBeUndefined();

        expect(
          permissionService.hasOrganizationPermission
        ).toHaveBeenCalledWith(
          organizationId,
          userId,
          `organization.conversations.${action}`,
          client
        );

        expect(
          permissionService.hasProjectPermission
        ).not.toHaveBeenCalled();
      }
    );

    it.each(["view", "participate", "manage"] as const)(
      "allows project access through the project %s permission",
      async (action) => {
        vi.mocked(
          permissionService.hasOrganizationPermission
        ).mockResolvedValue(false);

        vi.mocked(
          permissionService.hasProjectPermission
        ).mockResolvedValue(true);

        await expect(
          service.assertAccess(
            projectConversation(),
            userId,
            action,
            client
          )
        ).resolves.toBeUndefined();

        expect(
          permissionService.hasOrganizationPermission
        ).toHaveBeenCalledWith(
          organizationId,
          userId,
          `organization.conversations.${action}`,
          client
        );

        expect(
          permissionService.hasProjectPermission
        ).toHaveBeenCalledWith(
          organizationId,
          projectId,
          userId,
          `project.conversations.${action}`,
          client
        );
      }
    );

    it.each(["view", "participate", "manage"] as const)(
      "denies project access when neither organization nor project grants %s",
      async (action) => {
        await expectForbidden(
          projectConversation(),
          action
        );

        expect(
          permissionService.hasOrganizationPermission
        ).toHaveBeenCalledWith(
          organizationId,
          userId,
          `organization.conversations.${action}`,
          client
        );

        expect(
          permissionService.hasProjectPermission
        ).toHaveBeenCalledWith(
          organizationId,
          projectId,
          userId,
          `project.conversations.${action}`,
          client
        );
      }
    );
  });

  describe("permission service failures", () => {
    it("propagates organization permission lookup errors", async () => {
      vi.mocked(
        permissionService.hasOrganizationPermission
      ).mockRejectedValue(new Error("Database unavailable"));

      await expect(
        service.assertAccess(
          createConversation({
            scope: "organization",
            organizationId,
          }),
          userId,
          "view",
          client
        )
      ).rejects.toThrow("Database unavailable");
    });

    it("propagates project permission lookup errors", async () => {
      vi.mocked(
        permissionService.hasOrganizationPermission
      ).mockResolvedValue(false);

      vi.mocked(
        permissionService.hasProjectPermission
      ).mockRejectedValue(new Error("Database unavailable"));

      await expect(
        service.assertAccess(
          createConversation({
            scope: "project",
            organizationId,
            projectId,
          }),
          userId,
          "view",
          client
        )
      ).rejects.toThrow("Database unavailable");
    });
  });
});

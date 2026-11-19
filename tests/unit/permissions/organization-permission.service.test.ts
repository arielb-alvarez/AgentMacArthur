import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PoolClient } from "pg";

import { OrganizationPermissionRepository } from "../../../src/permissions/organization-permission.repository.js";
import { OrganizationPermissionService } from "../../../src/permissions/organization-permission.service.js";

describe("OrganizationPermissionService", () => {
  let service: OrganizationPermissionService;

  const permissionRepository: OrganizationPermissionRepository = {
    hasOrganizationPermission: vi.fn(),
    hasProjectPermission: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new OrganizationPermissionService(
      permissionRepository
    );
  });

  describe("organization permissions", () => {
    describe("hasPermission", () => {
      it("should return true when the user has the permission", async () => {
        vi.mocked(
          permissionRepository.hasOrganizationPermission
        ).mockResolvedValue(true);

        const result = await service.hasPermission(
          "org-1",
          "user-1",
          "organization.update"
        );

        expect(result).toBe(true);
        expect(
          permissionRepository.hasOrganizationPermission
        ).toHaveBeenCalledWith(
          "org-1",
          "user-1",
          "organization.update",
          undefined
        );
      });

      it("should return false when the user lacks the permission", async () => {
        vi.mocked(
          permissionRepository.hasOrganizationPermission
        ).mockResolvedValue(false);

        const result = await service.hasPermission(
          "org-1",
          "user-1",
          "organization.update"
        );

        expect(result).toBe(false);
      });

      it("should forward the transaction client", async () => {
        const client = {} as PoolClient;

        vi.mocked(
          permissionRepository.hasOrganizationPermission
        ).mockResolvedValue(true);

        await service.hasPermission(
          "org-1",
          "user-1",
          "organization.update",
          client
        );

        expect(
          permissionRepository.hasOrganizationPermission
        ).toHaveBeenCalledWith(
          "org-1",
          "user-1",
          "organization.update",
          client
        );
      });
    });

    describe("assertPermission", () => {
      it("should resolve when the user has the permission", async () => {
        vi.mocked(
          permissionRepository.hasOrganizationPermission
        ).mockResolvedValue(true);

        await expect(
          service.assertPermission(
            "org-1",
            "user-1",
            "organization.update"
          )
        ).resolves.toBeUndefined();
      });

      it("should throw a 403 AppError when permission is denied", async () => {
        vi.mocked(
          permissionRepository.hasOrganizationPermission
        ).mockResolvedValue(false);

        await expect(
          service.assertPermission(
            "org-1",
            "user-1",
            "organization.update"
          )
        ).rejects.toMatchObject({
          statusCode: 403,
          message: "You do not have permission to perform this action.",
        });
      });

      it("should propagate repository errors", async () => {
        vi.mocked(
          permissionRepository.hasOrganizationPermission
        ).mockRejectedValue(new Error("Database failure"));

        await expect(
          service.assertPermission(
            "org-1",
            "user-1",
            "organization.update"
          )
        ).rejects.toThrow("Database failure");
      });
    });
  });

  describe("project permissions", () => {
    describe("hasProjectPermission", () => {
      it("should return true when the user has the project permission", async () => {
        vi.mocked(
          permissionRepository.hasProjectPermission
        ).mockResolvedValue(true);

        const result = await service.hasProjectPermission(
          "org-1",
          "project-1",
          "user-1",
          "project.conversations.view"
        );

        expect(result).toBe(true);
        expect(
          permissionRepository.hasProjectPermission
        ).toHaveBeenCalledWith(
          "org-1",
          "project-1",
          "user-1",
          "project.conversations.view",
          undefined
        );
      });

      it("should return false when the user lacks the project permission", async () => {
        vi.mocked(
          permissionRepository.hasProjectPermission
        ).mockResolvedValue(false);

        const result = await service.hasProjectPermission(
          "org-1",
          "project-1",
          "user-1",
          "project.conversations.view"
        );

        expect(result).toBe(false);
      });

      it("should forward the transaction client", async () => {
        const client = {} as PoolClient;

        vi.mocked(
          permissionRepository.hasProjectPermission
        ).mockResolvedValue(true);

        await service.hasProjectPermission(
          "org-1",
          "project-1",
          "user-1",
          "project.conversations.participate",
          client
        );

        expect(
          permissionRepository.hasProjectPermission
        ).toHaveBeenCalledWith(
          "org-1",
          "project-1",
          "user-1",
          "project.conversations.participate",
          client
        );
      });
    });

    describe("assertProjectPermission", () => {
      it("should resolve when the user has the project permission", async () => {
        vi.mocked(
          permissionRepository.hasProjectPermission
        ).mockResolvedValue(true);

        await expect(
          service.assertProjectPermission(
            "org-1",
            "project-1",
            "user-1",
            "project.conversations.view"
          )
        ).resolves.toBeUndefined();
      });

      it("should throw a 403 AppError when project permission is denied", async () => {
        vi.mocked(
          permissionRepository.hasProjectPermission
        ).mockResolvedValue(false);

        await expect(
          service.assertProjectPermission(
            "org-1",
            "project-1",
            "user-1",
            "project.conversations.manage"
          )
        ).rejects.toMatchObject({
          statusCode: 403,
          message: "You do not have permission to perform this action.",
        });
      });

      it("should propagate repository errors", async () => {
        vi.mocked(
          permissionRepository.hasProjectPermission
        ).mockRejectedValue(new Error("Database failure"));

        await expect(
          service.assertProjectPermission(
            "org-1",
            "project-1",
            "user-1",
            "project.conversations.view"
          )
        ).rejects.toThrow("Database failure");
      });
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../src/errors/app.error.js";
import type { OrganizationPermissionRepository } from "../../../src/permissions/organization-permission.repository.js";
import { OrganizationPermissionService } from "../../../src/permissions/organization-permission.service.js";

describe("OrganizationPermissionService", () => {
  let service: OrganizationPermissionService;

  const permissionRepository: OrganizationPermissionRepository = {
    hasOrganizationPermission: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new OrganizationPermissionService(
      permissionRepository
    );
  });

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
      const client = {} as never;

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

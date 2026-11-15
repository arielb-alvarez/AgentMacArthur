import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import { PostgresRoleAssignmentRepository } from "../../../src/role-assignments/postgres-role-assignment.repository.js";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

function createClient(): PoolClient {
  return {
    query: mocks.query,
  } as unknown as PoolClient;
}

function createQueryResult<T extends QueryResultRow>(
  rows: T[]
): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: [],
  };
}

describe("PostgresRoleAssignmentRepository", () => {
  let repository: PostgresRoleAssignmentRepository;
  let client: PoolClient;

  beforeEach(() => {
    vi.clearAllMocks();

    client = createClient();
    repository = new PostgresRoleAssignmentRepository();
  });

  describe("assignOrganizationRole", () => {
    it("should assign an organization role using its scope and key", async () => {
      mocks.query
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([{ id: "role-1" }]));

      await repository.assignOrganizationRole(
        {
          organizationId: "org-1",
          userId: "user-1",
          roleKey: "owner",
          assignedBy: "user-1",
        },
        client
      );

      expect(mocks.query).toHaveBeenCalledTimes(2);

      const [insertQuery, insertValues] = mocks.query.mock.calls[0];

      expect(insertQuery).toContain("INSERT INTO organization_member_roles");
      expect(insertQuery).toContain("roles.scope = 'organization'");
      expect(insertQuery).toContain("roles.key = $3");
      expect(insertQuery).toContain("ON CONFLICT");

      expect(insertValues).toEqual([
        "org-1",
        "user-1",
        "owner",
        "user-1",
      ]);
    });

    it("should allow a null assigner", async () => {
      mocks.query
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([{ id: "role-1" }]));

      await repository.assignOrganizationRole(
        {
          organizationId: "org-1",
          userId: "user-1",
          roleKey: "member",
        },
        client
      );

      const [, insertValues] = mocks.query.mock.calls[0];

      expect(insertValues[3]).toBeNull();
    });

    it("should throw when the built-in organization role does not exist", async () => {
      mocks.query
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([]));

      await expect(
        repository.assignOrganizationRole(
          {
            organizationId: "org-1",
            userId: "user-1",
            roleKey: "unknown_role",
          },
          client
        )
      ).rejects.toThrow(
        'Built-in organization role "unknown_role" does not exist.'
      );
    });
  });

  describe("assignProjectRole", () => {
    it("should assign a project role using its scope and key", async () => {
      mocks.query
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([{ id: "role-2" }]));

      await repository.assignProjectRole(
        {
          projectId: "project-1",
          organizationId: "org-1",
          userId: "user-1",
          roleKey: "project_owner",
          assignedBy: "user-1",
        },
        client
      );

      expect(mocks.query).toHaveBeenCalledTimes(2);

      const [insertQuery, insertValues] = mocks.query.mock.calls[0];

      expect(insertQuery).toContain("INSERT INTO project_member_roles");
      expect(insertQuery).toContain("roles.scope = 'project'");
      expect(insertQuery).toContain("roles.key = $4");
      expect(insertQuery).toContain("ON CONFLICT");

      expect(insertValues).toEqual([
        "project-1",
        "org-1",
        "user-1",
        "project_owner",
        "user-1",
      ]);
    });

    it("should throw when the built-in project role does not exist", async () => {
      mocks.query
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([]));

      await expect(
        repository.assignProjectRole(
          {
            projectId: "project-1",
            organizationId: "org-1",
            userId: "user-1",
            roleKey: "unknown_role",
          },
          client
        )
      ).rejects.toThrow(
        'Built-in project role "unknown_role" does not exist.'
      );
    });
  });
});

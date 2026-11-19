import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import type { TransactionManager } from "../../../src/database/transaction-manager.js";
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
        .mockResolvedValueOnce(createQueryResult([{ id: "role-1" }]))
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

      expect(mocks.query).toHaveBeenCalledTimes(3);

      const [insertQuery, insertValues] = mocks.query.mock.calls[1];

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
        .mockResolvedValueOnce(createQueryResult([{ id: "role-1" }]))
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

      const [, insertValues] = mocks.query.mock.calls[1];

      expect(insertValues[3]).toBeNull();
    });

    it("should throw when the built-in organization role does not exist", async () => {
      mocks.query.mockResolvedValueOnce(createQueryResult([]));

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
        .mockResolvedValueOnce(createQueryResult([{ id: "role-2" }]))
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

      expect(mocks.query).toHaveBeenCalledTimes(3);

      const [insertQuery, insertValues] = mocks.query.mock.calls[1];

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
      mocks.query.mockResolvedValueOnce(createQueryResult([]));

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

  describe("replaceProjectPrimaryRole", () => {
    it("should replace only the previous built-in primary role", async () => {
      mocks.query
        .mockResolvedValueOnce(createQueryResult([{ id: "role-2" }]))
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([]));

      await repository.replaceProjectPrimaryRole(
        {
          projectId: "project-1",
          organizationId: "org-1",
          userId: "user-1",
          roleKey: "project_manager",
          assignedBy: "owner-1",
        },
        "developer",
        client
      );

      expect(mocks.query).toHaveBeenCalledTimes(3);

      const [verifyQuery, verifyValues] = mocks.query.mock.calls[0];
      const [deleteQuery, deleteValues] = mocks.query.mock.calls[1];
      const [insertQuery, insertValues] = mocks.query.mock.calls[2];

      expect(verifyQuery).toContain("FROM roles");
      expect(verifyQuery).toContain("scope = 'project'");
      expect(verifyQuery).toContain("is_system = TRUE");
      expect(verifyQuery).toContain("organization_id IS NULL");
      expect(verifyValues).toEqual(["project_manager"]);

      expect(deleteQuery).toContain("DELETE FROM project_member_roles pmr");
      expect(deleteQuery).toContain("roles.is_system = TRUE");
      expect(deleteQuery).toContain("roles.organization_id IS NULL");
      expect(deleteQuery).toContain("roles.key = $4");
      expect(deleteValues).toEqual([
        "project-1",
        "org-1",
        "user-1",
        "developer",
      ]);

      expect(insertQuery).toContain("INSERT INTO project_member_roles");
      expect(insertQuery).toContain("ON CONFLICT");
      expect(insertValues).toEqual([
        "project-1",
        "org-1",
        "user-1",
        "project_manager",
        "owner-1",
      ]);
    });

    it("should reject an invalid new primary role without modifying assignments", async () => {
      await expect(
        repository.replaceProjectPrimaryRole(
          {
            projectId: "project-1",
            organizationId: "org-1",
            userId: "user-1",
            roleKey: "custom_role",
          },
          "developer",
          client
        )
      ).rejects.toThrow(
        'Invalid project primary role "custom_role".'
      );

      expect(mocks.query).not.toHaveBeenCalled();
    });

    it("should reject an invalid previous primary role without modifying assignments", async () => {
      await expect(
        repository.replaceProjectPrimaryRole(
          {
            projectId: "project-1",
            organizationId: "org-1",
            userId: "user-1",
            roleKey: "project_manager",
          },
          "custom_role",
          client
        )
      ).rejects.toThrow(
        'Invalid previous project primary role "custom_role".'
      );

      expect(mocks.query).not.toHaveBeenCalled();
    });

    it("should not delete the previous role when the new built-in role is missing", async () => {
      mocks.query.mockResolvedValueOnce(createQueryResult([]));

      await expect(
        repository.replaceProjectPrimaryRole(
          {
            projectId: "project-1",
            organizationId: "org-1",
            userId: "user-1",
            roleKey: "project_manager",
          },
          "developer",
          client
        )
      ).rejects.toThrow(
        'Built-in project role "project_manager" does not exist.'
      );

      expect(mocks.query).toHaveBeenCalledTimes(1);
    });
  });

  describe("findOrganizationBaseRoles", () => {
    it("should return only built-in organization base roles", async () => {
      mocks.query.mockResolvedValueOnce(
        createQueryResult([
          { key: "admin" },
          { key: "member" },
        ])
      );

      const result = await repository.findOrganizationBaseRoles(
        "org-1",
        "user-1",
        client
      );

      expect(result).toEqual(["admin", "member"]);

      const [query, values] = mocks.query.mock.calls[0];

      expect(query).toContain("FROM organization_member_roles");
      expect(query).toContain("roles.scope = 'organization'");
      expect(query).toContain("roles.is_system = TRUE");
      expect(query).toContain("roles.organization_id IS NULL");
      expect(query).toContain("roles.key = ANY($3::text[])");

      expect(values).toEqual([
        "org-1",
        "user-1",
        ["owner", "admin", "member"],
      ]);
    });

    it("should return an empty array when no base role is assigned", async () => {
      mocks.query.mockResolvedValueOnce(createQueryResult([]));

      const result = await repository.findOrganizationBaseRoles(
        "org-1",
        "user-1",
        client
      );

      expect(result).toEqual([]);
    });
  });

  describe("replaceOrganizationBaseRole", () => {
    it("should remove existing base roles and insert the requested role", async () => {
      mocks.query
        .mockResolvedValueOnce(createQueryResult([{ id: "role-1" }]))
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([]));

      await repository.replaceOrganizationBaseRole(
        {
          organizationId: "org-1",
          userId: "user-1",
          roleKey: "admin",
          assignedBy: "owner-1",
        },
        client
      );

      expect(mocks.query).toHaveBeenCalledTimes(3);

      const [verifyQuery] = mocks.query.mock.calls[0];
      const [deleteQuery, deleteValues] = mocks.query.mock.calls[1];
      const [insertQuery, insertValues] = mocks.query.mock.calls[2];

      expect(verifyQuery).toMatch(/SELECT\s+id\s+FROM\s+roles/);

      expect(deleteQuery).toContain("DELETE FROM organization_member_roles");
      expect(deleteQuery).toContain("roles.is_system = TRUE");
      expect(deleteQuery).toContain("roles.organization_id IS NULL");
      expect(deleteQuery).toContain("roles.key = ANY($3::text[])");

      expect(deleteValues).toEqual([
        "org-1",
        "user-1",
        ["owner", "admin", "member"],
      ]);

      expect(insertQuery).toContain("INSERT INTO organization_member_roles");
      expect(insertQuery).toContain("roles.key = $3");

      expect(insertValues).toEqual([
        "org-1",
        "user-1",
        "admin",
        "owner-1",
      ]);
    });

    it("should reject an invalid base role without modifying assignments", async () => {
      await expect(
        repository.replaceOrganizationBaseRole(
          {
            organizationId: "org-1",
            userId: "user-1",
            roleKey: "custom_role",
          },
          client
        )
      ).rejects.toThrow(
        'Invalid organization base role "custom_role".'
      );

      expect(mocks.query).not.toHaveBeenCalled();
    });

    it("should not delete assignments when the requested built-in role is missing", async () => {
      mocks.query.mockResolvedValueOnce(createQueryResult([]));

      await expect(
        repository.replaceOrganizationBaseRole(
          {
            organizationId: "org-1",
            userId: "user-1",
            roleKey: "admin",
          },
          client
        )
      ).rejects.toThrow(
        'Built-in organization role "admin" does not exist.'
      );

      expect(mocks.query).toHaveBeenCalledTimes(1);
    });
  });

  describe("transaction handling", () => {
    it("should execute organization custom-role assignment in one transaction", async () => {
      const runInTransaction = vi.fn(
        async (
          _operationName: string,
          operation: (transactionClient: PoolClient) => Promise<void>
        ) => operation(client)
      );

      const transactionManager = {
        runInTransaction,
      } as unknown as TransactionManager;

      const transactionRepository =
        new PostgresRoleAssignmentRepository(
          undefined,
          transactionManager
        );

      mocks.query
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([{ role_id: "role-1" }]));

      await transactionRepository.assignOrganizationCustomRole({
        organizationId: "org-1",
        userId: "user-1",
        roleId: "role-1",
        assignedBy: "admin-1",
      });

      expect(runInTransaction).toHaveBeenCalledTimes(1);
      expect(runInTransaction).toHaveBeenCalledWith(
        "assignOrganizationCustomRole",
        expect.any(Function)
      );

      expect(mocks.query).toHaveBeenCalledTimes(2);
    });

    it("should execute project custom-role assignment in one transaction", async () => {
      const runInTransaction = vi.fn(
        async (
          _operationName: string,
          operation: (transactionClient: PoolClient) => Promise<void>
        ) => operation(client)
      );

      const transactionManager = {
        runInTransaction,
      } as unknown as TransactionManager;

      const transactionRepository =
        new PostgresRoleAssignmentRepository(
          undefined,
          transactionManager
        );

      mocks.query
        .mockResolvedValueOnce(createQueryResult([]))
        .mockResolvedValueOnce(createQueryResult([{ role_id: "role-2" }]));

      await transactionRepository.assignProjectCustomRole({
        projectId: "project-1",
        organizationId: "org-1",
        userId: "user-1",
        roleId: "role-2",
        assignedBy: "admin-1",
      });

      expect(runInTransaction).toHaveBeenCalledTimes(1);
      expect(runInTransaction).toHaveBeenCalledWith(
        "assignProjectCustomRole",
        expect.any(Function)
      );

      expect(mocks.query).toHaveBeenCalledTimes(2);
    });

    it("should propagate assignment failures from the transaction callback", async () => {
      const failure = new Error("Assignment query failed");

      const runInTransaction = vi.fn(
        async (
          _operationName: string,
          operation: (transactionClient: PoolClient) => Promise<void>
        ) => operation(client)
      );

      const transactionManager = {
        runInTransaction,
      } as unknown as TransactionManager;

      const transactionRepository =
        new PostgresRoleAssignmentRepository(
          undefined,
          transactionManager
        );

      mocks.query
        .mockResolvedValueOnce(createQueryResult([]))
        .mockRejectedValueOnce(failure);

      await expect(
        transactionRepository.assignOrganizationCustomRole({
          organizationId: "org-1",
          userId: "user-1",
          roleId: "role-1",
          assignedBy: "admin-1",
        })
      ).rejects.toThrow("Assignment query failed");

      expect(runInTransaction).toHaveBeenCalledTimes(1);
      expect(mocks.query).toHaveBeenCalledTimes(2);
    });
  });
});

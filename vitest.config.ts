import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/database/migrations/**",
        "src/**/*.d.ts",
        "src/**/*.test.ts",

        // Executable bootstrap and CLI wrappers.
        "src/server.ts",
        "src/database/migrate.ts",
        "src/database/migrate-status.ts",

        // Test-only infrastructure.
        "src/config/test-database.ts",
        "src/config/migration-test-database.ts",

        // Type-only contracts and definitions.
        "src/auth-tokens/auth-token.repository.ts",
        "src/auth-tokens/auth-token.types.ts",
        "src/email/email.service.ts",
        "src/invitations/invitation.repository.ts",
        "src/invitations/invitation.types.ts",
        "src/organization-members/organization-member.repository.ts",
        "src/organization-members/organization-member.types.ts",
        "src/organizations/organization.repository.ts",
        "src/organizations/organization.types.ts",
        "src/permissions/organization-permission.repository.ts",
        "src/project-members/project-member.repository.ts",
        "src/project-members/project-member.types.ts",
        "src/projects/project.repository.ts",
        "src/projects/project.types.ts",
        "src/role-assignments/role-assignment.repository.ts",
        "src/sessions/session.repository.ts",
        "src/sessions/session.types.ts",
        "src/users/user.repository.ts",
        "src/users/user.types.ts",
      ],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 90,
        lines: 95,
      },
    },
  },
});

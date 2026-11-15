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

        // Type-only modules.
        "src/agent/agent-provider.ts",
        "src/conversations/conversation.repository.ts",
        "src/conversations/conversation.types.ts",
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

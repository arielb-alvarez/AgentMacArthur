
import { pool } from "../config/database.js";
import { logger } from "../utils/logger.js";
import { getMigrationStatus } from "./migration.runner.js";

const showMigrationStatus = async (): Promise<void> => {
  try {
    const migrations = await getMigrationStatus();

    console.log("\n========================================");
    console.log("       AGENT MACARTHUR MIGRATIONS");
    console.log("========================================\n");

    if (migrations.length === 0) {
      console.log("No migrations found.");
      return;
    }

    const nameWidth = Math.max(
      32,
      ...migrations.map((migration) => migration.name.length)
    );

    console.log(
      `${"Migration".padEnd(nameWidth)} ${"Status"}`
    );
    console.log("-".repeat(nameWidth + 20));

    for (const migration of migrations) {
      console.log(
        `${migration.name.padEnd(nameWidth)} ${migration.status}`
      );
    }

    const executed = migrations.filter(
      (migration) => migration.status === "EXECUTED"
    ).length;

    const pending = migrations.filter(
      (migration) => migration.status === "PENDING"
    ).length;

    const checksumMismatches = migrations.filter(
      (migration) => migration.status === "CHECKSUM MISMATCH"
    ).length;

    const missingFiles = migrations.filter(
      (migration) => migration.status === "MISSING FILE"
    ).length;

    const hasInvalidMigrations =
      checksumMismatches > 0 || missingFiles > 0;

    let overallStatus = "UP TO DATE";

    if (hasInvalidMigrations) {
      overallStatus = "NEEDS ATTENTION";
    } else if (pending > 0) {
      overallStatus = "READY TO MIGRATE";
    }

    console.log("\n----------------------------------------");
    console.log("SUMMARY");
    console.log("----------------------------------------");
    console.log(`Total migrations:       ${migrations.length}`);
    console.log(`Executed:               ${executed}`);
    console.log(`Pending:                ${pending}`);
    console.log(`Checksum mismatches:    ${checksumMismatches}`);
    console.log(`Missing files:          ${missingFiles}`);
    console.log("----------------------------------------");
    console.log(`Status: ${overallStatus}`);
    console.log("========================================\n");
  } catch (error) {
    logger.error("Failed to retrieve migration status", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

void showMigrationStatus();

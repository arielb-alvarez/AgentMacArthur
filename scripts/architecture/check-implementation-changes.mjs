import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.."
);

const registryPath = resolve(
  projectRoot,
  "docs/architecture/implementation-registry.json"
);

const migrationDirectory = "src/database/migrations/";

function runGit(args) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function resolveProjectPath(filePath) {
  const normalized = normalizePath(filePath);
  const absolutePath = resolve(projectRoot, normalized);

  if (
    absolutePath !== projectRoot &&
    !absolutePath.startsWith(`${projectRoot}/`) &&
    !absolutePath.startsWith(`${projectRoot}\\`)
  ) {
    throw new Error(`Path escapes project root: ${filePath}`);
  }

  return absolutePath;
}

function parseGitChanges(output) {
  const tokens = output.split("\0");
  const changes = [];

  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];

    if (!status) {
      continue;
    }

    if (status.startsWith("R") || status.startsWith("C")) {
      changes.push({
        status,
        oldPath: normalizePath(tokens[index++]),
        newPath: normalizePath(tokens[index++]),
      });
    } else {
      changes.push({
        status,
        path: normalizePath(tokens[index++]),
      });
    }
  }

  return changes;
}

function getGitChanges() {
  const trackedOutput = runGit([
    "diff",
    "--name-status",
    "--find-renames",
    "-z",
    "HEAD",
  ]);

  const untrackedOutput = runGit([
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);

  const changes = parseGitChanges(trackedOutput);
  const knownPaths = new Set();

  for (const change of changes) {
    if (change.oldPath) knownPaths.add(change.oldPath);
    if (change.newPath) knownPaths.add(change.newPath);
    if (change.path) knownPaths.add(change.path);
  }

  for (const filePath of untrackedOutput.split("\0")) {
    if (!filePath) continue;

    const normalized = normalizePath(filePath);

    if (!knownPaths.has(normalized)) {
      changes.push({
        status: "??",
        path: normalized,
      });
    }
  }

  return changes;
}

function validateRegistry(registry) {
  if (
    registry.schema_version !== 1 ||
    !Array.isArray(registry.implementations)
  ) {
    throw new Error(
      "Unsupported registry schema or missing implementations array."
    );
  }

  const ids = new Set();

  for (const implementation of registry.implementations) {
    if (
      typeof implementation.id !== "string" ||
      !implementation.id.trim() ||
      typeof implementation.name !== "string" ||
      !implementation.name.trim()
    ) {
      throw new Error(
        "Every implementation must have an ID and a name."
      );
    }

    if (ids.has(implementation.id)) {
      throw new Error(
        `Duplicate implementation ID: ${implementation.id}`
      );
    }

    ids.add(implementation.id);

    for (const field of [
      "source_files",
      "test_files",
      "migration_files",
      "dependencies",
    ]) {
      if (
        !Array.isArray(implementation[field]) ||
        !implementation[field].every(
          (value) => typeof value === "string" && value.trim()
        )
      ) {
        throw new Error(
          `${implementation.id}: ${field} must be an array of non-empty strings.`
        );
      }
    }

    const hashes = implementation.verified_file_hashes ?? {};

    if (
      typeof hashes !== "object" ||
      hashes === null ||
      Array.isArray(hashes)
    ) {
      throw new Error(
        `${implementation.id}: verified_file_hashes must be an object.`
      );
    }

    for (const [filePath, hash] of Object.entries(hashes)) {
      if (
        !filePath.trim() ||
        typeof hash !== "string" ||
        !/^[a-f0-9]{64}$/i.test(hash)
      ) {
        throw new Error(
          `${implementation.id}: invalid SHA-256 entry for ${filePath}.`
        );
      }
    }
  }

  for (const implementation of registry.implementations) {
    for (const dependency of implementation.dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(
          `${implementation.id} references unknown dependency ${dependency}.`
        );
      }
    }
  }
}

function isDocumentationPath(filePath) {
  const normalized = normalizePath(filePath).toLowerCase();
  const baseName = normalized.split("/").at(-1);

  return (
    normalized.startsWith("docs/") ||
    /\.(md|mdx|rst|txt)$/.test(normalized) ||
    /^readme(?:\..*)?$/.test(baseName) ||
    /^changelog(?:\..*)?$/.test(baseName)
  );
}

function getChangedPaths(change) {
  if (change.oldPath && change.newPath) {
    return [change.oldPath, change.newPath];
  }

  return change.path ? [change.path] : [];
}

function addReason(map, id, category, reason) {
  if (!map.has(id)) {
    map.set(id, {
      source: new Set(),
      migration: new Set(),
      test: new Set(),
      dependency: new Set(),
    });
  }

  map.get(id)[category].add(reason);
}

function resolveMigrationPath(migration) {
  const normalized = normalizePath(migration);

  return normalized.startsWith(migrationDirectory)
    ? normalized
    : `${migrationDirectory}${normalized}`;
}

function buildOwnership(registry) {
  const sourceOwners = new Map();
  const testOwners = new Map();
  const migrationOwners = new Map();

  function addOwner(map, path, id) {
    const normalized = normalizePath(path);

    if (!map.has(normalized)) {
      map.set(normalized, []);
    }

    map.get(normalized).push(id);
  }

  for (const implementation of registry.implementations) {
    for (const filePath of implementation.source_files) {
      addOwner(sourceOwners, filePath, implementation.id);
    }

    for (const filePath of implementation.test_files) {
      addOwner(testOwners, filePath, implementation.id);
    }

    for (const migration of implementation.migration_files) {
      addOwner(
        migrationOwners,
        resolveMigrationPath(migration),
        implementation.id
      );
    }
  }

  return {
    sourceOwners,
    testOwners,
    migrationOwners,
  };
}

function buildImpactReport(registry, changes) {
  const ownership = buildOwnership(registry);
  const implementations = new Map(
    registry.implementations.map((item) => [item.id, item])
  );

  const impacts = new Map();
  const documentation = new Set();
  const unregistered = new Set();
  const changedSourceIds = new Set();
  const changedMigrationIds = new Set();

  const changedSourceFiles = new Set();
  const changedMigrationFiles = new Set();
  const changedTestFiles = new Set();

  const counts = {
    source: 0,
    migration: 0,
    test: 0,
    documentation: 0,
    unregistered: 0,
  };

  for (const change of changes) {
    const paths = getChangedPaths(change);

    for (const filePath of paths) {
      const sourceMatches = ownership.sourceOwners.get(filePath) ?? [];
      const testMatches = ownership.testOwners.get(filePath) ?? [];
      const migrationMatches =
        ownership.migrationOwners.get(filePath) ?? [];

      let classified = false;

      if (sourceMatches.length > 0) {
        changedSourceFiles.add(filePath);
        classified = true;

        for (const id of sourceMatches) {
          changedSourceIds.add(id);
          addReason(
            impacts,
            id,
            "source",
            `${change.status}: ${filePath}`
          );
        }
      }

      if (migrationMatches.length > 0) {
        changedMigrationFiles.add(filePath);
        classified = true;

        for (const id of migrationMatches) {
          changedMigrationIds.add(id);
          addReason(
            impacts,
            id,
            "migration",
            `${change.status}: ${filePath}`
          );
        }
      }

      if (testMatches.length > 0) {
        changedTestFiles.add(filePath);
        classified = true;

        for (const id of testMatches) {
          addReason(
            impacts,
            id,
            "test",
            `${change.status}: ${filePath}`
          );
        }
      }

      if (!classified) {
        if (isDocumentationPath(filePath)) {
          documentation.add(filePath);
        } else {
          unregistered.add(filePath);
        }
      }
    }
  }

  counts.source = changedSourceFiles.size;
  counts.migration = changedMigrationFiles.size;
  counts.test = changedTestFiles.size;
  counts.documentation = documentation.size;
  counts.unregistered = unregistered.size;

  const affectedIds = new Set([
    ...changedSourceIds,
    ...changedMigrationIds,
  ]);

  const queue = [...affectedIds];

  while (queue.length > 0) {
    const changedId = queue.shift();

    for (const implementation of registry.implementations) {
      if (
        implementation.dependencies.includes(changedId) &&
        !affectedIds.has(implementation.id)
      ) {
        affectedIds.add(implementation.id);
        queue.push(implementation.id);

        addReason(
          impacts,
          implementation.id,
          "dependency",
          `Dependency changed: ${changedId}`
        );
      }
    }
  }

  return {
    impacts,
    implementations,
    documentation,
    unregistered,
    counts,
  };
}

async function verifyRecordedHashes(registry) {
  const results = {
    checked: 0,
    matches: [],
    mismatches: [],
    missing: [],
  };

  for (const implementation of registry.implementations) {
    for (const [filePath, expectedHash] of Object.entries(
      implementation.verified_file_hashes ?? {}
    )) {
      results.checked++;

      const normalized = normalizePath(filePath);

      try {
        const contents = await readFile(
          resolveProjectPath(normalized)
        );

        const actualHash = createHash("sha256")
          .update(contents)
          .digest("hex")
          .toUpperCase();

        if (actualHash === expectedHash.toUpperCase()) {
          results.matches.push({
            id: implementation.id,
            path: normalized,
          });
        } else {
          results.mismatches.push({
            id: implementation.id,
            path: normalized,
            expected: expectedHash.toUpperCase(),
            actual: actualHash,
          });
        }
      } catch (error) {
        if (error.code === "ENOENT") {
          results.missing.push({
            id: implementation.id,
            path: normalized,
            reason: "Recorded hash file does not exist.",
          });
        } else {
          throw error;
        }
      }
    }
  }

  return results;
}

async function verifyRegisteredFiles(registry) {
  const results = {
    checked: 0,
    missing: [],
  };

  const declarations = new Map();

  for (const implementation of registry.implementations) {
    const entries = [
      ...implementation.source_files.map((path) => ({
        path,
        category: "source",
      })),
      ...implementation.test_files.map((path) => ({
        path,
        category: "test",
      })),
      ...implementation.migration_files.map((path) => ({
        path: resolveMigrationPath(path),
        category: "migration",
      })),
    ];

    for (const entry of entries) {
      const normalized = normalizePath(entry.path);
      const key = `${implementation.id}:${normalized}`;

      declarations.set(key, {
        id: implementation.id,
        path: normalized,
        category: entry.category,
      });
    }
  }

  for (const declaration of declarations.values()) {
    results.checked++;

    try {
      await readFile(resolveProjectPath(declaration.path));
    } catch (error) {
      if (error.code === "ENOENT") {
        results.missing.push(declaration);
      } else {
        throw error;
      }
    }
  }

  return results;
}

function printSection(title, values, formatter = String) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));

  if (values.length === 0) {
    console.log("None.");
    return;
  }

  for (const value of values) {
    console.log(`  - ${formatter(value)}`);
  }
}

function printIntegrityReport(hashResults, fileResults) {
  console.log("\nVERIFICATION HASH INTEGRITY");
  console.log("---------------------------");
  console.log(`Recorded hashes checked: ${hashResults.checked}`);
  console.log(`Matching hashes: ${hashResults.matches.length}`);
  console.log(`Hash mismatches: ${hashResults.mismatches.length}`);
  console.log(`Missing hash files: ${hashResults.missing.length}`);

  printSection(
    "HASH MISMATCHES (STALE VERIFICATION EVIDENCE)",
    hashResults.mismatches,
    (item) => `${item.id}: ${item.path}
      Expected: ${item.expected}
      Actual:   ${item.actual}`
  );

  printSection(
    "MISSING FILES REFERENCED BY HASHES",
    hashResults.missing,
    (item) => `${item.id}: ${item.path}`
  );

  console.log("\nREGISTERED FILE EXISTENCE");
  console.log("-------------------------");
  console.log(`Registered files checked: ${fileResults.checked}`);
  console.log(`Missing registered files: ${fileResults.missing.length}`);

  printSection(
    "MISSING REGISTERED SOURCE, TEST, OR MIGRATION FILES",
    fileResults.missing,
    (item) => `${item.id} [${item.category}]: ${item.path}`
  );
}

function printReport(registry, changes, report) {
  console.log("\nAGENTMACARTHUR IMPLEMENTATION IMPACT REPORT");
  console.log("============================================");

  console.log(`Branch: ${runGit(["branch", "--show-current"]).trim()}`);
  console.log(`HEAD: ${runGit(["rev-parse", "HEAD"]).trim()}`);
  console.log(`Registered implementations: ${registry.implementations.length}`);
  console.log(`Detected Git changes: ${changes.length}`);

  console.log("\nCHANGE DETAILS");
  console.log("--------------");

  if (changes.length === 0) {
    console.log("No tracked or untracked changes detected relative to HEAD.");
  }

  for (const change of changes) {
    if (change.oldPath && change.newPath) {
      console.log(
        `${change.status}: ${change.oldPath} -> ${change.newPath}`
      );
    } else {
      console.log(`${change.status}: ${change.path}`);
    }
  }

  console.log("\nCHANGE CLASSIFICATION");
  console.log("---------------------");
  console.log(`Source changes: ${report.counts.source}`);
  console.log(`Migration changes: ${report.counts.migration}`);
  console.log(`Test changes: ${report.counts.test}`);
  console.log(`Documentation changes: ${report.counts.documentation}`);
  console.log(`Unregistered changes: ${report.counts.unregistered}`);

  console.log("\nAFFECTED IMPLEMENTATIONS");
  console.log("------------------------");

  if (report.impacts.size === 0) {
    console.log("No registered implementations directly affected.");
  }

  for (const [id, reasons] of report.impacts) {
    const implementation = report.implementations.get(id);

    console.log(`\n${id} - ${implementation.name}`);
    console.log(`Current registry status: ${implementation.status}`);

    for (const category of [
      "source",
      "migration",
      "test",
      "dependency",
    ]) {
      if (reasons[category].size === 0) continue;

      console.log(`${category.toUpperCase()} IMPACT:`);

      for (const reason of reasons[category]) {
        console.log(`  - ${reason}`);
      }
    }
  }

  printSection(
    "DOCUMENTATION-ONLY CHANGES",
    [...report.documentation].sort()
  );

  printSection(
    "UNREGISTERED CHANGES",
    [...report.unregistered].sort()
  );

  console.log("\nSAFETY");
  console.log("------");
  console.log("Read-only report. No source files or registry records were modified.");
  console.log("No implementation status or verification history was changed.");
  console.log("Git changes are compared against HEAD, including untracked files.");
  console.log("Hash mismatches indicate stale verification evidence, not proven defects.");
  console.log("Migration file changes do not prove that migrations were applied.");
  console.log("A human review is required before updating verification evidence.");
}

async function main() {
  const rawRegistry = await readFile(registryPath, "utf8");
  const registry = JSON.parse(rawRegistry.replace(/^\uFEFF/, ""));

  validateRegistry(registry);

  const changes = getGitChanges();
  const report = buildImpactReport(registry, changes);

  const hashResults = await verifyRecordedHashes(registry);
  const fileResults = await verifyRegisteredFiles(registry);

  printReport(registry, changes, report);
  printIntegrityReport(hashResults, fileResults);
}

try {
  await main();
} catch (error) {
  console.error("\nImplementation change checker failed.");
  console.error(error.message);
  process.exitCode = 1;
}

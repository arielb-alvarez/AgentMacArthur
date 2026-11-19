import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const checkerSource = resolve(
  process.cwd(),
  "scripts/architecture/check-implementation-changes.mjs"
);

const registryRelativePath =
  "docs/architecture/implementation-registry.json";

const checkerRelativePath =
  "scripts/architecture/check-implementation-changes.mjs";

let projectRoot: string;

function runGit(args: string[]) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function hash(contents: string) {
  return createHash("sha256")
    .update(contents)
    .digest("hex")
    .toUpperCase();
}

async function writeProjectFile(
  relativePath: string,
  contents: string
) {
  const absolutePath = join(projectRoot, relativePath);

  await mkdir(join(absolutePath, ".."), {
    recursive: true,
  });

  await writeFile(absolutePath, contents, "utf8");
}

async function readProjectFile(relativePath: string) {
  return readFile(
    join(projectRoot, relativePath),
    "utf8"
  );
}

async function initializeFixture() {
  projectRoot = await mkdtemp(
    join(tmpdir(), "agentmacarthur-architecture-test-")
  );

  const directories = [
    "docs/architecture",
    "scripts/architecture",
    "src/database/migrations",
    "tests",
    "src",
  ];

  for (const directory of directories) {
    await mkdir(join(projectRoot, directory), {
      recursive: true,
    });
  }

  await cp(
    checkerSource,
    join(projectRoot, checkerRelativePath)
  );

  const sourceA = "export const valueA = 1;\n";
  const sourceB = "export const valueB = 1;\n";
  const sourceC = "export const valueC = 1;\n";

  await writeProjectFile("src/a.js", sourceA);
  await writeProjectFile("src/b.js", sourceB);
  await writeProjectFile("src/c.js", sourceC);

  await writeProjectFile(
    "tests/a.test.js",
    "test('A', () => {});\n"
  );

  await writeProjectFile(
    "tests/b.test.js",
    "test('B', () => {});\n"
  );

  await writeProjectFile(
    "src/database/migrations/001_test.sql",
    "CREATE TABLE test_a (id integer);\n"
  );

  await writeProjectFile(
    "src/database/migrations/002_test.sql",
    "CREATE TABLE test_b (id integer);\n"
  );

  const registry = {
    schema_version: 1,
    implementations: [
      {
        id: "IMPL-A",
        name: "Implementation A",
        module: "test",
        responsibility: "Test implementation A.",
        source_files: ["src/a.js"],
        test_files: ["tests/a.test.js"],
        migration_files: ["001_test.sql"],
        dependencies: [],
        status: "verified",
        last_verified_revision: null,
        verified_file_hashes: {
          "src/a.js": hash(sourceA),
        },
        verification_history: [],
        notes: "",
      },
      {
        id: "IMPL-B",
        name: "Implementation B",
        module: "test",
        responsibility: "Test implementation B.",
        source_files: ["src/b.js"],
        test_files: ["tests/b.test.js"],
        migration_files: [
          "src/database/migrations/002_test.sql",
        ],
        dependencies: ["IMPL-A"],
        status: "verified",
        last_verified_revision: null,
        verified_file_hashes: {},
        verification_history: [],
        notes: "",
      },
      {
        id: "IMPL-C",
        name: "Implementation C",
        module: "test",
        responsibility: "Test implementation C.",
        source_files: ["src/c.js"],
        test_files: [],
        migration_files: [],
        dependencies: ["IMPL-B"],
        status: "verified",
        last_verified_revision: null,
        verified_file_hashes: {},
        verification_history: [],
        notes: "",
      },
    ],
  };

  await writeProjectFile(
    registryRelativePath,
    JSON.stringify(registry, null, 2)
  );

  runGit(["init"]);
  runGit(["config", "user.name", "Architecture Tests"]);
  runGit([
    "config",
    "user.email",
    "architecture-tests@example.invalid",
  ]);
  runGit(["add", "-A"]);
  runGit(["commit", "-m", "Initial test fixture"]);

  return registry;
}

function runChecker() {
  return spawnSync(
    process.execPath,
    [join(projectRoot, checkerRelativePath)],
    {
      cwd: projectRoot,
      encoding: "utf8",
    }
  );
}

function checkerOutput() {
  const result = runChecker();

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);

  return result.stdout;
}

async function readRegistry() {
  return JSON.parse(
    await readProjectFile(registryRelativePath)
  );
}

async function writeRegistry(registry: unknown) {
  await writeProjectFile(
    registryRelativePath,
    JSON.stringify(registry, null, 2)
  );
}

describe("implementation change checker", () => {
  beforeEach(async () => {
    await initializeFixture();
  });

  afterEach(async () => {
    if (projectRoot) {
      await rm(projectRoot, {
        recursive: true,
        force: true,
      });
    }
  });

  it("reports matching recorded hashes and existing registered files", () => {
    const output = checkerOutput();

    expect(output).toContain("Recorded hashes checked: 1");
    expect(output).toContain("Matching hashes: 1");
    expect(output).toContain("Hash mismatches: 0");
    expect(output).toContain("Missing hash files: 0");
    expect(output).toContain("Registered files checked: 7");
    expect(output).toContain("Missing registered files: 0");
  });

  it("detects a stale recorded hash when a file changes", async () => {
    await writeProjectFile(
      "src/a.js",
      "export const valueA = 2;\n"
    );

    const output = checkerOutput();

    expect(output).toContain("Hash mismatches: 1");
    expect(output).toContain("Missing hash files: 0");
    expect(output).toContain(
      "IMPL-A: src/a.js"
    );
    expect(output).toContain("SOURCE IMPACT:");
  });

  it("detects a missing file referenced by a recorded hash", async () => {
    await rm(join(projectRoot, "src/a.js"));

    const output = checkerOutput();

    expect(output).toContain("Missing hash files: 1");
    expect(output).toContain("Hash mismatches: 0");
    expect(output).toContain("Missing registered files: 1");
    expect(output).toContain("IMPL-A [source]: src/a.js");
  });

  it("detects registered files that no longer exist", async () => {
    await rm(join(projectRoot, "src/b.js"));

    const output = checkerOutput();

    expect(output).toContain("Missing registered files: 1");
    expect(output).toContain("IMPL-B [source]: src/b.js");
  });

  it("propagates source impacts through transitive dependencies", async () => {
    await writeProjectFile(
      "src/a.js",
      "export const valueA = 2;\n"
    );

    const output = checkerOutput();

    expect(output).toContain(
      "IMPL-A - Implementation A"
    );
    expect(output).toContain(
      "IMPL-B - Implementation B"
    );
    expect(output).toContain(
      "IMPL-C - Implementation C"
    );

    expect(output).toContain(
      "Dependency changed: IMPL-A"
    );
    expect(output).toContain(
      "Dependency changed: IMPL-B"
    );
  });

  it("does not propagate test-only changes to dependent implementations", async () => {
    await writeProjectFile(
      "tests/a.test.js",
      "test('A updated', () => {});\n"
    );

    const output = checkerOutput();

    expect(output).toContain("Test changes: 1");
    expect(output).toContain(
      "IMPL-A - Implementation A"
    );

    expect(output).not.toContain(
      "IMPL-B - Implementation B"
    );
    expect(output).not.toContain(
      "IMPL-C - Implementation C"
    );
    expect(output).not.toContain("DEPENDENCY IMPACT:");
  });

  it("recognizes both bare and repository-relative migration paths", async () => {
    await writeProjectFile(
      "src/database/migrations/002_test.sql",
      "CREATE TABLE test_b (id bigint);\n"
    );

    const output = checkerOutput();

    expect(output).toContain("Migration changes: 1");
    expect(output).toContain(
      "IMPL-B - Implementation B"
    );
    expect(output).toContain(
      "src/database/migrations/002_test.sql"
    );
    expect(output).toContain("MIGRATION IMPACT:");
  });

  it("rejects registry entries that reference unknown dependencies", async () => {
    const registry = await readRegistry();

    registry.implementations[0].dependencies = [
      "IMPL-DOES-NOT-EXIST",
    ];

    await writeRegistry(registry);

    const result = runChecker();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "references unknown dependency IMPL-DOES-NOT-EXIST"
    );
  });

  it("classifies untracked files as unregistered changes", async () => {
    await writeProjectFile(
      ".temporary-test-file",
      "temporary\n"
    );

    const output = checkerOutput();

    expect(output).toContain("Unregistered changes: 1");
    expect(output).toContain(
      ".temporary-test-file"
    );
  });

  it("does not modify the registry or Git worktree", async () => {
    await writeProjectFile(
      "src/a.js",
      "export const valueA = 2;\n"
    );

    await writeProjectFile(
      ".temporary-test-file",
      "temporary\n"
    );

    const registryBefore = await readProjectFile(
      registryRelativePath
    );

    const gitStatusBefore = runGit([
      "status",
      "--porcelain",
    ]);

    checkerOutput();

    const registryAfter = await readProjectFile(
      registryRelativePath
    );

    const gitStatusAfter = runGit([
      "status",
      "--porcelain",
    ]);

    expect(registryAfter).toBe(registryBefore);
    expect(gitStatusAfter).toBe(gitStatusBefore);
  });
});
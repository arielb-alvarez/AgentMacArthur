import {
  cp,
  mkdir,
  rm,
} from "node:fs/promises";

import {
  dirname,
  resolve,
} from "node:path";

import {
  fileURLToPath,
} from "node:url";

const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  ".."
);

const source = resolve(
  projectRoot,
  "src/database/migrations"
);

const destination = resolve(
  projectRoot,
  "dist/database/migrations"
);

// Remove stale migration files from previous builds.
await rm(destination, {
  recursive: true,
  force: true,
});

await mkdir(dirname(destination), {
  recursive: true,
});

await cp(source, destination, {
  recursive: true,
});

console.log("SQL migrations copied to dist/database/migrations");

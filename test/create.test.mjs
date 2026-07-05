import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const createScript = path.join(repoRoot, "create.mjs");

test("creates a starter site that can build immediately", async (t) => {
  const parentDir = mkdtempSync(path.join(tmpdir(), "tiny-md-create-"));
  const projectDir = path.join(parentDir, "hello-site");
  t.after(() => removeFixture(parentDir));

  const createResult = spawnSync(process.execPath, [createScript, "hello-site"], {
    cwd: parentDir,
    encoding: "utf8",
  });

  assert.equal(createResult.status, 0, createResult.stderr || createResult.stdout);
  assert.match(createResult.stdout, /Created tiny\.md site in hello-site/);
  assert.ok(existsSync(path.join(projectDir, "build.mjs")));
  assert.ok(existsSync(path.join(projectDir, "defaults/style.css")));
  assert.ok(existsSync(path.join(projectDir, "site/site.md")));
  assert.ok(existsSync(path.join(projectDir, "site/content/index.md")));
  assert.ok(existsSync(path.join(projectDir, "site/content/about/index.md")));
  assert.ok(existsSync(path.join(projectDir, "site/theme/style.css")));
  assert.ok(existsSync(path.join(projectDir, "site/theme/favicon.svg")));

  const packageJson = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
  assert.equal(packageJson.name, "hello-site");
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.scripts.build, "node build.mjs");
  assert.match(packageJson.dependencies.marked, /^\^18\./);

  const buildResult = spawnSync(process.execPath, ["build.mjs"], {
    cwd: projectDir,
    encoding: "utf8",
  });

  assert.equal(buildResult.status, 0, buildResult.stderr || buildResult.stdout);
  assert.match(buildResult.stdout, /Built 2 pages into dist\//);
  assert.match(readFileSync(path.join(projectDir, "dist/index.html"), "utf8"), /Welcome to your new tiny\.md site\./);
  assert.match(readFileSync(path.join(projectDir, "dist/about/index.html"), "utf8"), /This page lives at/);
});

test("refuses to create a starter site in a non-empty directory", async (t) => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "tiny-md-create-non-empty-"));
  t.after(() => removeFixture(projectDir));
  writeFileSync(path.join(projectDir, "existing.txt"), "already here\n");

  const result = spawnSync(process.execPath, [createScript, projectDir], {
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists and is not empty/);
  assert.equal(existsSync(path.join(projectDir, "build.mjs")), false);
});

async function removeFixture(project) {
  await rm(project, { recursive: true, force: true });
}

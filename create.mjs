#!/usr/bin/env node

import { cp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const markedVersion = "^18.0.5";
const args = process.argv.slice(2);
const helpRequested = args.includes("--help") || args.includes("-h");
const targetArg = args.find((arg) => !arg.startsWith("-")) || "my-tinymd-site";
const targetDir = path.resolve(process.cwd(), targetArg);
const projectName = packageNameFromPath(targetDir);

if (helpRequested) {
  printHelp();
  process.exit(0);
}

try {
  await createStarterSite(targetDir, projectName);
  printSuccess(targetDir);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

async function createStarterSite(projectDir, name) {
  await assertCreatableDirectory(projectDir);

  await mkdir(path.join(projectDir, "site/content/about"), { recursive: true });
  await mkdir(path.join(projectDir, "site/theme"), { recursive: true });

  await cp(path.join(packageRoot, "build.mjs"), path.join(projectDir, "build.mjs"));
  await cp(path.join(packageRoot, "defaults"), path.join(projectDir, "defaults"), { recursive: true });
  await copyRuntimeDependencies(projectDir);

  await writeFile(path.join(projectDir, "package.json"), starterPackageJson(name));
  await writeFile(path.join(projectDir, ".gitignore"), starterGitignore());
  await writeFile(path.join(projectDir, "README.md"), starterReadme());
  await writeFile(path.join(projectDir, "site/site.md"), starterSiteConfig());
  await writeFile(path.join(projectDir, "site/content/index.md"), starterHomePage());
  await writeFile(path.join(projectDir, "site/content/about/index.md"), starterAboutPage());
  await writeFile(path.join(projectDir, "site/theme/style.css"), starterThemeCss());
  await writeFile(path.join(projectDir, "site/theme/favicon.svg"), starterFavicon());
}

async function copyRuntimeDependencies(projectDir) {
  const markedPackagePath = fileURLToPath(import.meta.resolve("marked/package.json"));
  const markedPackageDir = path.dirname(markedPackagePath);

  await mkdir(path.join(projectDir, "node_modules"), { recursive: true });
  await cp(markedPackageDir, path.join(projectDir, "node_modules/marked"), { recursive: true });
}

async function assertCreatableDirectory(projectDir) {
  try {
    const directoryStat = await stat(projectDir);

    if (!directoryStat.isDirectory()) {
      throw new Error(`${projectDir} already exists and is not a directory.`);
    }

    const entries = await readdir(projectDir);

    if (entries.length > 0) {
      throw new Error(`${projectDir} already exists and is not empty.`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function packageNameFromPath(projectDir) {
  const baseName = path.basename(projectDir).toLowerCase();
  const cleaned = baseName
    .replace(/^@/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+/, "");

  return cleaned || "my-tinymd-site";
}

function starterPackageJson(name) {
  return `${JSON.stringify(
    {
      name,
      private: true,
      type: "module",
      scripts: {
        build: "node build.mjs",
        dev: "node build.mjs --watch --serve",
      },
      dependencies: {
        marked: markedVersion,
      },
    },
    null,
    2,
  )}
`;
}

function starterGitignore() {
  return `dist/
.DS_Store
.playwright-mcp/
node_modules/
`;
}

function starterReadme() {
  return `# My tiny.md site

This site was created with tiny.md.

## Commands

\`\`\`sh
npm run build
npm run dev
\`\`\`

\`npm run build\` writes the site to \`dist/\`.

\`npm run dev\` rebuilds on changes and serves the site at \`http://localhost:4173\`.
`;
}

function starterSiteConfig() {
  return `---
name: My tiny.md site
description: A simple static site generated from folders and Markdown.
footer: false
---

## Navigation

- [Home](/)
- [About](/about)
`;
}

function starterHomePage() {
  return `---
description: A small website built with Markdown and CSS.
---

# Home

Welcome to your new tiny.md site.

Edit this page at \`site/content/index.md\`. Add more pages by creating folders with their own \`index.md\` files.

- [About this site](/about)
`;
}

function starterAboutPage() {
  return `---
title: About
description: Learn how this tiny.md starter site is organized.
---

# About

This page lives at \`site/content/about/index.md\` and builds to \`/about/\`.

The model is intentionally small:

1. Folders are pages.
2. Markdown is content.
3. CSS lives in \`site/theme/style.css\`.
4. Generated files go to \`dist/\`.

[Back home](/)
`;
}

function starterThemeCss() {
  return `/* User overrides.
   Default styles live in ../../defaults/style.css and load before this file. */

:root {
  --color-primary: #0f766e;
  --color-primary-hover: #0d5f59;
  --color-link: #0f766e;
  --color-link-hover: #0d5f59;
}

.content-container {
  max-width: 68ch;
}
`;
}

function starterFavicon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#0f766e"/>
  <path d="M14 42c8-18 16 2 24-16 4-9 8-11 12-10" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
</svg>
`;
}

function printHelp() {
  console.log(`Create a tiny.md starter site.

Usage:
  npx create-tiny-md [directory]

Examples:
  npx create-tiny-md my-site
  npx create-tiny-md .
`);
}

function printSuccess(projectDir) {
  const relativeDir = path.relative(process.cwd(), projectDir) || ".";

  console.log(`Created tiny.md site in ${relativeDir}`);
  console.log("");
  console.log("Next steps:");

  if (relativeDir !== ".") {
    console.log(`  cd ${relativeDir}`);
  }

  console.log("  npm run build");
  console.log("  npm run dev");
}

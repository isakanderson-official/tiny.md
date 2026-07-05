import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const buildScript = path.join(repoRoot, "build.mjs");

test("builds semantic pages from folder index.md files", async (t) => {
  const project = await createFixture({
    site: `---
name: Test Site
description: Default site description.
footer: false
---

## Navigation

- [Home](/)
- [About](/about)
`,
    pages: {
      "index.md": `---
description: Home description.
---

# Home

Welcome to [About](/about).
`,
      "about/index.md": `---
title: About Us
description: About description.
---

# Ignored Heading

About page.
`,
    },
  });
  t.after(() => removeFixture(project));

  runBuild(project);

  const home = readOutput(project, "index.html");
  const about = readOutput(project, "about/index.html");

  assert.match(home, /<title>Home \| Test Site<\/title>/);
  assert.match(home, /<meta name="description" content="Home description\.">/);
  assert.match(home, /<header class="site-header">/);
  assert.match(home, /<nav class="site-nav" aria-label="Main navigation">/);
  assert.match(home, /<main class="site-main">/);
  assert.match(home, /<article class="page-content">/);
  assert.match(home, /<div class="content-container content">/);
  assert.match(home, /<a href="\.\/about\/">About<\/a>/);
  assert.match(home, /<a href="\/about\/">About<\/a>/);
  assert.doesNotMatch(home, /<footer class="site-footer">/);

  assert.match(about, /<title>About Us \| Test Site<\/title>/);
  assert.match(about, /<meta name="description" content="About description\.">/);
  assert.match(about, /<li><a href="\.\.\/">Home<\/a><\/li>/);
  assert.match(about, /<li><a href="\." aria-current="page">About<\/a><\/li>/);
});

test("copies default styles, user overrides, theme assets, and content assets", async (t) => {
  const project = await createFixture({
    defaultsCss: ":root { --color-primary: #5b4df2; }\n.content-container { max-width: 72ch; }\n",
    themeCss: ":root { --color-primary: #0f766e; }\n.content-container { max-width: 64ch; }\n",
    themeAssets: {
      "favicon.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n",
    },
    pages: {
      "index.md": "# Home\n\n![Diagram](diagram.svg)\n",
    },
    contentAssets: {
      "diagram.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n",
    },
  });
  t.after(() => removeFixture(project));

  runBuild(project);

  const home = readOutput(project, "index.html");

  assert.ok(existsSync(path.join(project, "dist/default.css")));
  assert.ok(existsSync(path.join(project, "dist/style.css")));
  assert.ok(existsSync(path.join(project, "dist/favicon.svg")));
  assert.ok(existsSync(path.join(project, "dist/diagram.svg")));
  assert.match(home, /<link rel="stylesheet" href="\.\/default.css">\n  <link rel="stylesheet" href="\.\/style.css">/);
  assert.match(home, /<img src="diagram\.svg" alt="Diagram">/);
  assert.match(readOutput(project, "default.css"), /--color-primary: #5b4df2/);
  assert.match(readOutput(project, "style.css"), /--color-primary: #0f766e/);
});

test("generates canonical URLs and sitemap only when site URL is set", async (t) => {
  const project = await createFixture({
    site: `---
name: Canonical Site
description: Site description.
url: https://example.com
image: /share.png
footer: false
---`,
    pages: {
      "index.md": "# Home\n",
      "docs/index.md": `---
image: docs-card.png
---

# Docs
`,
    },
  });
  t.after(() => removeFixture(project));

  runBuild(project);

  const home = readOutput(project, "index.html");
  const docs = readOutput(project, "docs/index.html");
  const sitemap = readOutput(project, "sitemap.xml");

  assert.match(home, /<link rel="canonical" href="https:\/\/example\.com\/">/);
  assert.match(home, /<meta property="og:url" content="https:\/\/example\.com\/">/);
  assert.match(home, /<meta property="og:site_name" content="Canonical Site">/);
  assert.match(home, /<meta property="og:image" content="https:\/\/example\.com\/share\.png">/);
  assert.match(home, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(docs, /<link rel="canonical" href="https:\/\/example\.com\/docs\/">/);
  assert.match(docs, /<meta property="og:image" content="https:\/\/example\.com\/docs\/docs-card\.png">/);
  assert.match(docs, /<meta name="twitter:image" content="https:\/\/example\.com\/docs\/docs-card\.png">/);
  assert.match(sitemap, /<loc>https:\/\/example\.com\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/example\.com\/docs\/<\/loc>/);
});

test("omits canonical URLs and sitemap when site URL is not set", async (t) => {
  const project = await createFixture({
    pages: {
      "index.md": "# Home\n",
    },
  });
  t.after(() => removeFixture(project));

  runBuild(project);

  const home = readOutput(project, "index.html");

  assert.doesNotMatch(home, /rel="canonical"/);
  assert.doesNotMatch(home, /property="og:url"/);
  assert.match(home, /<meta name="twitter:card" content="summary">/);
  assert.equal(existsSync(path.join(project, "dist/sitemap.xml")), false);
});

test("embeds standalone YouTube URLs and leaves normal markdown links alone", async (t) => {
  const project = await createFixture({
    pages: {
      "index.md": `# Home

https://youtu.be/jNQXAC9IVRw

Read [the video page](https://www.youtube.com/watch?v=jNQXAC9IVRw).
`,
    },
  });
  t.after(() => removeFixture(project));

  runBuild(project);

  const home = readOutput(project, "index.html");

  assert.match(home, /<div class="video-embed">/);
  assert.match(home, /<iframe src="https:\/\/www\.youtube\.com\/embed\/jNQXAC9IVRw\?rel=0"/);
  assert.match(home, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(home, /<a href="https:\/\/www\.youtube\.com\/watch\?v=jNQXAC9IVRw">the video page<\/a>/);
});

test("preserves indentation inside fenced code blocks", async (t) => {
  const project = await createFixture({
    pages: {
      "index.md": `# Home

\`\`\`txt
site/
  site.md
  content/
    index.md
\`\`\`
`,
    },
  });
  t.after(() => removeFixture(project));

  runBuild(project);

  const home = readOutput(project, "index.html");

  assert.match(home, /<pre><code class="language-txt">site\//);
  assert.match(home, /site\/\n  site\.md\n  content\/\n    index\.md<\/code><\/pre>/);
  assert.doesNotMatch(home, /site\/\n\s{8,}site\.md/);
});

test("renders richer Markdown through the parser", async (t) => {
  const project = await createFixture({
    pages: {
      "index.md": `Parser Trial
============

Term | Status
--- | ---
Tables | ~~manual~~ parsed

- [x] Task lists
- [ ] Nested Markdown

<aside class="note">Raw HTML works.</aside>

[About](/about "About page")
`,
      "about/index.md": "# About\n",
    },
  });
  t.after(() => removeFixture(project));

  runBuild(project);

  const home = readOutput(project, "index.html");

  assert.match(home, /<title>Parser Trial \| Test Site<\/title>/);
  assert.match(home, /<table>/);
  assert.match(home, /<td>Tables<\/td>/);
  assert.match(home, /<td><del>manual<\/del> parsed<\/td>/);
  assert.match(home, /<input checked="" disabled="" type="checkbox"> Task lists/);
  assert.match(home, /<input disabled="" type="checkbox"> Nested Markdown/);
  assert.match(home, /<aside class="note">Raw HTML works\.<\/aside>/);
  assert.match(home, /<a href="\/about\/" title="About page">About<\/a>/);
});

test("renders optional footer text from site.md frontmatter", async (t) => {
  const project = await createFixture({
    site: `---
name: Footer Site
footer: Copyright 2026 Footer Site
---`,
    pages: {
      "index.md": "# Home\n",
    },
  });
  t.after(() => removeFixture(project));

  runBuild(project);

  const home = readOutput(project, "index.html");

  assert.match(home, /<footer class="site-footer">/);
  assert.match(home, /<p>Copyright 2026 Footer Site<\/p>/);
});

async function createFixture(options = {}) {
  const project = mkdtempSync(path.join(tmpdir(), "tiny-md-test-"));

  await mkdir(path.join(project, "defaults"), { recursive: true });
  await mkdir(path.join(project, "site/content"), { recursive: true });
  await mkdir(path.join(project, "site/theme"), { recursive: true });

  writeFileSync(
    path.join(project, "defaults/style.css"),
    options.defaultsCss || ":root { --color-primary: #5b4df2; }\n",
  );
  writeFileSync(path.join(project, "site/theme/style.css"), options.themeCss || "/* user styles */\n");
  writeFileSync(
    path.join(project, "site/theme/favicon.svg"),
    "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n",
  );
  writeFileSync(
    path.join(project, "site/site.md"),
    options.site ||
      `---
name: Test Site
description: Test description.
footer: false
---`,
  );

  for (const [filePath, contents] of Object.entries(options.pages || { "index.md": "# Home\n" })) {
    await writeFixtureFile(path.join(project, "site/content", filePath), contents);
  }

  for (const [filePath, contents] of Object.entries(options.contentAssets || {})) {
    await writeFixtureFile(path.join(project, "site/content", filePath), contents);
  }

  for (const [filePath, contents] of Object.entries(options.themeAssets || {})) {
    await writeFixtureFile(path.join(project, "site/theme", filePath), contents);
  }

  return project;
}

async function writeFixtureFile(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function runBuild(project) {
  const result = spawnSync(process.execPath, [buildScript], {
    cwd: project,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Built \d+ pages? into dist\//);
}

function readOutput(project, filePath) {
  return readFileSync(path.join(project, "dist", filePath), "utf8");
}

async function removeFixture(project) {
  await rm(project, { recursive: true, force: true });
}

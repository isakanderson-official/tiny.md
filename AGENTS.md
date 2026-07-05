# Agent Context

This repository is `tiny.md`, a dependency-free static site generator built around a small authoring model:

- `site/site.md` controls site-wide metadata and navigation.
- `site/content/` contains folder-based pages.
- `site/theme/` contains user-owned assets and CSS overrides.
- `defaults/` contains generator-owned default styles.
- `dist/` is generated output and should not be committed.

## Commands

Run these before finishing code changes:

```sh
npm test
npm run build
```

Use `npm run dev` only when a browser preview is needed. It serves `dist/` locally and watches `site/`.

## Project Rules

- Keep the project dependency-free unless the user explicitly chooses otherwise.
- Prefer plain Node.js built-ins and small, readable functions.
- Preserve the folder-as-page model: each page is a folder with `index.md`.
- Keep page-specific assets beside that page's `index.md`.
- Keep site-wide visual assets in `site/theme/`.
- Keep defaults automatic; user CSS should override default CSS by loading after it.
- Do not commit `dist/`, `.DS_Store`, `.playwright-mcp/`, or `node_modules/`.

## Generator Behavior

The generator is implemented in `build.mjs`.

Important behavior to preserve:

- `site/content/index.md` builds to `dist/index.html`.
- `site/content/about/index.md` builds to `dist/about/index.html`.
- `site/site.md` frontmatter sets site metadata.
- The `## Navigation` section in `site/site.md` uses normal Markdown links for header nav.
- The optional `## Actions` section in `site/site.md` creates header action links.
- Internal root-relative Markdown links like `/about` normalize to clean trailing-slash URLs.
- Standalone YouTube URLs become responsive embeds.
- Non-Markdown files in `site/content/` copy to matching `dist/` folders.
- `defaults/style.css` copies to `dist/default.css`.
- `site/theme/` copies to `dist/`, including `style.css` and `favicon.svg`.
- Pages load `default.css` first and `style.css` second.
- Canonical URLs and `sitemap.xml` are generated only when `url` is set in `site/site.md`.

## Testing Notes

Tests live in `test/generator.test.mjs` and use Node's built-in `node:test`.

The tests create temporary fixture projects and execute `build.mjs` as a CLI. Prefer adding end-to-end fixture tests for new generator behavior before exporting internals.

## Documentation

`README.md` is the user-facing guide. Update it when changing:

- the authoring model
- folder layout
- Markdown features
- styling behavior
- config fields in `site/site.md`
- build/dev/test commands

---
title: Quickstart
description: Create and build your first tiny.md site.
---

# Quickstart

Use `npx` to create a starter site:

```sh
npx create-tiny-md my-site
cd my-site
npm run build
npm run dev
```

`npm run build` writes static files to `dist/`.

`npm run dev` rebuilds on changes and serves the site at `http://localhost:4173`.

## What you get

```txt
site/
  site.md
  content/
    index.md
    about/
      index.md
  theme/
    style.css
    favicon.svg
defaults/
  style.css
```

The starter includes a home page, an about page, default styles, and a small place for your own CSS.

## Edit the site

- Change site-wide metadata and navigation in `site/site.md`.
- Edit the home page in `site/content/index.md`.
- Add a new page by creating a folder with an `index.md` file.
- Put page-specific images beside that page's `index.md`.
- Put global CSS and visual assets in `site/theme/`.

## Publish the output

After `npm run build`, upload the contents of `dist/` to any static host.

Good fits include GitHub Pages, Netlify, Cloudflare Pages, Vercel static output, or a plain web server.

[See common use cases](/use-cases)

# tiny.md

This is a tiny dependency-free static site generator. It turns folders with `index.md` files into semantic HTML pages, copies your CSS, and keeps the authoring model small.

## Quick Start

```sh
npm run build
npm run dev
```

`npm run build` writes the site to `dist/`.

`npm run dev` rebuilds on changes and serves the site at `http://localhost:4173`.

## Folder Model

Each page is a folder with an `index.md` file:

```txt
site/
  site.md
  content/
    index.md
    workspace.svg
    about/
      index.md
  theme/
    style.css
    favicon.svg
defaults/
  style.css
```

This builds to:

```txt
dist/
  index.html
  workspace.svg
  about/
    index.html
  default.css
  style.css
```

Put page-specific images beside the page's `index.md`:

```txt
site/
  content/
    about/
      index.md
      portrait.jpg
```

Then reference them with normal Markdown:

```md
![Portrait](portrait.jpg)
```

The build copies non-Markdown files from `site/content/` into the matching `dist/` folder. Keep site-wide design assets like user CSS overrides and `favicon.svg` in `site/theme/`.

## Links

Use normal Markdown links for internal navigation:

```md
[About](/about)
[Home](/)
```

Internal page links are normalized to clean trailing-slash URLs. External links, email links, anchors, and asset links are left alone.

## Videos

Paste a YouTube URL on its own line to embed a playable video:

```md
https://www.youtube.com/watch?v=jNQXAC9IVRw
```

Supported formats include `youtube.com/watch?v=...`, `youtube.com/shorts/...`, `youtube.com/embed/...`, and `youtu.be/...`.

If the URL appears inside a sentence or normal Markdown link, it stays as a regular link.

## Page Metadata

The first `# Heading` becomes the page title. You can override metadata with optional frontmatter:

```md
---
title: About
description: A short description for search results and sharing.
---

# About
```

Site-wide metadata lives in `site/site.md`:

```md
---
name: Isak Anderson
description: A simple static site generated from folders and Markdown.
footer: false
---

## Navigation

- [Home](/)
- [About](/about)
```

The domain is optional. The site builds and runs without it.

When you are ready to publish, add `url` so the build can generate canonical URLs and `sitemap.xml`:

```md
---
name: Isak Anderson
description: A simple static site generated from folders and Markdown.
url: https://example.com
footer: false
---
```

## Header Links

Define your main header links in `site/site.md`:

```md
## Navigation

- [Home](/)
- [About](/about)
- [Pricing](/pricing)
```

If you ever want right-side header buttons, add an `Actions` section:

```md
## Actions

- [Login](/login)
- [Start free trial](/signup)
```

Internal links like `/about` are normalized to clean page URLs. External links like `https://example.com` are left alone.

If `nav` is not defined, the generator creates navigation from your page folders.

## Footer

New sites do not include a footer by default:

```md
---
footer: false
---
```

Add one later by setting footer text:

```md
---
footer: © 2026 My Site
---
```

## Generated HTML

Each page uses semantic landmarks and stable class names:

```html
<header class="site-header">...</header>
<main class="site-main">
  <article class="page-content">
    <div class="content-container content">
      ...
    </div>
  </article>
</main>
```

## Styling

The generator loads two stylesheets:

```html
<link rel="stylesheet" href="./default.css">
<link rel="stylesheet" href="./style.css">
```

`defaults/style.css` is generator-owned and gives the site a polished default design.

`site/theme/style.css` is user-owned and loads after the defaults, so it can override variables and classes with a small amount of CSS:

```css
:root {
  --color-primary: #0f766e;
  --color-page: #ffffff;
}

.content-container {
  max-width: 64ch;
}
```

Use `site/theme/style.css` to customize layout, spacing, colors, typography, navigation, and the page container. Edit `defaults/style.css` only when changing the generator's default design for every new site.

Header classes you will probably customize most often:

```css
.site-header {}
.site-header-inner {}
.site-brand {}
.site-brand-mark {}
.site-brand-name {}
.site-nav {}
.site-mobile-menu {}
.site-actions {}
.site-action-primary {}
```

The header brand image reuses `site/theme/favicon.svg`. Replace that file to update both the browser icon and the small mark beside the site name.

The most important wrapper is:

```css
.content-container {
  max-width: 72ch;
  margin: 0 auto;
  padding: 2rem 1rem;
}
```

## Markdown Support

The built-in parser supports the practical basics:

- Headings
- Paragraphs
- Links and images
- Bold and italic
- Inline code
- Fenced code blocks
- Ordered and unordered lists
- Blockquotes
- Horizontal rules

It is intentionally small. If you later need advanced Markdown extensions, the generator can be upgraded to use a dedicated Markdown parser.

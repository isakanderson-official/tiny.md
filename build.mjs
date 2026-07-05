#!/usr/bin/env node

import { createServer } from "node:http";
import { watch } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

const rootDir = process.cwd();
const defaultsDir = path.join(rootDir, "defaults");
const siteDir = path.join(rootDir, "site");
const contentDir = path.join(siteDir, "content");
const themeDir = path.join(siteDir, "theme");
const distDir = path.join(rootDir, "dist");
const siteConfigPath = path.join(siteDir, "site.md");

const args = new Set(process.argv.slice(2));
const shouldWatch = args.has("--watch");
const shouldServe = args.has("--serve");
const portArg = [...args].find((arg) => arg.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : 4173;

async function main() {
  await buildSite();

  if (shouldWatch) {
    watchProject(async () => {
      try {
        await buildSite();
      } catch (error) {
        console.error(error);
      }
    });
  }

  if (shouldServe) {
    serveDist(port);
  }
}

async function buildSite() {
  const site = await readSiteConfig();
  const pages = await collectPages(contentDir);

  if (pages.length === 0) {
    throw new Error("No pages found. Add site/content/index.md to create the home page.");
  }

  pages.sort((a, b) => a.urlPath.localeCompare(b.urlPath));

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const nav = pages.map((page) => ({
    label: page.title,
    href: page.urlPath,
  }));
  const headerNav = site.nav.length > 0 ? site.nav : nav;

  for (const page of pages) {
    const html = renderPage({ page, nav: headerNav, site });
    const outputDir = path.join(distDir, page.outputPath);
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "index.html"), html);
  }

  await copyContentAssets();
  await copyDefaultAssets();
  await copyThemeAssets();

  if (site.url) {
    await writeFile(path.join(distDir, "sitemap.xml"), renderSitemap(site, pages));
  }

  console.log(`Built ${pages.length} page${pages.length === 1 ? "" : "s"} into dist/`);
}

async function readSiteConfig() {
  try {
    const parsed = parseFrontmatter(await readFile(siteConfigPath, "utf8"));
    const siteName = parsed.data.name || findFirstHeading(parsed.body) || "My Site";
    return {
      name: siteName,
      description: parsed.data.description || "",
      url: normalizeSiteUrl(parsed.data.url || ""),
      image: parsed.data.image || "",
      nav: parseSectionLinks(parsed.body, "Navigation"),
      actions: parseSectionLinks(parsed.body, "Actions").map((item) => ({
        ...item,
        style: item.label.toLowerCase().includes("start") ? "primary" : "",
      })),
      footer: normalizeFooter(parsed.data.footer, siteName),
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        name: "My Site",
        description: "",
        url: "",
        image: "",
        nav: [],
        actions: [],
        footer: false,
      };
    }

    throw error;
  }
}

async function collectPages(dir, routeParts = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  const pages = [];
  const indexPath = path.join(dir, "index.md");

  if (entries.some((entry) => entry.isFile() && entry.name === "index.md")) {
    const source = await readFile(indexPath, "utf8");
    const parsed = parseFrontmatter(source);
    const route = routeParts.join("/");
    const urlPath = route ? `/${route}/` : "/";
    const outputPath = route || ".";
    const title = parsed.data.title || findFirstHeading(parsed.body) || titleFromRoute(routeParts) || "Home";
    const description = parsed.data.description || "";
    const image = parsed.data.image || "";

    pages.push({
      urlPath,
      outputPath,
      title,
      description,
      image,
      markdown: parsed.body,
    });
  }

  const childDirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  const childPages = await Promise.all(
    childDirs.map((entry) => collectPages(path.join(dir, entry.name), [...routeParts, entry.name])),
  );

  pages.push(...childPages.flat());

  return pages;
}

function parseFrontmatter(source) {
  if (!source.startsWith("---\n")) {
    return { data: {}, body: source };
  }

  const end = source.indexOf("\n---", 4);

  if (end === -1) {
    return { data: {}, body: source };
  }

  const frontmatter = source.slice(4, end).trim();
  const body = source.slice(end + 4).replace(/^\r?\n/, "");
  const data = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (match) {
      const [, key, value] = match;
      data[key] = parseFrontmatterValue(value.trim());
    }
  }

  return { data, body };
}

function parseFrontmatterValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}

function parseSectionLinks(markdown, sectionTitle) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const links = [];
  let inSection = false;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);

    if (heading) {
      inSection = plainText(heading[1]).toLowerCase() === sectionTitle.toLowerCase();
      continue;
    }

    if (!inSection) {
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      break;
    }

    const link = line.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*$/);

    if (link) {
      links.push({
        label: plainText(link[1]),
        href: link[2].trim(),
      });
    }
  }

  return links;
}

function findFirstHeading(markdown) {
  const heading = findFirstHeadingToken(marked.lexer(markdown));
  return heading ? plainText(heading.text) : "";
}

function findFirstHeadingToken(tokens) {
  for (const token of tokens) {
    if (token.type === "heading" && token.depth === 1) {
      return token;
    }

    if (Array.isArray(token.tokens)) {
      const heading = findFirstHeadingToken(token.tokens);

      if (heading) {
        return heading;
      }
    }
  }

  return null;
}

function titleFromRoute(routeParts) {
  const lastPart = routeParts.at(-1);

  if (!lastPart) {
    return "";
  }

  return lastPart
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderPage({ page, nav, site }) {
  const title = site.name && page.title !== site.name ? `${page.title} | ${site.name}` : page.title;
  const description = page.description || site.description;
  const canonical = site.url ? absoluteUrl(site.url, page.urlPath) : "";
  const image = socialImageUrl(page.image || site.image, site.url, page.urlPath);
  const defaultStylesheetPath = relativeAssetPath(page.urlPath, "/default.css");
  const stylesheetPath = relativeAssetPath(page.urlPath, "/style.css");
  const faviconPath = relativeAssetPath(page.urlPath, "/favicon.svg");
  const contentHtml = markdownToHtml(page.markdown, page.urlPath);
  const footerHtml = renderFooter(site);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ""}
  <meta name="generator" content="tiny.md">
  ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ""}
  <meta property="og:title" content="${escapeHtml(page.title)}">
  ${description ? `<meta property="og:description" content="${escapeHtml(description)}">` : ""}
  <meta property="og:site_name" content="${escapeHtml(site.name)}">
  <meta property="og:type" content="website">
  ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : ""}
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
  <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(page.title)}">
  ${description ? `<meta name="twitter:description" content="${escapeHtml(description)}">` : ""}
  ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ""}
  <link rel="icon" href="${escapeHtml(faviconPath)}" type="image/svg+xml">
  <link rel="stylesheet" href="${escapeHtml(defaultStylesheetPath)}">
  <link rel="stylesheet" href="${escapeHtml(stylesheetPath)}">
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a class="site-brand" href="${escapeHtml(relativeLink(page.urlPath, "/"))}">
        <img class="site-brand-mark" src="${escapeHtml(faviconPath)}" alt="" aria-hidden="true">
        <span class="site-brand-name">${escapeHtml(site.name)}</span>
      </a>
      <nav class="site-nav" aria-label="Main navigation">
        <ul class="site-nav-list">
          ${nav.map((item) => renderNavItem(item, page.urlPath)).join("\n          ")}
        </ul>
      </nav>
      ${
        site.actions.length > 0
          ? `<div class="site-actions">
          ${site.actions.map((item) => renderActionItem(item, page.urlPath)).join("\n          ")}
      </div>`
          : ""
      }
      ${renderMobileMenu(nav, site.actions, page.urlPath)}
    </div>
  </header>
  <main class="site-main">
    <article class="page-content">
      <div class="content-container content">
${contentHtml}
      </div>
    </article>
  </main>
  ${footerHtml}
</body>
</html>
`;
}

function renderNavItem(item, currentUrlPath) {
  const href = linkHref(item.href, currentUrlPath);
  const current = isCurrentPage(item.href, currentUrlPath) ? ' aria-current="page"' : "";
  return `<li><a href="${escapeHtml(href)}"${current}>${escapeHtml(item.label)}</a></li>`;
}

function renderActionItem(item, currentUrlPath) {
  const href = linkHref(item.href, currentUrlPath);
  const style = item.style === "primary" ? " site-action-primary" : "";
  return `<a class="site-action${style}" href="${escapeHtml(href)}">${escapeHtml(item.label)}</a>`;
}

function renderMobileMenu(nav, actions, currentUrlPath) {
  const actionLinks =
    actions.length > 0
      ? `<div class="site-mobile-actions">
          ${actions.map((item) => renderActionItem(item, currentUrlPath)).join("\n          ")}
        </div>`
      : "";

  return `<details class="site-mobile-menu">
        <summary class="site-menu-toggle" aria-label="Open navigation">
          <span class="site-menu-bar"></span>
          <span class="site-menu-bar"></span>
          <span class="site-menu-bar"></span>
        </summary>
        <div class="site-mobile-panel">
          <nav class="site-mobile-nav" aria-label="Mobile navigation">
            <ul class="site-mobile-nav-list">
              ${nav.map((item) => renderNavItem(item, currentUrlPath)).join("\n              ")}
            </ul>
          </nav>
          ${actionLinks}
        </div>
      </details>`;
}

function renderFooter(site) {
  if (!site.footer) {
    return "";
  }

  return `<footer class="site-footer">
    <div class="site-footer-inner">
      <p>${escapeHtml(site.footer)}</p>
    </div>
  </footer>`;
}

function markdownToHtml(markdown, currentUrlPath) {
  return marked.parse(markdown, {
    async: false,
    gfm: true,
    renderer: createMarkdownRenderer(currentUrlPath),
  });
}

function createMarkdownRenderer(currentUrlPath) {
  const renderer = new marked.Renderer();

  renderer.code = ({ text, lang }) => {
    const language = String(lang || "").trim();
    const className = language ? ` class="language-${escapeHtml(language)}"` : "";
    return `<pre><code${className}>${escapeHtml(text)}</code></pre>`;
  };

  renderer.link = function ({ href, title, tokens }) {
    const url = rewriteUrl(href, currentUrlPath);
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(url)}"${titleAttribute}>${this.parser.parseInline(tokens)}</a>`;
  };

  renderer.image = function ({ href, title, text, tokens }) {
    const url = rewriteUrl(href, currentUrlPath);
    const alt = tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text;
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${titleAttribute}>`;
  };

  renderer.paragraph = function (token) {
    const youtubeEmbedUrl = youtubeEmbedFromUrl(token.text.trim());

    if (youtubeEmbedUrl && token.raw.trim() === token.text.trim()) {
      return renderVideoEmbed(youtubeEmbedUrl);
    }

    return `<p>${this.parser.parseInline(token.tokens)}</p>\n`;
  };

  return renderer;
}

function youtubeEmbedFromUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v") || "";
      } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/").filter(Boolean)[1] || "";
      }
    }

    if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
      return "";
    }

    return `https://www.youtube.com/embed/${videoId}?rel=0`;
  } catch {
    return "";
  }
}

function renderVideoEmbed(embedUrl) {
  return `<div class="video-embed">
  <iframe src="${escapeHtml(embedUrl)}" title="YouTube video player" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</div>`;
}

function normalizeFooter(footer, siteName) {
  if (footer === false || footer === null || footer === undefined) {
    return false;
  }

  if (footer === true) {
    return `© ${new Date().getFullYear()} ${siteName}`;
  }

  const text = String(footer).trim();
  return text || false;
}

function linkHref(href, currentUrlPath) {
  const internal = internalRootLink(href);
  return internal ? relativeLink(currentUrlPath, internal.path) + internal.suffix : href;
}

function isCurrentPage(href, currentUrlPath) {
  return internalRootLink(href)?.path === currentUrlPath;
}

function internalRootLink(href) {
  if (isExternalLikeHref(href)) {
    return null;
  }

  const [pathPart, suffix = ""] = splitUrlSuffix(href);
  return pathPart.startsWith("/") ? { path: normalizeInternalPath(pathPart), suffix } : null;
}

function isExternalLikeHref(href) {
  return (
    /^(https?:)?\/\//.test(href) ||
    /^(mailto|tel):/.test(href) ||
    href.startsWith("#") ||
    href.startsWith("data:")
  );
}

function rewriteUrl(url, currentUrlPath) {
  const trimmed = url.trim();

  if (isExternalLikeHref(trimmed)) {
    return trimmed;
  }

  const [pathPart, suffix = ""] = splitUrlSuffix(trimmed);

  if (isAssetPath(pathPart)) {
    return trimmed;
  }

  if (pathPart.startsWith("/")) {
    return normalizeInternalPath(pathPart) + suffix;
  }

  const currentDir = currentUrlPath === "/" ? "/" : currentUrlPath;
  const absolutePath = normalizePathname(path.posix.join(currentDir, pathPart));
  return relativeLink(currentUrlPath, normalizeInternalPath(absolutePath)) + suffix;
}

function splitUrlSuffix(url) {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const indexes = [hashIndex, queryIndex].filter((index) => index >= 0);

  if (indexes.length === 0) {
    return [url, ""];
  }

  const suffixStart = Math.min(...indexes);
  return [url.slice(0, suffixStart), url.slice(suffixStart)];
}

function isAssetPath(urlPath) {
  return /\.[A-Za-z0-9]+$/.test(urlPath);
}

function normalizeInternalPath(urlPath) {
  const normalized = normalizePathname(urlPath);
  return normalized === "/" ? "/" : `${normalized.replace(/\/$/, "")}/`;
}

function normalizePathname(urlPath) {
  const normalized = path.posix.normalize(`/${urlPath}`).replace(/\/+/g, "/");
  return normalized === "/." ? "/" : normalized;
}

function relativeAssetPath(fromUrlPath, assetUrlPath) {
  const toOutputPath = assetUrlPath.replace(/^\/+/, "");
  return dotRelative(fromUrlPath, toOutputPath);
}

function relativeLink(fromUrlPath, toUrlPath) {
  if (toUrlPath === fromUrlPath) {
    return ".";
  }

  const toOutputPath = toUrlPath === "/" ? "./" : `${toUrlPath.replace(/^\/|\/$/g, "")}/`;
  let relative = path.posix.relative(outputDirFromUrl(fromUrlPath), toOutputPath) || ".";

  if (relative === "..") {
    relative = "../";
  } else if (toUrlPath !== "/" && relative !== "." && !relative.endsWith("/")) {
    relative = `${relative}/`;
  }

  return dotPrefix(relative);
}

function dotRelative(fromUrlPath, toOutputPath) {
  return dotPrefix(path.posix.relative(outputDirFromUrl(fromUrlPath), toOutputPath) || ".");
}

function outputDirFromUrl(urlPath) {
  return urlPath.replace(/^\//, "");
}

function dotPrefix(relativePath) {
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function renderSitemap(site, pages) {
  const urls = pages
    .map((page) => `  <url>\n    <loc>${escapeXml(absoluteUrl(site.url, page.urlPath))}</loc>\n  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function socialImageUrl(image, siteUrl, currentUrlPath) {
  const trimmed = String(image || "").trim();

  if (!trimmed || /^(https?:)?\/\//.test(trimmed)) {
    return trimmed;
  }

  if (!siteUrl) {
    return "";
  }

  const [pathPart, suffix = ""] = splitUrlSuffix(trimmed);

  if (pathPart.startsWith("/")) {
    return absoluteUrl(siteUrl, normalizePathname(pathPart)) + suffix;
  }

  const currentDir = currentUrlPath === "/" ? "/" : currentUrlPath;
  return absoluteUrl(siteUrl, normalizePathname(path.posix.join(currentDir, pathPart))) + suffix;
}

async function copyThemeAssets() {
  try {
    await cp(themeDir, distDir, { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function copyDefaultAssets() {
  await cp(path.join(defaultsDir, "style.css"), path.join(distDir, "default.css"));
}

async function copyContentAssets(dir = contentDir, routeParts = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  const outputDir = path.join(distDir, routeParts.join("/") || ".");

  for (const entry of entries) {
    const inputPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      await copyContentAssets(inputPath, [...routeParts, entry.name]);
      continue;
    }

    if (!entry.isFile() || !isContentAsset(entry.name)) {
      continue;
    }

    await mkdir(outputDir, { recursive: true });
    await cp(inputPath, path.join(outputDir, entry.name));
  }
}

function isContentAsset(fileName) {
  return !fileName.startsWith(".") && !/\.md$/i.test(fileName);
}

function watchProject(onChange) {
  let timer;

  for (const dir of [siteDir]) {
    try {
      watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename || String(filename).startsWith("dist")) {
          return;
        }

        clearTimeout(timer);
        timer = setTimeout(onChange, 100);
      });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  console.log("Watching site/");
}

function serveDist(serverPort) {
  const host = "127.0.0.1";
  const server = createServer(async (request, response) => {
    const requestedUrl = new URL(request.url, `http://${host}:${serverPort}`);
    const pathname = decodeURIComponent(requestedUrl.pathname);
    const filePath = await resolveFilePath(pathname);

    if (!filePath) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": contentType(filePath) });
    response.end(body);
  });

  server.on("error", (error) => {
    console.error(`Could not start dev server on http://${host}:${serverPort}`);
    console.error(error);
    process.exitCode = 1;
  });

  server.listen(serverPort, host, () => {
    console.log(`Serving dist/ at http://${host}:${serverPort}`);
  });
}

async function resolveFilePath(urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(distDir, safePath);
  const fileStat = await statIfExists(fullPath);

  if (fileStat?.isDirectory()) {
    return path.join(fullPath, "index.html");
  }

  if (fileStat) {
    return fullPath;
  }

  const htmlPath = path.join(fullPath, "index.html");
  return (await statIfExists(htmlPath)) ? htmlPath : "";
}

async function statIfExists(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function contentType(filePath) {
  const extension = path.extname(filePath);

  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".xml": "application/xml; charset=utf-8",
  }[extension] || "application/octet-stream";
}

function normalizeSiteUrl(url) {
  return url.replace(/\/+$/, "");
}

function absoluteUrl(siteUrl, urlPath) {
  return `${normalizeSiteUrl(siteUrl)}${urlPath}`;
}

function plainText(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_]/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

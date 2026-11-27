/** Builds the root user site: project index, sitemap index, robots.txt and llms.txt. */
import { mkdir, writeFile, cp, readFile } from "node:fs/promises";

const OWNER = "halitsever";
const ORIGIN = "https://projects.halit.org";
const OUT = new URL("../_site/", import.meta.url);
const token = process.env.GITHUB_TOKEN;

async function listRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/users/${OWNER}/repos?per_page=100&page=${page}`, {
      headers: { Accept: "application/vnd.github+json", ...(token && { Authorization: `Bearer ${token}` }) },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) return repos;
  }
}

/** A project with its own custom domain answers this host's path with a redirect, and those sites live outside this host's sitemap. */
async function probe(repo) {
  const home = `${ORIGIN}/${repo.name}/`;
  const res = await fetch(home, { redirect: "manual" });
  if (res.status !== 200) return null;
  const sm = await fetch(`${home}sitemap.xml`, { redirect: "manual" });
  const body = sm.status === 200 ? await sm.text() : "";
  const hasSitemap = /<(urlset|sitemapindex)\b/.test(body);
  const pages = /<urlset\b/.test(body) ? [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]) : [home];
  return { ...repo, home, pages, sitemap: hasSitemap ? `${home}sitemap.xml` : null };
}

/** Social cards come from GraphQL because the REST repo payload has no Open Graph image. */
async function socialCards() {
  if (!token) return new Map();
  const query = `{ user(login: "${OWNER}") { repositories(first: 100, privacy: PUBLIC, ownerAffiliations: OWNER) { nodes { name usesCustomOpenGraphImage openGraphImageUrl } } } }`;
  const res = await fetch("https://api.github.com/graphql", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ query }) });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
  const nodes = (await res.json()).data.user.repositories.nodes;
  return new Map(nodes.filter((n) => n.usesCustomOpenGraphImage).map((n) => [n.name, n.openGraphImageUrl]));
}

async function downloadCards(repos, cards) {
  await mkdir(new URL("cards/", OUT), { recursive: true });
  await Promise.all(
    repos.map(async (r) => {
      const url = cards.get(r.name);
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) return;
      await writeFile(new URL(`cards/${r.name}.png`, OUT), Buffer.from(await res.arrayBuffer()));
      r.card = `/cards/${r.name}.png`;
    }),
  );
}

/** Stable tilt per project, so the wall looks hand-pinned but does not reshuffle on every build. */
function tilt(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (((h >>> 0) % 50) / 10 - 2.5).toFixed(1);
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function sitemapIndex(sites, today) {
  const entries = [`${ORIGIN}/sitemap-pages.xml`, ...sites.filter((s) => s.sitemap).map((s) => s.sitemap)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((loc) => `  <sitemap><loc>${esc(loc)}</loc><lastmod>${today}</lastmod></sitemap>`).join("\n")}
</sitemapindex>
`;
}

function sitemapPages(sites) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${ORIGIN}/`, lastmod: today },
    { loc: `${ORIGIN}/sitemap.html`, lastmod: today },
  ];
  for (const s of sites.filter((s) => !s.sitemap)) urls.push({ loc: s.home, lastmod: s.pushed_at.slice(0, 10) });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n")}
</urlset>
`;
}

function robots() {
  return `User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
`;
}

function llms(sites, others) {
  const line = (r, url) => `- [${r.name}](${url}): ${r.description ?? ""}`.trimEnd();
  return `# Halit Sever

> Open source projects by Halit Sever: Node.js and TypeScript libraries, NestJS and Nuxt modules, macOS apps and Claude Code tooling.

## Project sites

${sites.map((s) => line(s, s.home)).join("\n")}

## Other repositories

${others.map((r) => line(r, r.html_url)).join("\n")}

## Optional

- [GitHub profile](https://github.com/${OWNER})
- [Personal site](https://www.halit.org/)
`;
}

function tile(r, url, i) {
  const meta = [r.language, r.stargazers_count ? `${r.stargazers_count} ${r.stargazers_count === 1 ? "star" : "stars"}` : null].filter(Boolean).join(", ");
  const art = r.card
    ? `<img src="${r.card}" alt="" width="1280" height="640" loading="${i < 6 ? "eager" : "lazy"}" decoding="async">`
    : `<span class="blank">${esc(r.name)}</span>`;
  return `<li style="--tilt:${tilt(r.name)}deg;--i:${i}"><a href="${esc(url)}"><span class="art">${art}</span><span class="name">${esc(r.name)}</span><span class="desc">${esc(r.description)}</span>${meta ? `<span class="meta">${esc(meta)}</span>` : ""}</a></li>`;
}

/** The five most starred cards, fanned out next to the intro like a hand of cards. */
function pile(repos) {
  const top = [...repos]
    .filter((r) => r.card)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5)
    .reverse();
  const items = top.map(
    (r, i) =>
      `<a href="${esc(r.home ?? r.html_url)}" style="--n:${i - (top.length - 1) / 2}" aria-label="${esc(r.name)}"><img src="${r.card}" alt="" width="1280" height="640"></a>`,
  );
  return `<div class="pile">${items.join("")}</div>`;
}

function head({ title, description, path }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${ORIGIN}${path}">
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${ORIGIN}${path}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;600;800&display=swap">
<link rel="stylesheet" href="/site.css">
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "dd7e54d3f48841c187d72d9dbb92a6b6"}'></script>`;
}

/** Page paths read better than full URLs once the project is named above them. */
function pagePath(url, home) {
  const rest = url.startsWith(home) ? url.slice(home.length) : url;
  return rest.replace(/\.html$/, "").replace(/\/$/, "") || "Home";
}

function sitemapHtml(sites, others) {
  const title = "Sitemap: every page of Halit Sever's projects";
  const description = "Every page across Halit Sever's open source project sites, grouped by project.";
  const total = sites.reduce((n, s) => n + s.pages.length, 0);
  const block = (s, i) => `<li class="project" style="--tilt:${tilt(s.name)}deg;--i:${i}">
<a class="thumb" href="${esc(s.home)}" aria-label="${esc(s.name)}">${s.card ? `<img src="${s.card}" alt="" width="1280" height="640" loading="lazy" decoding="async">` : `<span class="blank">${esc(s.name)}</span>`}</a>
<div><h3><a href="${esc(s.home)}">${esc(s.name)}</a></h3><p class="desc">${esc(s.description)}</p>
<ul class="pages">${[...s.pages]
    .sort((a, b) => (b === s.home) - (a === s.home))
    .map((u) => `<li><a href="${esc(u)}">${esc(pagePath(u, s.home))}</a></li>`)
    .join("")}</ul></div></li>`;
  return `<!doctype html>
<html lang="en">
<head>
${head({ title, description, path: "/sitemap.html" })}
</head>
<body>
<header class="intro">
<a href="/"><img class="logo" src="/logo.svg" alt="All projects" width="88" height="88"></a>
<h1>Sitemap</h1>
<p>${total} pages across ${sites.length} project sites, grouped by project. Search engines read the same list from <a href="/sitemap.xml">sitemap.xml</a>.</p>
<nav><a href="/">All projects</a><a href="https://github.com/${OWNER}">GitHub</a></nav>
</header>
<main>
<section>
<h2>Project sites</h2>
<ol class="map">${sites.map(block).join("")}</ol>
</section>
<section>
<h2>Repositories without a site</h2>
<ul class="pages cols">${others.map((r) => `<li><a href="${esc(r.html_url)}">${esc(r.name)}</a></li>`).join("")}</ul>
</section>
</main>
<footer>Rebuilt from the GitHub API every Monday.</footer>
</body>
</html>
`;
}

function indexHtml(sites, others) {
  const title = "Halit Sever: open source projects";
  const description = "Open source projects by Halit Sever: Node.js and TypeScript libraries, NestJS and Nuxt modules, macOS apps and Claude Code tooling.";
  const all = [...sites, ...others];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: `${ORIGIN}/`,
    description,
    author: { "@type": "Person", name: "Halit Sever", url: "https://www.halit.org/", sameAs: [`https://github.com/${OWNER}`] },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: all.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: r.home ?? r.html_url, name: r.name })),
    },
  };
  return `<!doctype html>
<html lang="en">
<head>
${head({ title, description, path: "/" })}
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
</head>
<body>
<header class="intro">
<img class="logo" src="/logo.svg" alt="" width="88" height="88">
<h1>Halit Sever</h1>
<div class="intro-body">
<div>
<p>I build open source tools: Node.js and TypeScript libraries, NestJS and Nuxt modules, macOS apps and tools for Claude Code. Every card below is a project you can use today.</p>
<nav><a href="https://github.com/${OWNER}">GitHub</a><a href="https://www.halit.org/">halit.org</a><a href="/sitemap.html">Sitemap</a></nav>
</div>
${pile(all)}
</div>
</header>
<main>
<section>
<h2>Projects with a website</h2>
<ol class="wall">${sites.map((s, i) => tile(s, s.home, i)).join("")}</ol>
</section>
<section>
<h2>More on GitHub</h2>
<ol class="wall">${others.map((r, i) => tile(r, r.html_url, sites.length + i)).join("")}</ol>
</section>
</main>
<footer>This page and its sitemap are rebuilt from the GitHub API every Monday.</footer>
</body>
</html>
`;
}

const repos = (await listRepos()).filter((r) => !r.private && !r.fork && !r.archived && r.name !== `${OWNER}.github.io` && r.name !== OWNER);
const byStars = (a, b) => b.stargazers_count - a.stargazers_count || a.name.localeCompare(b.name);
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/:\s+/g, ":")
    .replace(/;}/g, "}")
    .trim();
}

const sites = (await Promise.all(repos.filter((r) => r.has_pages).map(probe))).filter(Boolean).sort(byStars);
const siteNames = new Set(sites.map((s) => s.name));
const others = repos.filter((r) => !siteNames.has(r.name)).sort(byStars);
const today = new Date().toISOString().slice(0, 10);

await mkdir(OUT, { recursive: true });
// Static files (social card, search console verification) are served as-is.
await cp(new URL("../public/", import.meta.url), OUT, { recursive: true });
// The source stays readable; the served copy drops comments and whitespace so pages download less.
const cssUrl = new URL("site.css", OUT);
await writeFile(cssUrl, minifyCss(await readFile(cssUrl, "utf8")));
await downloadCards([...sites, ...others], await socialCards());
await Promise.all([
  writeFile(new URL("index.html", OUT), indexHtml(sites, others)),
  writeFile(new URL("sitemap.xml", OUT), sitemapIndex(sites, today)),
  writeFile(new URL("sitemap-pages.xml", OUT), sitemapPages(sites)),
  writeFile(new URL("robots.txt", OUT), robots()),
  writeFile(new URL("llms.txt", OUT), llms(sites, others)),
  writeFile(new URL(".nojekyll", OUT), ""),
  writeFile(new URL("sitemap.html", OUT), sitemapHtml(sites, others)),
]);
console.log(`${sites.length} project sites (${sites.filter((s) => s.sitemap).length} with sitemaps), ${others.length} other repos`);

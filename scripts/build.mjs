/** Builds the root user site: project index, sitemap index, robots.txt and llms.txt. */
import { mkdir, writeFile, cp } from "node:fs/promises";

const OWNER = "halitsever";
const ORIGIN = `https://${OWNER}.github.io`;
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

/** A custom domain answers the github.io path with a redirect, and those sites live outside this host's sitemap. */
async function probe(repo) {
  const home = `${ORIGIN}/${repo.name}/`;
  const res = await fetch(home, { redirect: "manual" });
  if (res.status !== 200) return null;
  const sm = await fetch(`${home}sitemap.xml`, { redirect: "manual" });
  const body = sm.status === 200 ? await sm.text() : "";
  const hasSitemap = /<(urlset|sitemapindex)\b/.test(body);
  return { ...repo, home, sitemap: hasSitemap ? `${home}sitemap.xml` : null };
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
  const urls = [{ loc: `${ORIGIN}/`, lastmod: new Date().toISOString().slice(0, 10) }];
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

function card(r, url) {
  const meta = [r.language, r.stargazers_count ? `${r.stargazers_count} stars` : null].filter(Boolean).join(" / ");
  return `<li><a href="${esc(url)}"><span class="name">${esc(r.name)}</span><span class="desc">${esc(r.description)}</span><span class="meta">${esc(meta)}</span></a></li>`;
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
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${ORIGIN}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${ORIGIN}/">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
<style>
:root{color-scheme:light dark;--bg:#ffffff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--card:#f6f8fa;--accent:#0969da}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#30363d;--card:#151b23;--accent:#4493f8}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:56px 16px 72px}
h1{font-size:2rem;margin:0 0 8px;letter-spacing:-.02em}
h2{font-size:1rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:48px 0 16px}
.lead{color:var(--muted);margin:0 0 8px;max-width:640px}
.links a{color:var(--accent);margin-right:16px;text-decoration:none}
ul{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
li a{display:flex;flex-direction:column;gap:6px;height:100%;padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:inherit;text-decoration:none}
li a:hover{border-color:var(--accent)}
.name{font-weight:600;color:var(--accent);word-break:break-word}
.desc{color:var(--fg);font-size:.95rem}
.meta{color:var(--muted);font-size:.85rem;margin-top:auto}
</style>
</head>
<body>
<main>
<h1>Halit Sever</h1>
<p class="lead">${esc(description)}</p>
<p class="links"><a href="https://github.com/${OWNER}">GitHub</a><a href="https://www.halit.org/">halit.org</a></p>
<h2>Project sites</h2>
<ul>${sites.map((s) => card(s, s.home)).join("")}</ul>
<h2>Other repositories</h2>
<ul>${others.map((r) => card(r, r.html_url)).join("")}</ul>
</main>
</body>
</html>
`;
}

const repos = (await listRepos()).filter((r) => !r.private && !r.fork && !r.archived && r.name !== `${OWNER}.github.io` && r.name !== OWNER);
const byStars = (a, b) => b.stargazers_count - a.stargazers_count || a.name.localeCompare(b.name);
const sites = (await Promise.all(repos.filter((r) => r.has_pages).map(probe))).filter(Boolean).sort(byStars);
const siteNames = new Set(sites.map((s) => s.name));
const others = repos.filter((r) => !siteNames.has(r.name)).sort(byStars);
const today = new Date().toISOString().slice(0, 10);

await mkdir(OUT, { recursive: true });
// Static files (social card, search console verification) are served as-is.
await cp(new URL("../public/", import.meta.url), OUT, { recursive: true });
await Promise.all([
  writeFile(new URL("index.html", OUT), indexHtml(sites, others)),
  writeFile(new URL("sitemap.xml", OUT), sitemapIndex(sites, today)),
  writeFile(new URL("sitemap-pages.xml", OUT), sitemapPages(sites)),
  writeFile(new URL("robots.txt", OUT), robots()),
  writeFile(new URL("llms.txt", OUT), llms(sites, others)),
  writeFile(new URL(".nojekyll", OUT), ""),
]);
console.log(`${sites.length} project sites (${sites.filter((s) => s.sitemap).length} with sitemaps), ${others.length} other repos`);

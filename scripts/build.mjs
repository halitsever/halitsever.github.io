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

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Shelves group the projects by what a visitor wants, read from each repo's GitHub topics. */
const SHELVES = [
  { id: "claude", name: "Claude Code", topics: ["claude-code", "claude"] },
  { id: "mac", name: "Mac apps", topics: ["macos-app", "macos", "mac-app"] },
  { id: "self-hosted", name: "Self-hosted", topics: ["self-hosted"] },
  { id: "libraries", name: "Libraries", topics: ["npm-package", "nodejs-library", "nestjs-module", "nuxt-module", "vue3-component", "api-wrapper"] },
  { id: "turkey", name: "Türkiye", topics: ["turkey", "uyap", "e-devlet", "general-mobile"] },
  { id: "android", name: "Android", topics: ["android"] },
];

/** Real tasks typed into the search on load; each one filters to the project that does it. */
const TASKS = [
  { text: "Run Claude Code on a VPS", q: "claude code vps" },
  { text: "Record my Mac screen with auto zoom", q: "screen recorder" },
  { text: "Watch videos with friends in sync", q: "watch together" },
  { text: "Run several Claude Code agents at once", q: "parallel agents" },
  { text: "Export JSON to Excel in Vue", q: "json excel" },
  { text: "Add a captcha to a NestJS API", q: "turnstile" },
  { text: "Make my Mac keyboard sound mechanical", q: "keyboard sound" },
  { text: "Get an alert before a domain expires", q: "domain expiry" },
  { text: "Screenshot a website from Node.js", q: "screenshot api" },
  { text: "Browse through my own web proxy", q: "web proxy" },
];

/** Chrome Web Store figures for Watchbear, checked by hand because the store has no public API. */
const WATCHBEAR = { rating: "4.8", ratings: 59, store: "https://chromewebstore.google.com/detail/watchbear-watch-together/ldegfikaldilbcpgmiopdnnhpkpcnepn" };

/** The hero screen, in 3x3 reading order. Media lives in public/hero/ at 1280x800 so a zoomed tile fills the screen exactly. */
const SHOWCASE = [
  { repo: "claudegrid", name: "claudegrid", line: "Opens a grid of Claude Code agents in one terminal window.", fact: "A prompt, model and worktree for each pane, on Linux and macOS." },
  { repo: "explain-to-customer", name: "explain-to-customer", line: "Turns a code change into a short video your client understands.", fact: "A Claude Code skill. The video on this screen is its demo.", video: true },
  { repo: "supadomain", name: "Supadomain", line: "Warns you on Slack before a domain expires.", fact: "Self-hosted. It reads expiry dates over RDAP." },
  { repo: "girici-web-proxy", name: "Girici", line: "Lets you browse any site through a proxy on your own server.", fact: "Self-hosted from a Docker image." },
  { repo: "watchbear", name: "Watchbear", line: "Lets you watch YouTube with friends in sync, with live chat and reactions.", fact: `Rated ${WATCHBEAR.rating} out of 5 by ${WATCHBEAR.ratings} people on the Chrome Web Store.` },
  { repo: "haltos", name: "HaltOS", line: "Turns an Ubuntu VPS into a desktop for Claude Code.", fact: "One command installs it. You reach it over RDP.", video: true },
  { repo: "keycream", name: "KeyCream", line: "Makes your Mac keyboard sound mechanical.", fact: "Seven sound packs recorded from real keyboards." },
  { repo: "avora-screen-recorder", name: "Avora", line: "Records your Mac screen and zooms in where you click.", fact: "Free and open source, built with Swift. This screen moves the same way." },
  { repo: "shotscreen", name: "Shotscreen", line: "Takes clean website screenshots on your Mac.", fact: "Viewport presets, full-page capture and dark mode." },
];

/** Tour order: Watchbear in the middle first, then around the screen. */
const TOUR = [4, 1, 7, 5, 0, 3, 2, 8, 6];

function camera(all, stars) {
  const byName = new Map(all.map((r) => [r.name, r]));
  const shows = SHOWCASE.map((s) => {
    const r = byName.get(s.repo);
    const url = r ? (r.home ?? (r.homepage || r.html_url)) : `https://github.com/${OWNER}/${s.repo}`;
    const starLine = r?.stargazers_count >= 10 ? ` ${r.stargazers_count} stars on GitHub.` : "";
    return { ...s, url, fact: s.fact + starLine };
  });
  const avora = shows.find((s) => s.repo === "avora-screen-recorder");
  const media = (s, i) =>
    s.video
      ? `<video src="/hero/${s.repo}.mp4" poster="/hero/${s.repo}.webp" muted loop playsinline preload="none" aria-hidden="true"></video>`
      : `<img src="/hero/${s.repo}.webp" alt="" width="1280" height="800" decoding="async"${i === 4 ? ' fetchpriority="high"' : ""}>`;
  const tiles = shows.map((s, i) => `<a class="cam-tile" href="${esc(s.url)}" data-i="${i}" aria-label="${esc(s.name)}">${media(s, i)}</a>`).join("");
  const now = shows
    .map((s, i) => `<div class="cam-show" data-i="${i}" hidden><p class="cam-name">${esc(s.name)}</p><p class="cam-line">${esc(s.line)}</p><p class="cam-fact">${esc(s.fact)}</p><a class="cam-go" href="${esc(s.url)}">Open ${esc(s.name)}</a></div>`)
    .join("");
  return `<section class="cam" aria-labelledby="cam-title" data-tour="${TOUR.join(",")}">
<div class="cam-intro">
<h1 id="cam-title"><a href="https://www.halit.org/">Halit Sever</a> turns everyday problems into products you can use today.</h1>
<p class="cam-proof">${all.length} open source projects with ${stars.toLocaleString("en")} stars on GitHub. <a href="https://watchbear.net/">Watchbear</a>, his watch-together extension, is rated ${WATCHBEAR.rating} out of 5 by ${WATCHBEAR.ratings} people on the <a href="${WATCHBEAR.store}">Chrome Web Store</a>.</p>
</div>
<div class="cam-stage">
<div class="cam-screen">
<div class="cam-sheet">${tiles}</div>
<span class="cam-ring" aria-hidden="true"></span>
<svg class="cam-cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2.5 19.5 12l-6.6 1.5L9.4 20z" fill="#fff" stroke="#07080b" stroke-width="1.4" stroke-linejoin="round"/></svg>
</div>
<div class="cam-bar">
<p>This screen moves like an <a href="${esc(avora.url)}">Avora</a> recording: it zooms in where the cursor clicks.</p>
<button type="button" class="cam-play" hidden><svg class="i-pause" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zM9 3h3v10H9z"/></svg><svg class="i-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11L13.5 8z"/></svg><span>Pause tour</span></button>
</div>
</div>
<div class="cam-now">
<p class="cam-hint" data-i="-1">Nine of his products are on this screen. Pick one to zoom in, pick it again to zoom out.</p>
${now}
</div>
</section>`;
}

function shelvesOf(r) {
  const topics = new Set(r.topics ?? []);
  return SHELVES.filter((s) => s.topics.some((t) => topics.has(t))).map((s) => s.id);
}

/** Lowercased, accent-folded text the client-side search matches against. */
function searchText(r) {
  const shelfNames = shelvesOf(r).map((id) => SHELVES.find((s) => s.id === id).name);
  return [r.name.replace(/-/g, " "), r.description, ...(r.topics ?? []).map((t) => t.replace(/-/g, " ")), r.language, ...shelfNames]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Initials stand in for a missing social card, set large so a card never looks empty. */
function initials(name) {
  return name
    .split("-")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function card(r, i) {
  const url = r.home ?? (r.homepage || r.html_url);
  const where = r.home ? null : r.homepage ? new URL(r.homepage).hostname : "GitHub";
  const meta = [r.language, r.stargazers_count ? `${r.stargazers_count} ${r.stargazers_count === 1 ? "star" : "stars"}` : null, where && `on ${where}`]
    .filter(Boolean)
    .join(", ");
  const art = r.card
    ? `<img src="${r.card}" alt="" width="1280" height="640" loading="${i < 6 ? "eager" : "lazy"}" decoding="async">`
    : `<span class="blank" aria-hidden="true">${esc(initials(r.name))}</span>`;
  return `<li class="card" data-search="${esc(searchText(r))}" data-shelves="${shelvesOf(r).join(" ")}" style="view-transition-name:p-${esc(r.name)}">
<a href="${esc(url)}"><span class="art">${art}</span><span class="text"><span class="name">${esc(r.name)}</span><span class="desc">${esc(r.description)}</span>${meta ? `<span class="meta">${esc(meta)}</span>` : ""}</span></a></li>`;
}

function head({ title, description, path }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${ORIGIN}${path}">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#07080b">
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&family=Geist:wght@400..700&display=swap">
<link rel="stylesheet" href="/site.css">
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "dd7e54d3f48841c187d72d9dbb92a6b6"}'></script>`;
}

/** The signature is Mr De Haviland outlined to paths, so the header loads no script font. */
const signature = (await readFile(new URL("../public/signature.svg", import.meta.url), "utf8"))
  .trim()
  .replace('<svg xmlns="http://www.w3.org/2000/svg"', '<svg class="signature" aria-hidden="true"');

const topbar = `<header class="bar">
<a class="brand" href="/" aria-label="Halit Sever Projects">${signature}<span>Projects</span></a>
<nav><a class="home" href="https://www.halit.org/">halit.org</a><a href="https://github.com/${OWNER}">GitHub</a><a href="/sitemap.html">Sitemap</a></nav>
</header>`;

/** Page paths read better than full URLs once the project is named above them. */
function pagePath(url, home) {
  const rest = url.startsWith(home) ? url.slice(home.length) : url;
  return rest.replace(/\.html$/, "").replace(/\/$/, "") || "Home";
}

function sitemapHtml(sites, others) {
  const title = "Sitemap: every page of Halit Sever's projects";
  const description = "Every page across Halit Sever's open source project sites, grouped by project.";
  const total = sites.reduce((n, s) => n + s.pages.length, 0);
  const block = (s) => `<li class="project">
<a class="thumb" href="${esc(s.home)}" aria-label="${esc(s.name)}">${s.card ? `<img src="${s.card}" alt="" width="1280" height="640" loading="lazy" decoding="async">` : `<span class="blank" aria-hidden="true">${esc(initials(s.name))}</span>`}</a>
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
<body class="sitemap">
${topbar}
<main>
<section class="lede">
<h1>Sitemap</h1>
<p>${total} pages across ${sites.length} project sites, grouped by project. Search engines read the same list from <a href="/sitemap.xml">sitemap.xml</a>.</p>
</section>
<ol class="map">${sites.map(block).join("")}</ol>
<section class="rest">
<h2>Repositories without a site here</h2>
<ul class="pages cols">${others.map((r) => `<li><a href="${esc(r.homepage || r.html_url)}">${esc(r.name)}</a></li>`).join("")}</ul>
</section>
</main>
<footer>Rebuilt from the GitHub API every Monday and on every change. Made by <a href="https://www.halit.org/">Halit Sever</a>.</footer>
</body>
</html>
`;
}

function indexHtml(sites, others) {
  const title = "Halit Sever: open source projects";
  const description = "Open source projects by Halit Sever: Node.js and TypeScript libraries, NestJS and Nuxt modules, macOS apps and Claude Code tooling.";
  /** One list ordered by GitHub stars, whether or not a project has a site here. */
  const all = [...sites, ...others].sort(byStars);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: `${ORIGIN}/`,
    description,
    author: { "@type": "Person", name: "Halit Sever", url: "https://www.halit.org/", sameAs: [`https://github.com/${OWNER}`] },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: all.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: r.home ?? (r.homepage || r.html_url), name: r.name })),
    },
  };
  const stars = all.reduce((n, r) => n + r.stargazers_count, 0);
  const counts = Object.fromEntries(SHELVES.map((s) => [s.id, all.filter((r) => shelvesOf(r).includes(s.id)).length]));
  const chips = [`<button type="button" class="chip" aria-pressed="true" data-shelf="">All <span>${all.length}</span></button>`]
    .concat(
      SHELVES.filter((s) => counts[s.id]).map(
        (s) => `<button type="button" class="chip" aria-pressed="false" data-shelf="${s.id}">${esc(s.name)} <span>${counts[s.id]}</span></button>`,
      ),
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
${head({ title, description, path: "/" })}
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
<script defer src="/app.js"></script>
</head>
<body>
${topbar}
<main class="home">
${camera(all, stars)}
<section class="finder">
<form class="ask" role="search" action="#cards">
<label for="q">What do you need?</label>
<div class="field">
<input id="q" name="q" type="search" autocomplete="off" placeholder="Search ${all.length} projects" data-tasks='${esc(JSON.stringify(TASKS))}'>
<button type="submit">Search</button>
</div>
<div class="chips" role="group" aria-label="Filter by shelf">${chips}</div>
<p class="status" role="status" aria-live="polite"></p>
</form>
</section>
<ol class="cards" id="cards">${all.map((r, i) => card(r, i)).join("")}</ol>
<p class="empty" hidden>Nothing matches that yet. Try a shorter word, or <a href="https://github.com/${OWNER}?tab=repositories">browse every repository on GitHub</a>.</p>
</main>
<footer>This page and its sitemap are rebuilt from the GitHub API every Monday and on every change. Made by <a href="https://www.halit.org/">Halit Sever</a>.</footer>
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

# halitsever.github.io

Root GitHub Pages user site, served at `projects.halit.org` (custom domain; `halitsever.github.io` 301-redirects there). It sits above every project site at `projects.halit.org/<repo>/`, so its `robots.txt` and `sitemap.xml` are the only ones crawlers read for the whole host.

## How it works

- `scripts/build.mjs` builds everything in `_site/` from the GitHub API at deploy time. The repo holds no generated pages, so change the script, not the output.
- The Pages workflow deploys on push to `main`, every Monday, and on manual dispatch. Pages is set to build from Actions, not from a branch.
- A project is listed when its repo is public, not a fork, not archived, and has Pages on. A site that redirects (custom domain, such as watchbear) is listed under other repositories and kept out of the sitemap, because a sitemap index only covers this host.
- Each project's social card is fetched through GraphQL (`openGraphImageUrl`) and saved to `_site/cards/`, so the token must be set for the project cards to have images. `public/site.css` styles both `index.html` and `sitemap.html`.
- The hero screen shows the products in `SHOWCASE` (`scripts/build.mjs`). Each one has a 1280x800 file in `public/hero/` named after its repo (a `.webp`, plus an `.mp4` for video tiles), so a zoomed tile fills the screen exactly.
- `sitemap.html` lists every `<loc>` from each project sitemap. `sitemap.xml` stays plain XML: Chrome is removing XSLT, so there is no stylesheet on it.
- After each deploy, `scripts/indexnow.mjs` sends every URL from the live sitemaps to IndexNow (Bing, Yandex and others). The key file in `public/` must keep the same name as `KEY` in that script.
- A project site's own `sitemap.xml` goes into the sitemap index when it serves a `urlset` or `sitemapindex`; otherwise its home page goes into `sitemap-pages.xml`.

## Verify a change

```sh
GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs
```

Check the summary line it prints, then open `_site/index.html` and read `_site/sitemap.xml`. The script uses Node 22 built-ins only; keep it dependency-free.

## Conventions

- Conventional-commit subject lines only, in English, with no body or trailer.
- No emoji in new text. Code comments are one short line that explains why.
- The README follows the owner's template. Every image served from `halitsever-api.vercel.app` stays byte-for-byte.
- `public/og.png` is the social card, rendered at 1280x640.

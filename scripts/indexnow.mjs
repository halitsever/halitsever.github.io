/** Tells IndexNow engines (Bing, Yandex, Seznam, Naver) about every URL in the live sitemaps after a deploy. */
const ORIGIN = "https://projects.halit.org";
const KEY = "2b1d715c44feafa35b073821532cd0ff";

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

async function text(url) {
  const res = await fetch(url);
  return res.ok ? res.text() : "";
}

async function collect(url, seen = new Set()) {
  if (seen.has(url)) return [];
  seen.add(url);
  const xml = await text(url);
  if (/<sitemapindex\b/.test(xml)) return (await Promise.all(locs(xml).map((u) => collect(u, seen)))).flat();
  return locs(xml);
}

// IndexNow only accepts URLs on the host that serves the key file.
const urls = [...new Set(await collect(`${ORIGIN}/sitemap.xml`))].filter((u) => u.startsWith(`${ORIGIN}/`));
if (urls.length === 0) throw new Error("no URLs found in the live sitemaps");

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: "projects.halit.org", key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`, urlList: urls.slice(0, 10000) }),
});
console.log(`IndexNow: ${urls.length} URLs, HTTP ${res.status}`);
// 200 and 202 mean accepted; 422 or 403 point at a key or host mismatch worth failing on.
if (res.status !== 200 && res.status !== 202) throw new Error(await res.text());

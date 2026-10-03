const PROCLAMATION_LIST_PAGES = [
  "https://www.whitehouse.gov/presidential-actions/proclamations/",
  "https://www.whitehouse.gov/presidential-actions/proclamations/page/2/",
  "https://www.whitehouse.gov/presidential-actions/proclamations/page/3/",
  "https://www.whitehouse.gov/presidential-actions/proclamations/page/4/",
];

const HALF_STAFF_KEYWORDS = ["half-staff", "half staff", "halfmast", "half mast"];
const NGA_CURRENT_GOVERNORS_URL = "https://www.nga.org/governors/";
const NOTICE_CACHE_TTL_MS = 5 * 60 * 1000;
// A full crawl of all states takes ~7 passes (50 states ÷ 8 per pass ≈ 35 min at the
// client's 5-min polling interval), so per-state entries must stay valid longer than
// one sweep; otherwise freshly uncached states make cards flicker off between polls.
const STATE_RESULT_TTL_MS = 60 * 60 * 1000;
const STATES_PER_PASS = 8;
const MAX_NATIONWIDE_ARTICLES = 12;
const STATE_NAMES = new Set([
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
]);
let memoryNoticeCache = null;
let memoryNoticeCacheAt = 0;
let memoryNoticePromise = null;

const HTML_ENTITIES = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  middot: "·",
  bull: "•",
  copy: "©",
};

function decodeEntities(text) {
  return text.replace(/&#x([0-9a-f]{1,6});|&#(\d{1,6});|&([a-zA-Z][a-zA-Z0-9]{0,10});/gi, (match, hex, decimal, name) => {
    if (hex !== undefined) {
      const code = parseInt(hex, 16);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (decimal !== undefined) {
      const code = parseInt(decimal, 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return HTML_ENTITIES[name.toLowerCase()] ?? match;
  });
}

function cleanText(value) {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function stripHtml(html) {
  return cleanText(html.replace(/<[^>]+>/g, " "));
}

function extractPublishedDate(html) {
  const candidates = [
    html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i)?.[1],
    html.match(/<meta[^>]+property="og:updated_time"[^>]+content="([^"]+)"/i)?.[1],
    html.match(/<meta[^>]+name="date"[^>]+content="([^"]+)"/i)?.[1],
    html.match(/<time[^>]+datetime="([^"]+)"/i)?.[1],
  ].filter(Boolean);

  for (const candidate of candidates) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const textDate = html.match(/<time[^>]*>([^<]+)<\/time>/i)?.[1];
  if (textDate) {
    const date = new Date(textDate);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

// Proclamation texts announce "until sunset" / "until 6:00 p.m." in local ET or PT.
// End-of-day UTC is the tightest practical bound: it errs at most ~2 h late for
// Eastern time and ~4 h early for late Pacific sunsets — far tighter than the old
// hard-coded 18:00 UTC, which was mid-afternoon Eastern and marked notices expired
// hours early.
function parseDurationDate(text, referenceDate = new Date()) {
  const explicit = text.match(/until\s+(?:sunset|noon|6:00\s*p\.m\.)\s*(?:on\s+)?(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
  if (explicit) {
    const date = new Date(`${explicit[1]} ${explicit[2]}, ${explicit[3]} 23:59:59 UTC`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const monthDay = text.match(/(?:until|through|tomorrow,?)\s+(?:sunset|noon|6:00\s*p\.m\.)?\s*(?:on\s+)?(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})(?:,\s+(\d{4}))?/i);
  if (monthDay) {
    const year = monthDay[3] || referenceDate.getUTCFullYear();
    let date = new Date(`${monthDay[1]} ${monthDay[2]}, ${year} 23:59:59 UTC`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    if (date.getTime() < referenceDate.getTime()) {
      const rolled = new Date(`${monthDay[1]} ${monthDay[2]}, ${year + 1} 23:59:59 UTC`);
      if (!Number.isNaN(rolled.getTime())) {
        date = rolled;
      }
    }
    return date;
  }

  return null;
}

function isNoticeCurrent(durationText, publishedAt) {
  const now = new Date();
  const explicitDate = parseDurationDate(durationText, publishedAt || now);
  if (explicitDate && !Number.isNaN(explicitDate.getTime())) {
    return explicitDate >= now;
  }

  if (/until\s+further\s+notice|until\s+interment|from\s+sunrise\s+to\s+sunset/i.test(durationText)) {
    if (!publishedAt) return false;
    const ageMs = now - publishedAt;
    return ageMs <= 60 * 24 * 60 * 60 * 1000;
  }

  if (!publishedAt) {
    return false;
  }

  const ageMs = now - publishedAt;
  return ageMs <= 14 * 24 * 60 * 60 * 1000;
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "half-mast-notice-bot/1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }

  return response.text();
}

function extractLinks(listHtml, baseUrl, predicate = () => true, allowExternalHosts = false) {
  const links = [];
  const regex = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gims;
  let match;
  const base = new URL(baseUrl);

  while ((match = regex.exec(listHtml)) !== null) {
    let href;

    try {
      href = new URL(match[1], base).href;
    } catch {
      continue;
    }

    if (!allowExternalHosts && new URL(href).host !== base.host) {
      continue;
    }

    if (!predicate(href)) {
      continue;
    }

    const title = cleanText(match[2].replace(/<[^>]+>/g, ""));
    if (!links.some((item) => item.href === href)) {
      links.push({ href, title });
    }
  }

  return links;
}

function extractArticleContent(html) {
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const contentMatch =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    html.match(/<div[^>]+class="[^"]*(?:entry-content|content|article-body|story-body|main-content|page-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = contentMatch ? stripHtml(contentMatch[1]) : "";
  const title = titleMatch ? cleanText(titleMatch[1]) : "";
  const publishedAt = extractPublishedDate(html);
  return { title, body, publishedAt };
}

// Shared duration grammar so the nationwide scan and the state scan agree on what
// counts as a duration phrase ("until sunset", "until interment", "through June 5"…).
function matchDurationText(body) {
  return (
    body.match(/until\s+(?:sunset|noon|6:00\s*p\.m\.)\s*(?:on\s+)?(?:[A-Za-z]+,\s+)?[A-Za-z]+\s+\d{1,2}(?:,\s+\d{4})?/i) ||
    body.match(/from\s+sunrise\s+to\s+sunset(?:\s+on)?\s+[A-Za-z]+\s+\d{1,2}(?:,\s+\d{4})?/i) ||
    body.match(/until\s+interment/i) ||
    body.match(/through\s+[A-Za-z]+\s+\d{1,2}(?:,\s+\d{4})?/i) ||
    body.match(/tomorrow,?\s+[A-Za-z]+\s+\d{1,2}(?:,\s+\d{4})?/i) ||
    body.match(/until\s+further\s+notice/i)
  );
}

function extractHalfStaffNotice(html, sourceName, fallbackWhy) {
  const { title, body, publishedAt } = extractArticleContent(html);
  const combined = `${title} ${body}`.toLowerCase();

  if (!HALF_STAFF_KEYWORDS.some((keyword) => combined.includes(keyword))) {
    return null;
  }

  if (!/(ordered|directed|lowered|flown at half-staff|half-staff|half staff|halfmast|half mast|proclaim|proclamation)/i.test(combined)) {
    return null;
  }

  const durationMatch = matchDurationText(body);

  if (!durationMatch) {
    return null;
  }

  return {
    status: "Active",
    why: title || fallbackWhy || `Half-staff notice from ${sourceName}`,
    duration: durationMatch ? cleanText(durationMatch[0]) : "Until further notice.",
    publishedAt,
  };
}

function extractNgaGovernorProfiles(html) {
  const profiles = new Map();
  const links = extractLinks(html, NGA_CURRENT_GOVERNORS_URL, (href) => /\/governors\/[^/]+\/?$/i.test(href));

  for (const link of links) {
    const match = link.title.match(/^(.+?)\s+Gov\./i);
    if (!match) {
      continue;
    }

    const stateName = cleanText(match[1]);
    if (!STATE_NAMES.has(stateName)) {
      continue;
    }

    profiles.set(stateName, link.href);
  }

  return profiles;
}

function extractOfficialWebsite(html) {
  const links = extractLinks(html, "https://www.nga.org/", (href) => href.startsWith("http"), true);
  const preferred = links.find((link) => /governor'?s website|state website|official website/i.test(link.title));
  return preferred?.href || null;
}

function scoreCandidateLink(link) {
  const haystack = `${link.href} ${link.title}`.toLowerCase();
  let score = 0;

  for (const keyword of ["half-staff", "half staff", "flag status", "flag lowering", "flag honors", "flag notifications", "newsroom", "news", "press", "proclamation", "half-mast"]) {
    if (haystack.includes(keyword)) {
      score += 10;
    }
  }

  if (/(\/news\/|\/newsroom\/|\/press\/|\/press-releases?\/|\/flag-status\/|\/flag-honors\/|\/half-staff\/|\/half-staff-notices\/|\/flag-lowering\/|\/proclamation\/)/i.test(link.href)) {
    score += 15;
  }

  if (/article|story|release|notice|update|post/i.test(link.title)) {
    score += 4;
  }

  return score;
}

function extractCandidateLinks(html, baseUrl) {
  const links = extractLinks(html, baseUrl, (href) => {
    try {
      const url = new URL(href);
      return url.origin === new URL(baseUrl).origin;
    } catch {
      return false;
    }
  });

  return links
    .map((link) => ({ ...link, score: scoreCandidateLink(link) }))
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score);
}

function looksLikeNoticePage(html) {
  const { title, body } = extractArticleContent(html);
  const combined = `${title} ${body}`.toLowerCase();
  return HALF_STAFF_KEYWORDS.some((keyword) => combined.includes(keyword));
}

async function findNoticeOnSite(url, sourceName, visited = new Set(), depth = 0) {
  if (!url || visited.has(url) || depth > 1) {
    return null;
  }

  visited.add(url);

  const html = await fetchPage(url);
  const notice = extractHalfStaffNotice(html, sourceName);
  if (notice) {
    return { ...notice, source: url };
  }

  const candidateLinks = extractCandidateLinks(html, url).slice(0, 4);
  for (const link of candidateLinks) {
    if (visited.has(link.href)) {
      continue;
    }

    const linkedHtml = await fetchPage(link.href);
    const linkedNotice = extractHalfStaffNotice(linkedHtml, sourceName, link.title);
    if (linkedNotice) {
      return { ...linkedNotice, source: link.href };
    }

    if (looksLikeNoticePage(linkedHtml)) {
      const deeperLinks = extractCandidateLinks(linkedHtml, link.href).slice(0, 4);
      for (const deeperLink of deeperLinks) {
        if (visited.has(deeperLink.href)) {
          continue;
        }

        const deeperHtml = await fetchPage(deeperLink.href);
        const deeperNotice = extractHalfStaffNotice(deeperHtml, sourceName, deeperLink.title);
        if (deeperNotice) {
          return { ...deeperNotice, source: deeperLink.href };
        }
      }
    }
  }

  return null;
}

function getStateSlugFromName(stateName) {
  return stateName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function getCacheStore() {
  return typeof caches !== "undefined" ? caches.default : null;
}

function getCachedNoticePayload() {
  if (!memoryNoticeCache) {
    return null;
  }

  if (Date.now() - memoryNoticeCacheAt > NOTICE_CACHE_TTL_MS) {
    memoryNoticeCache = null;
    memoryNoticeCacheAt = 0;
    return null;
  }

  return memoryNoticeCache;
}

function setCachedNoticePayload(payload) {
  memoryNoticeCache = payload;
  memoryNoticeCacheAt = Date.now();
}

async function runWithConcurrency(items, limit, workerFn) {
  const results = [];
  let index = 0;

  async function next() {
    while (index < items.length) {
      const current = items[index++];
      const value = await workerFn(current);
      if (value) {
        results.push(value);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

async function discoverStateWebsite(stateName, profileMap) {
  const profileUrl = profileMap.get(stateName);
  if (!profileUrl) {
    return null;
  }

  const profileHtml = await fetchPage(profileUrl);
  const websiteUrl = extractOfficialWebsite(profileHtml);
  return websiteUrl ? { profileUrl, websiteUrl } : null;
}

async function findStateNoticeForName(stateName, profileMap) {
  const discovery = await discoverStateWebsite(stateName, profileMap);
  if (!discovery) {
    return null;
  }

  const notice = await findNoticeOnSite(discovery.websiteUrl, stateName, new Set(), 0);
  if (!notice) {
    return null;
  }

  return {
    slug: getStateSlugFromName(stateName),
    name: stateName,
    ...notice,
  };
}

async function findNationwideNotice() {
  let articleChecks = 0;

  for (const listUrl of PROCLAMATION_LIST_PAGES) {
    const listHtml = await fetchPage(listUrl);
    const articleLinks = extractLinks(listHtml, listUrl, (href) => href.includes("/presidential-actions/"));

    for (const article of articleLinks) {
      if (articleChecks >= MAX_NATIONWIDE_ARTICLES) {
        return null;
      }
      articleChecks += 1;

      const articleHtml = await fetchPage(article.href);
      const { title, body, publishedAt } = extractArticleContent(articleHtml);
      const combined = `${title} ${body}`.toLowerCase();

      if (!HALF_STAFF_KEYWORDS.some((keyword) => combined.includes(keyword))) {
        continue;
      }

      const expires = parseDurationDate(body);
      const isActive = !expires || expires >= new Date();

      if (!isActive) {
        continue;
      }

      const why = title.replace(/^death of\s+/i, "Honoring ");
      const durationMatch = matchDurationText(body);
      const durationText = durationMatch ? cleanText(durationMatch[0]) : "Until further notice.";

      if (!isNoticeCurrent(durationText, publishedAt)) {
        continue;
      }

      return {
        status: "Active",
        why,
        duration: durationText,
        source: article.href,
      };
    }
  }

  return null;
}

function stateCacheUrl(stateName) {
  return `https://half-mast.internal/state/${getStateSlugFromName(stateName)}`;
}

async function getCachedStateEntry(cache, stateName) {
  if (!cache) {
    return undefined;
  }

  const entry = await cache.match(stateCacheUrl(stateName));
  if (!entry) {
    return undefined;
  }

  const payload = await entry.json().catch(() => null);
  if (!payload || Date.now() - (payload.at || 0) > STATE_RESULT_TTL_MS) {
    return undefined;
  }

  return payload;
}

async function cacheStateEntry(cache, stateName, notice) {
  if (!cache) {
    return;
  }

  const response = Response.json({ notice: notice || null, at: Date.now() });
  response.headers.set("Cache-Control", `public, max-age=${STATE_RESULT_TTL_MS / 1000}`);
  await cache.put(stateCacheUrl(stateName), response).catch(() => {});
}

async function findStateNotices() {
  const cache = getCacheStore();

  const latest = new Map();
  const pending = [];
  for (const stateName of Array.from(STATE_NAMES)) {
    const entry = await getCachedStateEntry(cache, stateName);
    if (entry !== undefined) {
      latest.set(stateName, entry.notice || null);
    } else {
      pending.push(stateName);
    }
  }

  const buildResult = () => Array.from(latest.values())
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  // No NGA index fetch unless there is actually a batch to crawl: a warm-cache pass
  // must not pay for (or fail on) an unrelated subrequest.
  if (!pending.length) {
    return buildResult();
  }

  let profileMap = new Map();
  try {
    profileMap = extractNgaGovernorProfiles(await fetchPage(NGA_CURRENT_GOVERNORS_URL));
  } catch {
    // Keep serving whatever the state cache already has; retry the crawl next poll.
    return buildResult();
  }

  // Crawl only a bounded number of uncached states per invocation. A cold pass
  // costs ~200 subrequests worst case, comfortably inside the paid plan's 10,000
  // subrequests-per-request limit (the free plan's limit is 50). The rest fill in
  // over subsequent polls.
  const batch = pending.slice(0, STATES_PER_PASS);
  await runWithConcurrency(batch, 5, async (stateName) => {
    let notice = null;
    try {
      const found = await findStateNoticeForName(stateName, profileMap);
      if (found && isNoticeCurrent(found.duration, found.publishedAt)) {
        notice = found;
      }
    } catch {
      // Treat this state as having no notice for this pass.
    }

    latest.set(stateName, notice);
    await cacheStateEntry(cache, stateName, notice);
  });

  return buildResult();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/notices") {
      const respond = (payload) => {
        const response = Response.json(payload);
        response.headers.set("Cache-Control", "public, max-age=300");
        return response;
      };

      const cachedPayload = getCachedNoticePayload();
      if (cachedPayload) {
        return respond(cachedPayload);
      }

      if (memoryNoticePromise) {
        const payload = await memoryNoticePromise;
        return respond(payload);
      }

      const cacheKey = new Request(url.toString(), request);
      const cache = getCacheStore();
      const cached = cache ? await cache.match(cacheKey) : null;
      if (cached) {
        return cached;
      }

      try {
        memoryNoticePromise = Promise.all([findNationwideNotice(), findStateNotices()])
          .then(([nationwide, states]) => ({
            nationwide,
            states,
          }))
          .finally(() => {
            memoryNoticePromise = null;
          });
        const payload = await memoryNoticePromise;
        setCachedNoticePayload(payload);

        const response = Response.json(payload);
        response.headers.set("Cache-Control", "public, max-age=300");
        if (cache) {
          await cache.put(cacheKey, response.clone());
        }
        return response;
      } catch (error) {
        return Response.json(
          {
            nationwide: null,
            states: [],
            error: error instanceof Error ? error.message : "Unable to load notice data.",
          },
          { status: 502 }
        );
      }
    }

    if (url.pathname === "/api/nationwide") {
      const cacheKey = new Request(url.toString(), request);
      const cache = getCacheStore();
      const cached = cache ? await cache.match(cacheKey) : null;
      if (cached) {
        return cached;
      }

      try {
        const notice = await findNationwideNotice();
        const response = Response.json({ notice });
        response.headers.set("Cache-Control", "public, max-age=300");
        if (cache) {
          await cache.put(cacheKey, response.clone());
        }
        return response;
      } catch (error) {
        return Response.json({ notice: null, error: error instanceof Error ? error.message : "Unable to load nationwide notice." }, { status: 502 });
      }
    }

    const stateFileMatch = url.pathname.match(/^\/states\/([a-z0-9-]+)\.html$/i);
    if (stateFileMatch && stateFileMatch[1].toLowerCase() !== "state") {
      // Legacy pretty URL (states/washington.html): redirect to the shared page with
      // the slug in the query so the client-side state picker can see it. Rewriting
      // the asset request instead would not change the URL in the browser.
      const target = new URL("/states/state.html", request.url);
      target.searchParams.set("state", stateFileMatch[1].toLowerCase());
      return Response.redirect(target.toString(), 302);
    }

    return env.ASSETS.fetch(request);
  },
};

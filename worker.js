const PROCLAMATION_LIST_PAGES = [
  "https://www.whitehouse.gov/presidential-actions/proclamations/",
  "https://www.whitehouse.gov/presidential-actions/proclamations/page/2/",
  "https://www.whitehouse.gov/presidential-actions/proclamations/page/3/",
  "https://www.whitehouse.gov/presidential-actions/proclamations/page/4/",
];

const HALF_STAFF_KEYWORDS = ["half-staff", "half staff", "halfmast", "half mast"];

function parseHumanDate(text) {
  const match = text.match(/until\s+6:00\s*p\.m\.\s+on\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  if (!match) return null;

  const date = new Date(`${match[1]}T18:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
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

function extractArticleLinks(listHtml) {
  const links = [];
  const regex = /<a[^>]+href="(https:\/\/www\.whitehouse\.gov\/presidential-actions\/[^"\s>]+\/?)"[^>]*>(.*?)<\/a>/gims;
  let match;

  while ((match = regex.exec(listHtml)) !== null) {
    const href = match[1];
    const title = cleanText(match[2].replace(/<[^>]+>/g, ""));
    if (!links.some((item) => item.href === href)) {
      links.push({ href, title });
    }
  }

  return links;
}

function extractProclamationContent(html) {
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const contentMatch = html.match(/<div[^>]+class="entry-content[^\"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const body = contentMatch ? cleanText(contentMatch[1].replace(/<[^>]+>/g, " ")) : "";
  const title = titleMatch ? cleanText(titleMatch[1]) : "";
  return { title, body };
}

async function findNationwideNotice() {
  for (const listUrl of PROCLAMATION_LIST_PAGES) {
    const listHtml = await fetchPage(listUrl);
    const articleLinks = extractArticleLinks(listHtml);

    for (const article of articleLinks) {
      const articleHtml = await fetchPage(article.href);
      const { title, body } = extractProclamationContent(articleHtml);
      const combined = `${title} ${body}`.toLowerCase();

      if (!HALF_STAFF_KEYWORDS.some((keyword) => combined.includes(keyword))) {
        continue;
      }

      const expires = parseHumanDate(body);
      const now = new Date();
      const isActive = !expires || expires >= now;

      if (!isActive) {
        continue;
      }

      const why = title.replace(/^death of\s+/i, "Honoring ");
      const durationMatch = body.match(/until\s+6:00\s*p\.m\.\s+on\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/i);

      return {
        status: "Active",
        why,
        duration: durationMatch ? cleanText(durationMatch[0]) : "Until further notice.",
        source: article.href,
      };
    }
  }

  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/nationwide") {
      try {
        const notice = await findNationwideNotice();
        return Response.json({ notice });
      } catch (error) {
        return Response.json({ notice: null, error: error instanceof Error ? error.message : "Unable to load nationwide notice." }, { status: 502 });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
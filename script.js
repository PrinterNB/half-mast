const DATA_PATH = document.body.dataset.page === "state" ? "../notices.json" : "notices.json";
const NOTICE_BUNDLE_PATH = "/api/notices";

const STATE_CATALOG = [
  { slug: "alabama", name: "Alabama", abbr: "AL" },
  { slug: "alaska", name: "Alaska", abbr: "AK" },
  { slug: "arizona", name: "Arizona", abbr: "AZ" },
  { slug: "arkansas", name: "Arkansas", abbr: "AR" },
  { slug: "california", name: "California", abbr: "CA" },
  { slug: "colorado", name: "Colorado", abbr: "CO" },
  { slug: "connecticut", name: "Connecticut", abbr: "CT" },
  { slug: "delaware", name: "Delaware", abbr: "DE" },
  { slug: "florida", name: "Florida", abbr: "FL" },
  { slug: "georgia", name: "Georgia", abbr: "GA" },
  { slug: "hawaii", name: "Hawaii", abbr: "HI" },
  { slug: "idaho", name: "Idaho", abbr: "ID" },
  { slug: "illinois", name: "Illinois", abbr: "IL" },
  { slug: "indiana", name: "Indiana", abbr: "IN" },
  { slug: "iowa", name: "Iowa", abbr: "IA" },
  { slug: "kansas", name: "Kansas", abbr: "KS" },
  { slug: "kentucky", name: "Kentucky", abbr: "KY" },
  { slug: "louisiana", name: "Louisiana", abbr: "LA" },
  { slug: "maine", name: "Maine", abbr: "ME" },
  { slug: "maryland", name: "Maryland", abbr: "MD" },
  { slug: "massachusetts", name: "Massachusetts", abbr: "MA" },
  { slug: "michigan", name: "Michigan", abbr: "MI" },
  { slug: "minnesota", name: "Minnesota", abbr: "MN" },
  { slug: "mississippi", name: "Mississippi", abbr: "MS" },
  { slug: "missouri", name: "Missouri", abbr: "MO" },
  { slug: "montana", name: "Montana", abbr: "MT" },
  { slug: "nebraska", name: "Nebraska", abbr: "NE" },
  { slug: "nevada", name: "Nevada", abbr: "NV" },
  { slug: "new-hampshire", name: "New Hampshire", abbr: "NH" },
  { slug: "new-jersey", name: "New Jersey", abbr: "NJ" },
  { slug: "new-mexico", name: "New Mexico", abbr: "NM" },
  { slug: "new-york", name: "New York", abbr: "NY" },
  { slug: "north-carolina", name: "North Carolina", abbr: "NC" },
  { slug: "north-dakota", name: "North Dakota", abbr: "ND" },
  { slug: "ohio", name: "Ohio", abbr: "OH" },
  { slug: "oklahoma", name: "Oklahoma", abbr: "OK" },
  { slug: "oregon", name: "Oregon", abbr: "OR" },
  { slug: "pennsylvania", name: "Pennsylvania", abbr: "PA" },
  { slug: "rhode-island", name: "Rhode Island", abbr: "RI" },
  { slug: "south-carolina", name: "South Carolina", abbr: "SC" },
  { slug: "south-dakota", name: "South Dakota", abbr: "SD" },
  { slug: "tennessee", name: "Tennessee", abbr: "TN" },
  { slug: "texas", name: "Texas", abbr: "TX" },
  { slug: "utah", name: "Utah", abbr: "UT" },
  { slug: "vermont", name: "Vermont", abbr: "VT" },
  { slug: "virginia", name: "Virginia", abbr: "VA" },
  { slug: "washington", name: "Washington", abbr: "WA" },
  { slug: "west-virginia", name: "West Virginia", abbr: "WV" },
  { slug: "wisconsin", name: "Wisconsin", abbr: "WI" },
  { slug: "wyoming", name: "Wyoming", abbr: "WY" },
];

function getStateMeta(slug) {
  return STATE_CATALOG.find((state) => state.slug === slug) || null;
}

function getStatePageUrl(slug) {
  return `states/state.html?state=${encodeURIComponent(slug)}`;
}

function getStateSlug() {
  const queryState = new URLSearchParams(window.location.search).get("state");
  return queryState || document.body.dataset.state || "";
}

async function loadNotices() {
  try {
    const response = await fetch(NOTICE_BUNDLE_PATH);
    if (response.ok) {
      const data = await response.json();
      if (data && (Array.isArray(data.states) || data.nationwide !== undefined)) {
        return {
          nationwide: data.nationwide || null,
          states: Array.isArray(data.states) ? data.states : [],
        };
      }
    }
  } catch {
    // Fall through to the cheaper endpoints.
  }

  let apiNationwide = null;
  try {
    const response = await fetch("/api/nationwide");
    if (response.ok) {
      const data = await response.json();
      apiNationwide = data && data.notice ? data.notice : null;
    }
  } catch {
    // Fall through to the static bundle.
  }

  const response = await fetch(`${DATA_PATH}?t=${Date.now()}`);
  if (!response.ok) {
    throw new Error("Unable to load notice data.");
  }
  const fallback = await response.json();
  if (apiNationwide) {
    return { nationwide: apiNationwide, states: Array.isArray(fallback.states) ? fallback.states : [] };
  }
  return fallback;
}

function renderNationwide(notice) {
  const section = document.getElementById("nationwide-notice");
  if (!section) return;

  if (!notice) {
    section.innerHTML = `
      <h2>Nationwide Notice</h2>
      <p class="status">None active</p>
      <p><strong>Why:</strong> No current nationwide half-mast notice.</p>
      <p><strong>How long:</strong> Check again later.</p>
    `;
    return;
  }

  section.innerHTML = `
    <h2>Nationwide Notice</h2>
    <p class="status">${notice.status}</p>
    <p><strong>Why:</strong> ${notice.why}</p>
    <p><strong>How long:</strong> ${notice.duration}</p>
  `;
}

function renderStateCards(states) {
  const container = document.getElementById("state-cards");
  if (!container) return;
  const safeStates = Array.isArray(states) ? states : [];

  container.innerHTML = safeStates
    .map(
      (state) => `
        <article class="state-card">
          <div class="state-card__icon" aria-hidden="true">
            <span class="state-card__icon-badge">${getStateMeta(state.slug)?.abbr || state.slug.slice(0, 2).toUpperCase()}</span>
          </div>
          <div class="state-card__content">
            <h3>${getStateMeta(state.slug)?.name || state.name}</h3>
            <p>${state.why}</p>
            <a class="state-card__link" href="${getStatePageUrl(state.slug)}">View notice</a>
          </div>
        </article>
      `
    )
    .join("");

  if (!container.innerHTML) {
    container.innerHTML = `<p class="state-error">No current state notices.</p>`;
  }
}

function renderStatePage(states) {
  const section = document.getElementById("state-notice");
  if (!section) return;

  const slug = getStateSlug();
  const safeStates = Array.isArray(states) ? states : [];
  const stateMeta = getStateMeta(slug);
  const notice = safeStates.find((item) => item.slug === slug);
  const stateName = stateMeta?.name || notice?.name || "State";

  document.title = `${stateName} Half-Mast Notice`;
  const heading = document.querySelector(".page-header h1");
  if (heading) heading.textContent = `${stateName} Half-Mast Notice`;

  if (!notice) {
    section.innerHTML = `
      <p class="status">Unavailable</p>
      <p><strong>Why:</strong> No current notice found for ${stateName}.</p>
      <p><strong>How long:</strong> Check back soon.</p>
    `;
    return;
  }

  section.innerHTML = `
    <p class="status">${notice.status}</p>
    <p><strong>Why:</strong> ${notice.why}</p>
    <p><strong>How long:</strong> ${notice.duration}</p>
  `;
}

function renderError() {
  const nationwide = document.getElementById("nationwide-notice");
  if (nationwide) {
    nationwide.innerHTML = `
      <h2>Nationwide Notice</h2>
      <p class="status">Unavailable</p>
      <p><strong>Why:</strong> Could not load notice data.</p>
      <p><strong>How long:</strong> Try refreshing this page.</p>
    `;
  }

  const cards = document.getElementById("state-cards");
  if (cards) {
    cards.innerHTML = `<p class="state-error">Could not load state notices. Try refreshing.</p>`;
  }

  const stateNotice = document.getElementById("state-notice");
  if (stateNotice) {
    stateNotice.innerHTML = `
      <p class="status">Unavailable</p>
      <p><strong>Why:</strong> Could not load notice data.</p>
      <p><strong>How long:</strong> Try refreshing this page.</p>
    `;
  }
}

async function renderFromData() {
  try {
    const data = await loadNotices();
    renderNationwide(data.nationwide);
    renderStateCards(data.states);
    renderStatePage(data.states);
  } catch {
    renderError();
  }
}

renderFromData();
setInterval(renderFromData, 5 * 60 * 1000);

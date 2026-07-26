const DATA_PATH = document.body.dataset.page === "state" ? "../notices.json" : "notices.json";

async function loadNotices() {
  const response = await fetch(`${DATA_PATH}?t=${Date.now()}`);
  if (!response.ok) {
    throw new Error("Unable to load notice data.");
  }
  return response.json();
}

function renderNationwide(notice) {
  const section = document.getElementById("nationwide-notice");
  if (!section || !notice) return;

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

  container.innerHTML = states
    .map(
      (state) => `
        <article class="state-card">
          <div class="state-card__icon" aria-hidden="true">
            <svg viewBox="${state.icon.viewBox}" role="img">
              <path d="${state.icon.path}" />
            </svg>
          </div>
          <div class="state-card__content">
            <h3>${state.name}</h3>
            <p>${state.why}</p>
            <a class="state-card__link" href="states/${state.slug}.html">View notice</a>
          </div>
        </article>
      `
    )
    .join("");
}

function renderStatePage(states) {
  const section = document.getElementById("state-notice");
  if (!section) return;

  const slug = document.body.dataset.state;
  const state = states.find((item) => item.slug === slug);

  if (!state) {
    section.innerHTML = `
      <p class="status">Unavailable</p>
      <p><strong>Why:</strong> No current notice found for this state.</p>
      <p><strong>How long:</strong> Check back soon.</p>
    `;
    return;
  }

  document.title = `${state.name} Half-Mast Notice`;
  const heading = document.querySelector(".page-header h1");
  if (heading) heading.textContent = `${state.name} Half-Mast Notice`;

  section.innerHTML = `
    <p class="status">${state.status}</p>
    <p><strong>Why:</strong> ${state.why}</p>
    <p><strong>How long:</strong> ${state.duration}</p>
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

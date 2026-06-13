export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderProfile(profile) {
  return `<section class="hero-copy" aria-label="Profile summary">
  <p class="profile-location">${escapeHtml(profile.location)}</p>
  <h1>${escapeHtml(profile.name)}</h1>
  <p class="profile-headline">${escapeHtml(profile.headline)}</p>
  <p class="profile-about">${escapeHtml(profile.about)}</p>
  <ul class="profile-skills">${profile.topSkills.map((skill) => `<li>${escapeHtml(skill)}</li>`).join("")}</ul>
</section>`;
}

export function renderOrbitControls(sections) {
  return sections.map((section, index) => `<button class="orbit-node-button" type="button" data-section-id="${escapeHtml(section.id)}" aria-controls="section-${escapeHtml(section.id)}" aria-selected="false" style="--node-index:${index}">
  <span class="node-pulse" aria-hidden="true"></span>
  <span class="node-label">${escapeHtml(section.label)}</span>
  <span class="node-preview">${escapeHtml(section.preview)}</span>
</button>`).join("");
}

export function renderContactLinks(links) {
  return `<ul class="contact-links">${links.map((link) => `<li><a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a></li>`).join("")}</ul>`;
}

function renderTags(tags = []) {
  return tags.length
    ? `<ul class="tag-list">${tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`
    : "";
}

function renderSummary(lines = []) {
  return `<ul class="summary-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
}

function renderItem(item) {
  const link = item.href
    ? `<a class="section-link" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">Open source</a>`
    : "";

  return `<article class="section-card">
  <div class="section-card-header">
    <div>
      <h3>${escapeHtml(item.title)}</h3>
      ${item.org ? `<p class="section-org">${escapeHtml(item.org)}</p>` : ""}
    </div>
    ${item.dates ? `<p class="section-dates">${escapeHtml(item.dates)}</p>` : ""}
  </div>
  ${item.meta ? `<p class="section-meta">${escapeHtml(item.meta)}</p>` : ""}
  ${renderSummary(item.summary)}
  ${renderTags(item.tags)}
  ${link}
</article>`;
}

function renderSkills(section) {
  const groups = section.groups.map((group) => `<article class="skill-group"><h3>${escapeHtml(group.label)}</h3>${renderTags(group.values)}</article>`).join("");
  const certs = `<article class="skill-group certification-group"><h3>Certifications</h3>${renderTags(section.certifications)}</article>`;
  return `<div class="skill-grid">${groups}${certs}</div>`;
}

function renderContact(section) {
  return `<div class="contact-layout">
  <div class="contact-particle-field" aria-hidden="true"></div>
  ${renderContactLinks(section.links)}
</div>`;
}

export function renderSectionPanel(section) {
  const body = section.id === "skills"
    ? renderSkills(section)
    : section.id === "contact"
      ? renderContact(section)
      : section.items.map(renderItem).join("");

  return `<section class="content-panel" id="section-${escapeHtml(section.id)}" data-section-panel="${escapeHtml(section.id)}" aria-labelledby="section-title-${escapeHtml(section.id)}" hidden>
  <button class="back-button" type="button" data-action="back-to-orbit">Back to orbit</button>
  <p class="section-kicker">${escapeHtml(section.label)}</p>
  <h2 id="section-title-${escapeHtml(section.id)}">${escapeHtml(section.preview)}</h2>
  <div class="section-body">${body}</div>
</section>`;
}

import assert from "node:assert/strict";
import test from "node:test";
import { CONTACT_LINKS, PROFILE, sections } from "../src/content.js";
import {
  escapeHtml,
  renderContactLinks,
  renderOrbitControls,
  renderProfile,
  renderSectionPanel
} from "../src/ui.js";

test("escapeHtml protects rendered templates", () => {
  assert.equal(escapeHtml("<script>alert('x')</script>"), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
});

test("renderProfile includes hero copy", () => {
  const html = renderProfile(PROFILE);
  assert.ok(html.includes("Bayar T."));
  assert.ok(html.includes("Cloud App Dev @ AWS | 9x AWS Certified"));
  assert.equal(html.includes("I love solving problems."), false);
  assert.equal(html.includes("profile-about"), false);
  assert.equal(html.includes("profile-skills"), false);
  assert.equal(html.includes("Hermes"), false);
  assert.equal(html.includes("OpenClaw"), false);
});

test("renderOrbitControls creates one accessible button per section", () => {
  const html = renderOrbitControls(sections);
  assert.equal((html.match(/class="orbit-node-button"/g) || []).length, 5);
  assert.ok(html.includes('data-section-id="experience"'));
  assert.ok(html.includes('aria-controls="section-experience"'));
});

test("renderSectionPanel renders project links and back control", () => {
  const projects = sections.find((section) => section.id === "projects");
  const html = renderSectionPanel(projects);
  assert.ok(html.includes('id="section-projects"'));
  assert.ok(html.includes("OpenSearch Traffic Gateway"));
  assert.ok(html.includes("https://github.com/opensearch-project/opensearch-traffic-gateway"));
  assert.ok(html.includes('data-action="back-to-orbit"'));
});

test("renderSectionPanel keeps contact focused on links without a decorative field", () => {
  const contact = sections.find((section) => section.id === "contact");
  const html = renderSectionPanel(contact);
  assert.ok(html.includes('class="contact-links"'));
  assert.equal(html.includes('class="contact-particle-field"'), false);
  assert.equal(html.includes('aria-hidden="true"'), false);
});

test("renderContactLinks includes every contact target", () => {
  const html = renderContactLinks(CONTACT_LINKS);
  assert.ok(html.includes("https://www.linkedin.com/in/bayar-t/"));
  assert.ok(html.includes("https://huggingface.co/bayarr"));
});

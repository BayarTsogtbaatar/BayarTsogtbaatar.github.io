import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTACT_LINKS,
  PROFILE,
  SECTION_IDS,
  getSectionById,
  sections
} from "../src/content.js";

test("profile content reflects the LinkedIn export", () => {
  assert.equal(PROFILE.name, "Bayar T.");
  assert.equal(PROFILE.headline, "Cloud App Dev @ AWS | 9x AWS Certified");
  assert.equal(PROFILE.location, "Sacramento, California, United States");
  assert.equal(PROFILE.about, "I love solving problems.");
  assert.equal(PROFILE.organization, "Amazon Web Services (AWS)");
  assert.equal(PROFILE.education, "University of California, San Diego");
  assert.deepEqual(PROFILE.topSkills, ["Hermes", "OpenClaw", "HuggingFace", "Amazon Web Services (AWS)"]);
});

test("contact links include LinkedIn, GitHub, Hugging Face, website, and repository", () => {
  assert.deepEqual(
    CONTACT_LINKS.map((link) => [link.label, link.href]),
    [
      ["LinkedIn", "https://www.linkedin.com/in/bayar-t/"],
      ["GitHub", "https://github.com/bayar-t"],
      ["Hugging Face", "https://huggingface.co/bayarr"],
      ["Website", "https://bayartsogtbaatar.github.io/"],
      ["Repository", "https://github.com/BayarTsogtbaatar/BayarTsogtbaatar.github.io"]
    ]
  );
});

test("sections match the approved singularity nodes", () => {
  assert.deepEqual(SECTION_IDS, ["experience", "projects", "skills", "education", "contact"]);
  assert.deepEqual(sections.map((section) => section.id), SECTION_IDS);
});

test("experience includes current AWS role and associate AWS role", () => {
  const experience = getSectionById("experience");
  const titles = experience.items.map((item) => item.title);
  assert.ok(titles.includes("Cloud App Developer"));
  assert.ok(titles.includes("Associate Cloud App Developer"));
  assert.ok(experience.items[0].summary.join(" ").includes("1.5T rows per migration"));
  assert.ok(experience.items[1].summary.join(" ").includes("5x read throughput"));
});

test("projects include OpenSearch Traffic Gateway, A* Path Finding, and this portfolio", () => {
  const projects = getSectionById("projects");
  assert.ok(projects.items.some((item) => item.title === "OpenSearch Traffic Gateway"));
  assert.ok(projects.items.some((item) => item.title === "A* Path Finding"));
  assert.ok(projects.items.some((item) => item.title === "Singularity Portfolio"));
});

test("skills include certification highlights and cloud/data stack", () => {
  const skills = getSectionById("skills");
  const certs = skills.certifications.join(" ");
  const groups = skills.groups.flatMap((group) => group.values).join(" ");
  assert.ok(certs.includes("9x AWS Certified"));
  assert.ok(certs.includes("AWS Certified Generative AI Developer - Professional"));
  assert.ok(certs.includes("AWS Certified CloudOps Engineer - Associate"));
  assert.ok(groups.includes("OpenSearch"));
  assert.ok(groups.includes("PySpark"));
});

test("unknown section lookup throws a clear error", () => {
  assert.throws(() => getSectionById("unknown"), /Unknown section id: unknown/);
});

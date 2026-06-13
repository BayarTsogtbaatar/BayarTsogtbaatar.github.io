# Singularity Navigator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cinematic Three.js singularity portfolio where orbiting nodes navigate to Experience, Projects, Skills, Education, and Contact using Bayar's LinkedIn-exported profile content.

**Architecture:** Convert the current root-level static page into a Vite app that still builds to static files for GitHub Pages. Keep JavaScript split into focused vanilla ES modules: content data, pure navigation state, UI rendering, scene configuration, Three.js scene control, and app bootstrap.

**Tech Stack:** Vite `8.0.16`, Three.js `0.184.0`, GSAP `3.15.0`, vanilla JavaScript modules, CSS, Node built-in test runner, Browser/IAB visual verification. Houdini, Blender, Figma, Photoshop, Affinity Photo, and Davinci Resolve remain reference production tools unless source assets are supplied.

---

## Source Inputs

- Design spec: `docs/superpowers/specs/2026-06-13-singularity-navigator-design.md`
- LinkedIn export: `C:\Users\Bayar\.codex\attachments\2372d03e-1308-4adb-90f6-7d20d98d4741\pasted-text.txt`
- Igloo process reference: `C:\Users\Bayar\.codex\attachments\01867834-7b27-4485-b2e7-cb3bbfce5458\pasted-text.txt`
- Current site files: `index.html`, `assets/css/styles.css`, `assets/js/main.js`
- Local command note: use `npm.cmd` in PowerShell because `npm.ps1` is blocked by execution policy.

## File Structure

- Create `package.json`: Vite, test, build, and preview scripts.
- Create `vite.config.js`: GitHub Pages-friendly static build settings.
- Create `tests/content.test.mjs`: profile, section, project, skill, certification, and contact data checks.
- Create `tests/state.test.mjs`: orbit, dive, focus, return, hash, and reduced-motion state checks.
- Create `tests/ui.test.mjs`: HTML escaping, orbit controls, panels, links, and accessibility contracts.
- Create `tests/structure.test.mjs`: Vite shell, CSS selector, and module import contracts.
- Create `tests/workflow.test.mjs`: GitHub Pages workflow contract checks.
- Create `src/content.js`: single source of truth for LinkedIn-derived content.
- Create `src/state.js`: pure state transition helpers.
- Create `src/ui.js`: accessible HTML rendering helpers.
- Create `src/scene-config.js`: package versions, node layout, colors, particle budgets, transition timings, and feature flags.
- Create `src/scene.js`: Three.js and GSAP-powered scene controller.
- Create `src/main.js`: app bootstrap and DOM/event integration.
- Create `src/styles.css`: cinematic layout, responsive behavior, fallbacks, and reduced-motion styling.
- Create `.github/workflows/pages.yml`: builds Vite and deploys `dist/` to GitHub Pages.
- Replace `index.html`: Vite app shell.
- Remove obsolete `assets/css/styles.css` and `assets/js/main.js` after the Vite app replaces them.

## Task 1: Vite Project Harness

**Files:**
- Create: `package.json`
- Create: `vite.config.js`

- [ ] **Step 1: Create package scripts and pinned dependencies**

Create `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "node --test tests/*.test.mjs",
    "check": "npm.cmd test && npm.cmd build"
  },
  "dependencies": {
    "gsap": "3.15.0",
    "three": "0.184.0"
  },
  "devDependencies": {
    "vite": "8.0.16"
  }
}
```

- [ ] **Step 2: Add Vite config**

Create `vite.config.js`:

```js
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  }
});
```

- [ ] **Step 3: Install dependencies**

Run:

```powershell
npm.cmd install
```

Expected: `node_modules` and `package-lock.json` are created. No install errors.

- [ ] **Step 4: Commit Task 1**

```powershell
git add package.json package-lock.json vite.config.js
git commit -m "Set up Vite portfolio project"
```

## Task 2: GitHub Pages Build Workflow

**Files:**
- Create: `tests/workflow.test.mjs`
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Write the failing workflow test**

Create `tests/workflow.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("GitHub Pages workflow builds Vite dist and deploys it", () => {
  const workflow = readFileSync(".github/workflows/pages.yml", "utf8");
  for (const fragment of [
    "npm ci",
    "npm run build",
    "actions/upload-pages-artifact",
    "path: dist",
    "actions/deploy-pages"
  ]) {
    assert.ok(workflow.includes(fragment), `Missing workflow fragment: ${fragment}`);
  }
});
```

- [ ] **Step 2: Run the workflow test to verify it fails**

Run:

```powershell
npm.cmd test
```

Expected: FAIL because `.github/workflows/pages.yml` does not exist.

- [ ] **Step 3: Add the Pages workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Run tests to verify green**

Run:

```powershell
npm.cmd test
```

Expected: workflow test passes.

- [ ] **Step 5: Commit Task 2**

```powershell
git add tests/workflow.test.mjs .github/workflows/pages.yml
git commit -m "Add GitHub Pages deployment workflow"
```

## Task 3: Content Data

**Files:**
- Create: `tests/content.test.mjs`
- Create: `src/content.js`

- [ ] **Step 1: Write the failing content test**

Create `tests/content.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the content test to verify it fails**

Run:

```powershell
npm.cmd test
```

Expected: FAIL with `Cannot find module` for `src/content.js`.

- [ ] **Step 3: Implement content data**

Create `src/content.js`:

```js
export const PROFILE = {
  name: "Bayar T.",
  headline: "Cloud App Dev @ AWS | 9x AWS Certified",
  location: "Sacramento, California, United States",
  about: "I love solving problems.",
  organization: "Amazon Web Services (AWS)",
  education: "University of California, San Diego",
  topSkills: ["Hermes", "OpenClaw", "HuggingFace", "Amazon Web Services (AWS)"]
};

export const CONTACT_LINKS = [
  { label: "LinkedIn", href: "https://www.linkedin.com/in/bayar-t/" },
  { label: "GitHub", href: "https://github.com/bayar-t" },
  { label: "Hugging Face", href: "https://huggingface.co/bayarr" },
  { label: "Website", href: "https://bayartsogtbaatar.github.io/" },
  { label: "Repository", href: "https://github.com/BayarTsogtbaatar/BayarTsogtbaatar.github.io" }
];

export const sections = [
  {
    id: "experience",
    label: "Experience",
    preview: "AWS-scale systems, migration tooling, OpenSearch governance, and enterprise platforms.",
    items: [
      {
        title: "Cloud App Developer",
        org: "Amazon Web Services (AWS)",
        dates: "Dec 2025 - Present",
        meta: "Full-time · Remote",
        summary: [
          "Architected an externalized S3 Batch Operations manifest-planning pipeline for regional migrations, scaling planning to 1.5T rows per migration with AWS Glue, PySpark, S3, chunked Parquet reads, spill thresholds, worker tuning, batching, and memory flushing.",
          "Authored long-running migration workflows with parent-child patterns, SQS partial-batch failure handling, pause-workflow integration, live replication monitoring, severity-2 alarms, and control-plane workflow integration.",
          "Built a kiosk platform across 7 packages in under 4 months, including RBAC, device registration APIs, UI pages, Android WebView, Panther localization for English and Spanish, and accessibility compliance."
        ],
        tags: ["AWS Glue", "PySpark", "S3", "SQS", "React", "Kotlin", "CDK", "Cognito"]
      },
      {
        title: "Associate Cloud App Developer",
        org: "Amazon Web Services (AWS)",
        dates: "Nov 2022 - Nov 2025",
        meta: "Full-time · Remote",
        summary: [
          "Scaled jam.aws.com for AWS re:Invent 2023, including DAX caching that increased DynamoDB read throughput by 5x and a Scheduled Jobs service for configurable cross-account scheduling.",
          "Created a reusable SAM, Glue, and Lambda migration framework that saved 200+ developer hours; replaced ORM DynamoDB access with OpenSearch queries to remove 66% of API calls.",
          "Moved API Gateway to OpenAPI specifications that mapped 4x more routes and reduced API-layer deployment time by 90%; helped migrate Spring Boot apps from Lambda to Fargate, reducing cloud costs by 70%.",
          "Built the initial Netty HTTP proxy foundation for OpenSearch governance adopted for production deployment, with customer-domain cost savings ranging from 20% to 90%.",
          "Led backend architecture for an M&E workflow pricing platform and built Skill Builder UI work with React, Cloudscape, GraphQL, supergraph, micro front ends, and TypeScript."
        ],
        tags: ["DynamoDB", "DAX", "OpenSearch", "SAM", "Lambda", "Fargate", "React", "TypeScript"]
      },
      {
        title: "Software Engineer",
        org: "Virtusa",
        dates: "Jan 2022 - Nov 2022",
        meta: "Contract to Fidelity Investments · Remote",
        summary: [
          "Modernized core applications, migrated on-prem services to Azure Kubernetes Service, supported dashboards, and contributed Db2 stored procedures on Mainframe.",
          "Worked across Spring MVC, Spring Boot, Tomcat, JUnit, Mockito, Cucumber, Jenkins, Docker, Kubernetes, Helm charts, UDeploy, Datadog, Splunk, Drools, and AKS."
        ],
        tags: ["Spring Boot", "AKS", "Docker", "Kubernetes", "Helm", "Db2", "Splunk"]
      },
      {
        title: "Software Engineer",
        org: "Early Warning",
        dates: "Oct 2020 - Nov 2021",
        meta: "Contract · Remote",
        summary: [
          "Worked on the Data Management platform for data quality and analysis, and led 2 developers through data-compliance efforts.",
          "Used Hive, Solr, HBase, Kafka, Hadoop, Spark, TestNG, Cucumber, JMeter, and Chef."
        ],
        tags: ["Kafka", "Hadoop", "Spark", "HBase", "JMeter", "Chef"]
      },
      {
        title: "Intern",
        org: "MOVA International (MOVA Globes)",
        dates: "Aug 2018 - Nov 2018",
        meta: "Part-time · San Diego, California",
        summary: ["Used CAD processes to engrave custom logos and messages on products."],
        tags: ["CAD", "Product customization"]
      }
    ]
  },
  {
    id: "projects",
    label: "Projects",
    preview: "Open-source infrastructure work, pathfinding visuals, and this singularity portfolio.",
    items: [
      {
        title: "OpenSearch Traffic Gateway",
        org: "Associated with Amazon Web Services (AWS)",
        dates: "Jan 2024 - Apr 2024",
        summary: [
          "Created the initial Netty-based HTTP proxy logic for intercepting OpenSearch traffic, aggregating chunked HTTP requests across frames, and evaluating complete requests against governance rules.",
          "Contributed bypass-key logic, rules engine work, Lucene query-string parsing, OpenSearch DateMathParser enforcement, a Helm chart, HPA autoscaling, and Kubernetes deployment support.",
          "The OpenSearch team open-sourced the code and used it in a workshop for 200+ developers; production rollout delivered 20-90% cost savings across customer domains."
        ],
        href: "https://github.com/opensearch-project/opensearch-traffic-gateway",
        tags: ["Netty", "OpenSearch", "Lucene", "Kubernetes", "Helm"]
      },
      {
        title: "A* Path Finding",
        org: "Personal project",
        dates: "Apr 2020 - Jul 2020",
        summary: ["Uses A* to find the shortest path through a grid and renders explored paths in real time."],
        tags: ["A*", "Pathfinding", "Visualization"]
      },
      {
        title: "Singularity Portfolio",
        org: "Personal site",
        dates: "2026",
        summary: ["A cinematic Three.js portfolio navigation system built around an interactive black-hole singularity."],
        tags: ["Three.js", "GSAP", "Vite", "WebGL"]
      }
    ]
  },
  {
    id: "skills",
    label: "Skills",
    preview: "Cloud systems, data platforms, web apps, testing, and 9x AWS certification depth.",
    groups: [
      { label: "Languages", values: ["Java", "C/C++", "Python", "HTML", "CSS", "JavaScript", "SQL", "ARM", "Haskell", "R"] },
      { label: "Cloud and Data", values: ["AWS", "Glue", "PySpark", "S3", "DynamoDB", "DAX", "OpenSearch", "Lambda", "SAM", "Fargate", "CDK", "Route53", "CloudAuth", "SigV4", "Cognito"] },
      { label: "Frontend and Apps", values: ["React", "Cloudscape", "GraphQL", "TypeScript", "Kotlin", "Android WebView", "Meridian", "Angular"] },
      { label: "Tools", values: ["Git", "GitLab", "Docker", "Gradle", "Postman", "Hermes", "OpenClaw", "HuggingFace"] },
      { label: "Testing and Quality", values: ["Veracode", "JMeter", "Gatling", "JUnit", "Mockito", "Cucumber", "TestNG"] },
      { label: "Communication", values: ["English"] }
    ],
    certifications: [
      "9x AWS Certified",
      "AWS Certified Generative AI Developer - Professional",
      "AWS Certified CloudOps Engineer - Associate",
      "AWS Certified Data Engineer - Associate",
      "AWS Certified Solutions Architect - Associate"
    ]
  },
  {
    id: "education",
    label: "Education",
    preview: "Mathematics - Computer Science foundation from UC San Diego.",
    items: [
      {
        title: "B.S., Mathematics - Computer Science",
        org: "UC San Diego",
        dates: "2015 - 2020",
        summary: ["Coursework and skill focus included functional programming and ARM."]
      },
      {
        title: "High School Diploma",
        org: "Inderkum High School",
        dates: "Aug 2011 - May 2015",
        summary: ["High school education."]
      }
    ]
  },
  {
    id: "contact",
    label: "Contact",
    preview: "LinkedIn, GitHub, Hugging Face, website, and source repository.",
    links: CONTACT_LINKS
  }
];

export const SECTION_IDS = sections.map((section) => section.id);

export function getSectionById(id) {
  const section = sections.find((candidate) => candidate.id === id);
  if (!section) {
    throw new Error(`Unknown section id: ${id}`);
  }
  return section;
}
```

- [ ] **Step 4: Run tests to verify green**

Run:

```powershell
npm.cmd test
```

Expected: all content tests pass.

- [ ] **Step 5: Commit Task 3**

```powershell
git add tests/content.test.mjs src/content.js
git commit -m "Add LinkedIn-backed portfolio content"
```

## Task 4: Navigation State Machine

**Files:**
- Create: `tests/state.test.mjs`
- Create: `src/state.js`

- [ ] **Step 1: Write the failing state test**

Create `tests/state.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  completeDive,
  completeReturn,
  createInitialState,
  getSectionIdFromHash,
  setHoveredSection,
  selectSection,
  startReturn
} from "../src/state.js";

test("initial state starts in orbit", () => {
  assert.deepEqual(createInitialState(), {
    mode: "intro",
    activeSectionId: null,
    hoveredSectionId: null,
    reducedMotion: false
  });
});

test("reduced motion can start directly in orbit", () => {
  assert.deepEqual(createInitialState({ reducedMotion: true }), {
    mode: "orbit",
    activeSectionId: null,
    hoveredSectionId: null,
    reducedMotion: true
  });
});

test("hovering known sections updates hover state", () => {
  assert.equal(setHoveredSection(createInitialState(), "projects").hoveredSectionId, "projects");
  assert.equal(setHoveredSection(createInitialState(), null).hoveredSectionId, null);
});

test("selecting a section enters dive state", () => {
  assert.deepEqual(selectSection(createInitialState(), "skills"), {
    mode: "dive",
    activeSectionId: "skills",
    hoveredSectionId: null,
    reducedMotion: false
  });
});

test("completing dive enters focus state", () => {
  assert.equal(completeDive(selectSection(createInitialState(), "contact")).mode, "focus");
});

test("return flow moves back to orbit", () => {
  const focused = completeDive(selectSection(createInitialState(), "experience"));
  assert.equal(startReturn(focused).mode, "returning");
  assert.deepEqual(completeReturn(startReturn(focused)), {
    mode: "orbit",
    activeSectionId: null,
    hoveredSectionId: null,
    reducedMotion: false
  });
});

test("hash parsing accepts approved sections", () => {
  assert.equal(getSectionIdFromHash("#projects"), "projects");
  assert.equal(getSectionIdFromHash("#not-real"), null);
  assert.equal(getSectionIdFromHash(""), null);
});
```

- [ ] **Step 2: Run the state test to verify it fails**

Run:

```powershell
npm.cmd test
```

Expected: FAIL with `Cannot find module` for `src/state.js`.

- [ ] **Step 3: Implement state helpers**

Create `src/state.js`:

```js
import { SECTION_IDS } from "./content.js";

export function createInitialState({ reducedMotion = false } = {}) {
  return {
    mode: reducedMotion ? "orbit" : "intro",
    activeSectionId: null,
    hoveredSectionId: null,
    reducedMotion
  };
}

export function isKnownSection(id) {
  return SECTION_IDS.includes(id);
}

export function setHoveredSection(state, sectionId) {
  if (sectionId !== null && !isKnownSection(sectionId)) {
    throw new Error(`Cannot hover unknown section: ${sectionId}`);
  }
  return {
    ...state,
    hoveredSectionId: sectionId
  };
}

export function selectSection(state, sectionId) {
  if (!isKnownSection(sectionId)) {
    throw new Error(`Cannot select unknown section: ${sectionId}`);
  }
  return {
    ...state,
    mode: state.reducedMotion ? "focus" : "dive",
    activeSectionId: sectionId,
    hoveredSectionId: null
  };
}

export function completeDive(state) {
  if (state.mode !== "dive" || !state.activeSectionId) {
    return state;
  }
  return {
    ...state,
    mode: "focus"
  };
}

export function startReturn(state) {
  if (state.mode !== "focus" || !state.activeSectionId) {
    return state;
  }
  return {
    ...state,
    mode: state.reducedMotion ? "orbit" : "returning"
  };
}

export function completeReturn(state) {
  return {
    mode: "orbit",
    activeSectionId: null,
    hoveredSectionId: null,
    reducedMotion: state.reducedMotion
  };
}

export function getSectionIdFromHash(hash) {
  const normalized = hash.replace(/^#/, "").trim().toLowerCase();
  return isKnownSection(normalized) ? normalized : null;
}
```

- [ ] **Step 4: Run tests to verify green**

Run:

```powershell
npm.cmd test
```

Expected: content and state tests pass.

- [ ] **Step 5: Commit Task 4**

```powershell
git add tests/state.test.mjs src/state.js
git commit -m "Add singularity navigation state"
```

## Task 5: UI Rendering

**Files:**
- Create: `tests/ui.test.mjs`
- Create: `src/ui.js`

- [ ] **Step 1: Write the failing UI test**

Create `tests/ui.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { CONTACT_LINKS, PROFILE, sections } from "../src/content.js";
import { escapeHtml, renderContactLinks, renderOrbitControls, renderProfile, renderSectionPanel } from "../src/ui.js";

test("escapeHtml protects rendered templates", () => {
  assert.equal(escapeHtml("<script>alert('x')</script>"), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
});

test("renderProfile includes hero copy", () => {
  const html = renderProfile(PROFILE);
  assert.ok(html.includes("Bayar T."));
  assert.ok(html.includes("Cloud App Dev @ AWS | 9x AWS Certified"));
  assert.ok(html.includes("I love solving problems."));
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

test("renderContactLinks includes every contact target", () => {
  const html = renderContactLinks(CONTACT_LINKS);
  assert.ok(html.includes("https://www.linkedin.com/in/bayar-t/"));
  assert.ok(html.includes("https://huggingface.co/bayarr"));
});
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run:

```powershell
npm.cmd test
```

Expected: FAIL with `Cannot find module` for `src/ui.js`.

- [ ] **Step 3: Implement UI renderers**

Create `src/ui.js` with these exports:

```js
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
  return tags.length ? `<ul class="tag-list">${tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>` : "";
}

function renderSummary(lines = []) {
  return `<ul class="summary-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
}

function renderItem(item) {
  const link = item.href ? `<a class="section-link" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">Open source</a>` : "";
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

export function renderSectionPanel(section) {
  const body = section.id === "skills"
    ? renderSkills(section)
    : section.id === "contact"
      ? renderContactLinks(section.links)
      : section.items.map(renderItem).join("");

  return `<section class="content-panel" id="section-${escapeHtml(section.id)}" data-section-panel="${escapeHtml(section.id)}" aria-labelledby="section-title-${escapeHtml(section.id)}" hidden>
  <button class="back-button" type="button" data-action="back-to-orbit">Back to orbit</button>
  <p class="section-kicker">${escapeHtml(section.label)}</p>
  <h2 id="section-title-${escapeHtml(section.id)}">${escapeHtml(section.preview)}</h2>
  <div class="section-body">${body}</div>
</section>`;
}
```

- [ ] **Step 4: Run tests to verify green**

Run:

```powershell
npm.cmd test
```

Expected: content, state, and UI tests pass.

- [ ] **Step 5: Commit Task 5**

```powershell
git add tests/ui.test.mjs src/ui.js
git commit -m "Add accessible portfolio UI renderers"
```

## Task 6: Scene Configuration

**Files:**
- Create: `tests/structure.test.mjs`
- Create: `src/scene-config.js`

- [ ] **Step 1: Write the failing structure/config test**

Create `tests/structure.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NODE_LAYOUT, PACKAGE_VERSIONS, PERFORMANCE_LIMITS, TRANSITIONS } from "../src/scene-config.js";

test("scene config records approved package versions", () => {
  assert.deepEqual(PACKAGE_VERSIONS, {
    vite: "8.0.16",
    three: "0.184.0",
    gsap: "3.15.0"
  });
});

test("node layout defines five stable orbit nodes", () => {
  assert.deepEqual(NODE_LAYOUT.map((node) => node.id), ["experience", "projects", "skills", "education", "contact"]);
  assert.ok(NODE_LAYOUT.every((node) => Number.isFinite(node.radius)));
  assert.ok(NODE_LAYOUT.every((node) => Number.isFinite(node.speed)));
});

test("performance limits cover low-end device tuning", () => {
  assert.equal(PERFORMANCE_LIMITS.maxPixelRatio, 2);
  assert.equal(PERFORMANCE_LIMITS.desktopStars, 1200);
  assert.equal(PERFORMANCE_LIMITS.mobileStars, 520);
});

test("transition config includes Igloo-inspired effects", () => {
  assert.ok(TRANSITIONS.introMs > 0);
  assert.ok(TRANSITIONS.diveMs > 0);
  assert.deepEqual(TRANSITIONS.effects, ["chromatic-aberration", "tech-displacement", "gravitational-warp"]);
});

test("package json uses Vite, Three.js, and GSAP", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.dependencies.three, "0.184.0");
  assert.equal(pkg.dependencies.gsap, "3.15.0");
  assert.equal(pkg.devDependencies.vite, "8.0.16");
});
```

- [ ] **Step 2: Run the structure test to verify it fails**

Run:

```powershell
npm.cmd test
```

Expected: FAIL with `Cannot find module` for `src/scene-config.js`.

- [ ] **Step 3: Implement scene configuration**

Create `src/scene-config.js`:

```js
export const PACKAGE_VERSIONS = {
  vite: "8.0.16",
  three: "0.184.0",
  gsap: "3.15.0"
};

export const NODE_LAYOUT = [
  { id: "experience", radius: 5.8, speed: 0.18, phase: 0.1, y: 0.35, color: "#78d7ff" },
  { id: "projects", radius: 6.7, speed: 0.13, phase: 1.4, y: -0.2, color: "#b6a3ff" },
  { id: "skills", radius: 5.1, speed: 0.22, phase: 2.55, y: 0.7, color: "#ffcc73" },
  { id: "education", radius: 7.3, speed: 0.11, phase: 3.8, y: -0.55, color: "#8fffe0" },
  { id: "contact", radius: 6.1, speed: 0.16, phase: 5.05, y: 0.05, color: "#ff8fc7" }
];

export const COLORS = {
  void: "#03050d",
  eventHorizon: "#000000",
  accretionWarm: "#ff9e44",
  accretionCool: "#7ed7ff",
  orbitLine: "#6fb7ff",
  text: "#f7fbff"
};

export const PERFORMANCE_LIMITS = {
  maxPixelRatio: 2,
  desktopStars: 1200,
  mobileStars: 520,
  mobileBreakpoint: 760
};

export const TRANSITIONS = {
  introMs: 2200,
  diveMs: 1400,
  returnMs: 900,
  effects: ["chromatic-aberration", "tech-displacement", "gravitational-warp"]
};
```

- [ ] **Step 4: Run tests to verify green**

Run:

```powershell
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 6**

```powershell
git add tests/structure.test.mjs src/scene-config.js
git commit -m "Add singularity scene configuration"
```

## Task 7: Vite Shell And Styling

**Files:**
- Modify: `index.html`
- Create: `src/styles.css`
- Modify: `tests/structure.test.mjs`
- Delete after replacement: `assets/css/styles.css`, `assets/js/main.js`

- [ ] **Step 1: Extend the structure test for shell and CSS**

Append to `tests/structure.test.mjs`:

```js
test("index contains the Vite app shell", () => {
  const html = readFileSync("index.html", "utf8");
  assert.ok(html.includes('<main id="app"'));
  assert.ok(html.includes('id="singularity-stage"'));
  assert.ok(html.includes('id="singularity-canvas"'));
  assert.ok(html.includes('id="orbit-controls"'));
  assert.ok(html.includes('id="section-panels"'));
  assert.ok(html.includes('type="module" src="/src/main.js"'));
});

test("CSS contains required visual, fallback, and responsive selectors", () => {
  const css = readFileSync("src/styles.css", "utf8");
  for (const selector of [
    ".app-shell",
    ".singularity-stage",
    "#singularity-canvas",
    ".orbit-node-button",
    ".content-panel",
    ".contact-particle-field",
    ".webgl-fallback",
    "@media (prefers-reduced-motion: reduce)",
    "@media (max-width: 760px)"
  ]) {
    assert.ok(css.includes(selector), `Missing selector ${selector}`);
  }
});
```

- [ ] **Step 2: Run the shell/CSS test to verify it fails**

Run:

```powershell
npm.cmd test
```

Expected: FAIL because `src/styles.css` and the Vite shell do not exist yet.

- [ ] **Step 3: Replace `index.html`**

Replace `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="dark" />
    <meta
      name="description"
      content="Bayar T. - Cloud App Dev at AWS, 9x AWS Certified, building a cinematic Three.js singularity portfolio."
    />
    <title>Bayar T. | Singularity Portfolio</title>
  </head>
  <body>
    <main id="app" class="app-shell" data-mode="intro">
      <div id="profile-root"></div>
      <section id="singularity-stage" class="singularity-stage" aria-label="Interactive singularity navigation">
        <canvas id="singularity-canvas" aria-hidden="true"></canvas>
        <div class="event-horizon" aria-hidden="true"></div>
        <nav id="orbit-controls" class="orbit-controls" aria-label="Portfolio sections"></nav>
      </section>
      <p id="webgl-status" class="system-status" aria-live="polite"></p>
      <p id="reduced-motion-note" class="system-status reduced-motion-note">
        Reduced motion is active: section changes use fades instead of camera dives.
      </p>
      <div id="section-panels" class="section-panels" aria-live="polite"></div>
    </main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `src/styles.css`**

Create `src/styles.css` with the complete visual system:

```css
:root {
  --bg: #03050d;
  --bg-2: #070b18;
  --text: #f7fbff;
  --muted: rgba(229, 242, 255, 0.72);
  --faint: rgba(229, 242, 255, 0.48);
  --cyan: #78d7ff;
  --violet: #a991ff;
  --amber: #ffb35b;
  --border: rgba(160, 210, 255, 0.18);
  --panel: rgba(6, 12, 28, 0.72);
  --panel-strong: rgba(10, 18, 38, 0.92);
  --shadow: 0 24px 90px rgba(0, 0, 0, 0.5);
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  min-height: 100vh;
  overflow: hidden;
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at 50% 48%, rgba(98, 168, 255, 0.16), transparent 24rem),
    radial-gradient(circle at 20% 15%, rgba(169, 145, 255, 0.14), transparent 22rem),
    linear-gradient(145deg, var(--bg), var(--bg-2) 52%, #010208);
}

button,
a {
  font: inherit;
}

:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 4px;
}

.app-shell {
  position: relative;
  min-height: 100vh;
  isolation: isolate;
}

.hero-copy {
  position: fixed;
  left: clamp(1rem, 4vw, 4.5rem);
  top: clamp(1rem, 5vh, 4rem);
  z-index: 4;
  width: min(34rem, calc(100vw - 2rem));
  pointer-events: none;
}

.profile-location,
.profile-headline,
.profile-about,
.section-kicker,
.section-meta,
.section-org,
.section-dates {
  margin: 0;
  color: var(--muted);
}

.profile-location {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

h1 {
  margin: 0.4rem 0 0;
  font-size: clamp(3rem, 9vw, 8.8rem);
  line-height: 0.86;
  letter-spacing: 0;
}

.profile-headline {
  margin-top: 0.8rem;
  font-size: clamp(1rem, 2vw, 1.35rem);
  font-weight: 800;
  color: rgba(247, 251, 255, 0.94);
}

.profile-about {
  margin-top: 0.45rem;
}

.profile-skills,
.tag-list,
.summary-list,
.contact-links {
  margin: 0;
  padding: 0;
  list-style: none;
}

.profile-skills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.85rem;
}

.profile-skills li,
.tag-list li {
  border: 1px solid rgba(120, 215, 255, 0.22);
  border-radius: 999px;
  padding: 0.34rem 0.58rem;
  color: rgba(247, 251, 255, 0.82);
  font-size: 0.78rem;
}

.singularity-stage,
#singularity-canvas {
  position: fixed;
  inset: 0;
}

#singularity-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.event-horizon {
  position: fixed;
  left: 50%;
  top: 50%;
  width: min(32vw, 25rem);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, #000 0 38%, rgba(0, 0, 0, 0.86) 43%, rgba(255, 150, 54, 0.35) 48%, transparent 62%);
  filter: blur(0.4px) drop-shadow(0 0 3.5rem rgba(255, 157, 80, 0.42));
  opacity: 0;
  transition: opacity 420ms var(--ease);
  pointer-events: none;
  z-index: 1;
}

.webgl-fallback .event-horizon {
  opacity: 1;
}

.orbit-controls {
  position: fixed;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.orbit-node-button {
  position: fixed;
  left: var(--node-x, 50%);
  top: var(--node-y, 50%);
  min-width: 10rem;
  max-width: min(18rem, 42vw);
  padding: 0.76rem 0.9rem;
  transform: translate(-50%, -50%);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  color: var(--text);
  background: rgba(3, 8, 20, 0.5);
  box-shadow: 0 0 2.5rem rgba(120, 215, 255, 0.12);
  backdrop-filter: blur(14px);
  cursor: pointer;
  pointer-events: auto;
  transition: transform 220ms var(--ease), border-color 220ms var(--ease), background 220ms var(--ease), opacity 220ms var(--ease);
}

.orbit-node-button:hover,
.orbit-node-button:focus-visible,
.orbit-node-button[aria-selected="true"] {
  transform: translate(-50%, -50%) scale(1.06);
  border-color: rgba(120, 215, 255, 0.72);
  background: rgba(9, 18, 42, 0.8);
}

.node-label {
  display: block;
  font-size: 0.95rem;
  font-weight: 800;
}

.node-preview {
  display: block;
  margin-top: 0.35rem;
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.35;
}

.node-pulse {
  position: absolute;
  left: -0.55rem;
  top: 50%;
  width: 0.62rem;
  height: 0.62rem;
  transform: translateY(-50%);
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 1.4rem currentColor;
}

.system-status {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  z-index: 6;
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}

.reduced-motion-note {
  display: none;
}

.section-panels {
  position: fixed;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.content-panel {
  position: fixed;
  inset: clamp(1rem, 5vw, 4rem);
  overflow: auto;
  padding: clamp(1.2rem, 4vw, 3rem);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: linear-gradient(135deg, var(--panel-strong), var(--panel));
  box-shadow: var(--shadow);
  backdrop-filter: blur(24px);
  pointer-events: auto;
}

.content-panel[hidden] {
  display: none;
}

.back-button {
  border: 1px solid rgba(120, 215, 255, 0.38);
  border-radius: 999px;
  padding: 0.65rem 0.9rem;
  color: var(--text);
  background: rgba(120, 215, 255, 0.08);
  cursor: pointer;
}

.content-panel h2 {
  max-width: 58rem;
  margin: 1rem 0 1.5rem;
  font-size: clamp(1.8rem, 4vw, 4.6rem);
  line-height: 0.98;
  letter-spacing: 0;
}

.section-body {
  display: grid;
  gap: 1rem;
}

.section-card,
.skill-group {
  padding: 1rem;
  border: 1px solid rgba(160, 210, 255, 0.14);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.035);
}

.section-card-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.section-card h3,
.skill-group h3 {
  margin: 0;
  font-size: 1.05rem;
}

.summary-list {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.8rem;
  color: rgba(247, 251, 255, 0.84);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.8rem;
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
}

.contact-links {
  display: grid;
  gap: 0.8rem;
}

.contact-links a,
.section-link {
  color: var(--cyan);
}

.contact-particle-field {
  min-height: 14rem;
  border: 1px solid rgba(120, 215, 255, 0.16);
  border-radius: 0.5rem;
  background: radial-gradient(circle at center, rgba(120, 215, 255, 0.12), transparent 70%);
}

@media (max-width: 760px) {
  body {
    overflow: auto;
  }

  .hero-copy {
    position: relative;
    left: auto;
    top: auto;
    padding: 1rem;
  }

  .orbit-node-button {
    position: absolute;
    left: 50%;
    top: calc(54% + (var(--node-index) - 2) * 5.1rem);
    width: min(22rem, calc(100vw - 2rem));
    transform: translate(-50%, -50%);
  }

  .content-panel {
    inset: 0.75rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }

  .reduced-motion-note {
    display: block;
  }
}
```

- [ ] **Step 5: Remove old static assets**

Run:

```powershell
Remove-Item -LiteralPath assets\css\styles.css
Remove-Item -LiteralPath assets\js\main.js
```

Expected: the obsolete PS3 XMB assets are removed after their replacements exist in `src/`.

- [ ] **Step 6: Run tests to verify green**

Run:

```powershell
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 7: Commit Task 7**

```powershell
git add index.html src/styles.css tests/structure.test.mjs
git rm assets/css/styles.css assets/js/main.js
git commit -m "Add Vite shell and singularity styling"
```

## Task 8: Three.js And GSAP Scene

**Files:**
- Create: `src/scene.js`

- [ ] **Step 1: Implement scene module**

Create `src/scene.js` exporting:

```js
export function supportsWebGL() {}
export function computeNodePosition(layout, time, reducedMotion = false) {}
export function createSingularityScene(options) {}
```

Implementation requirements:

- Import `* as THREE from "three"` and `{ gsap } from "gsap"`.
- Use `PERFORMANCE_LIMITS`, `NODE_LAYOUT`, `COLORS`, and `TRANSITIONS` from `scene-config.js`.
- Build `WebGLRenderer`, `PerspectiveCamera`, `Scene`, starfield `Points`, dark event-horizon sphere, emissive accretion rings, thin orbit lines, and node meshes.
- Use GSAP timelines for intro, dive, focus, and return transitions.
- Use a lightweight chromatic-aberration/tech-displacement cue through material uniforms or CSS classes during dive transitions.
- Update CSS variables `--node-x` and `--node-y` on matching `.orbit-node-button` elements from projected node positions.
- Use raycasting for pointer selection of node meshes.
- Render contact-mode particles that swirl and re-form around active contact links.
- Expose `start()`, `stop()`, `resize()`, `setHoveredSection(id)`, `selectSection(id)`, `focusSection(id)`, `returnToOrbit()`, and `dispose()`.

The helper functions must include:

```js
import * as THREE from "three";
import { gsap } from "gsap";
import { COLORS, NODE_LAYOUT, PERFORMANCE_LIMITS, TRANSITIONS } from "./scene-config.js";

export function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export function computeNodePosition(layout, time, reducedMotion = false) {
  const speed = reducedMotion ? layout.speed * 0.18 : layout.speed;
  const angle = layout.phase + time * speed;
  return {
    x: Math.cos(angle) * layout.radius,
    y: layout.y + Math.sin(angle * 0.7) * 0.35,
    z: Math.sin(angle) * layout.radius
  };
}
```

- [ ] **Step 2: Add scene helper coverage to `tests/structure.test.mjs`**

Append:

```js
test("scene helper computes deterministic reduced-motion node positions", async () => {
  const { computeNodePosition } = await import("../src/scene.js");
  const normal = computeNodePosition(NODE_LAYOUT[0], 10, false);
  const reduced = computeNodePosition(NODE_LAYOUT[0], 10, true);
  assert.notDeepEqual(normal, reduced);
  assert.ok(Number.isFinite(normal.x));
  assert.ok(Number.isFinite(normal.y));
  assert.ok(Number.isFinite(normal.z));
});
```

- [ ] **Step 3: Run tests and build**

Run:

```powershell
npm.cmd test
npm.cmd build
```

Expected: tests pass and Vite builds `dist/` without errors.

- [ ] **Step 4: Commit Task 8**

```powershell
git add src/scene.js tests/structure.test.mjs dist
git commit -m "Add Three.js singularity scene"
```

## Task 9: App Bootstrap

**Files:**
- Create: `src/main.js`

- [ ] **Step 1: Implement app bootstrap**

Create `src/main.js`:

- Import `./styles.css`.
- Import content, state helpers, UI helpers, scene config, and scene controller.
- Render profile, orbit controls, and all section panels.
- Detect `prefers-reduced-motion`.
- Create initial state.
- Start the Three.js scene when `supportsWebGL()` returns true.
- Apply `.webgl-fallback` and show `#webgl-status` when WebGL setup fails.
- Bind click, mouseenter, mouseleave, focus, blur, Enter, Space, Escape, and Back to orbit.
- Update URL hash on section focus.
- Open a section from initial URL hash.
- Keep `aria-selected` and `[hidden]` synchronized.

Required import block:

```js
import "./styles.css";
import { PROFILE, getSectionById, sections } from "./content.js";
import {
  completeDive,
  completeReturn,
  createInitialState,
  getSectionIdFromHash,
  selectSection,
  setHoveredSection,
  startReturn
} from "./state.js";
import { renderOrbitControls, renderProfile, renderSectionPanel } from "./ui.js";
import { TRANSITIONS } from "./scene-config.js";
import { createSingularityScene, supportsWebGL } from "./scene.js";
```

- [ ] **Step 2: Extend structure test for main imports**

Append to `tests/structure.test.mjs`:

```js
test("main app imports styles, content, state, UI, and scene modules", () => {
  const source = readFileSync("src/main.js", "utf8");
  for (const fragment of [
    'import "./styles.css"',
    'from "./content.js"',
    'from "./state.js"',
    'from "./ui.js"',
    'from "./scene.js"'
  ]) {
    assert.ok(source.includes(fragment), `Missing import fragment ${fragment}`);
  }
});
```

- [ ] **Step 3: Run tests and build**

Run:

```powershell
npm.cmd test
npm.cmd build
```

Expected: tests pass and Vite builds without errors.

- [ ] **Step 4: Commit Task 9**

```powershell
git add src/main.js tests/structure.test.mjs dist
git commit -m "Wire singularity portfolio app"
```

## Task 10: Browser Verification And Polish

**Files:**
- Modify implementation files only when verification finds concrete issues.

- [ ] **Step 1: Start local dev server**

Run:

```powershell
npm.cmd run dev
```

Expected: Vite serves the app at `http://127.0.0.1:5173/`.

- [ ] **Step 2: Open in Browser/IAB**

Open:

```text
http://127.0.0.1:5173/
```

Verify:

- No console errors.
- Canvas is nonblank.
- A dark cinematic singularity is visible.
- Intro flows into the orbit state.
- Five orbit node controls are visible and readable.
- Hero copy reads `Bayar T.` and `Cloud App Dev @ AWS | 9x AWS Certified`.

- [ ] **Step 3: Verify node interactions**

Click each node:

- Experience includes Cloud App Developer and Associate Cloud App Developer.
- Projects includes OpenSearch Traffic Gateway and A* Path Finding.
- Skills includes 9x AWS Certified and cloud/data skills.
- Education includes UC San Diego.
- Contact includes LinkedIn, GitHub, Hugging Face, Website, and Repository.

For each section, Back to orbit returns to the orbit view.

- [ ] **Step 4: Verify keyboard interaction**

Use Tab, Enter, Space, and Escape:

- Tab reaches every node.
- Enter and Space select the focused node.
- Escape returns from a focused section to orbit.
- Focus does not get trapped inside hidden panels.

- [ ] **Step 5: Verify responsive behavior**

Check:

- Desktop: `1280x720`
- Mobile: `390x844`

Verify:

- No clipped primary text.
- Orbit controls are tappable on mobile.
- Section content scrolls on mobile.
- Back to orbit remains reachable.

- [ ] **Step 6: Verify reduced motion**

Use browser motion emulation when available. Verify:

- Intro is skipped or shortened.
- Section changes use fades instead of large camera dives.
- All content remains accessible.

- [ ] **Step 7: Run final checks**

Run:

```powershell
npm.cmd test
npm.cmd build
```

Expected: both commands pass.

- [ ] **Step 8: Commit verification fixes**

If verification required fixes:

```powershell
git add index.html src tests package.json package-lock.json vite.config.js dist
git commit -m "Polish singularity portfolio verification"
```

Do not create an empty commit when no files changed.

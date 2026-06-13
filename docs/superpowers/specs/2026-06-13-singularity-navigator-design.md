# Singularity Navigator Design

## Goal

Transform the current static resume site into a full-screen Three.js portfolio where a cinematic black-hole singularity is the primary navigation object. The site should feel inspired by the quiet, immersive quality of igloo.inc, but use a darker deep-space identity with a stronger "wow" factor.

## Approved Direction

Use the Interactive Singularity Navigator approach:

- A full-screen 3D scene is the first and primary experience.
- A black hole sits at the center with a bright accretion ring, starfield depth, subtle gravitational-lensing style distortion, and faint technical orbit lines.
- Five orbiting nodes represent the main sections: Experience, Projects, Skills, Education, and Contact.
- Selecting a node triggers a camera dive into that node. The selected node becomes the full section view.
- A Back to orbit control returns to the singularity navigation state.

## Visual Design

The mood is dark cinematic space rather than pale laboratory visualization. The scene should use a near-black background, blue-white stars, electric cyan and violet highlights, and warm accretion-ring light around the singularity. The interface chrome should remain restrained so the 3D object carries the page.

The design should retain a technical feel from the reference site through thin wireframe arcs, small orbital guide marks, and precise labels. It should not become a dense sci-fi dashboard. Text should be sparse on the orbit screen and more readable in focused section views.

## Interaction Model

The default state is Orbit:

- The singularity rotates slowly.
- The accretion disk flows continuously.
- Orbiting nodes move around the singularity at different depths.
- Mouse movement tilts the camera subtly.
- Hovering or focusing a node increases its glow, slows its orbit, and reveals its label with a short section preview.
- Keyboard users can tab through the same nodes.

The selected state is Dive:

- Clicking, pressing Enter, or pressing Space on a focused node starts a camera transition toward that node.
- Nearby stars stretch briefly to create a warp effect.
- The selected node expands into a full-screen section.
- Non-selected nodes fade back.
- The singularity remains visible as a dim background presence or edge glow.

The section state is Focus:

- The selected section is readable and navigable.
- Back to orbit returns to the default navigation state.
- Escape also returns to orbit.
- Direct section navigation updates accessible state and does not trap keyboard focus.

## Content

Hero/profile copy should use verified profile facts from the user-supplied LinkedIn profile URL and public profile metadata:

- LinkedIn URL: https://www.linkedin.com/in/bayar-t/
- Public profile headline: Cloud App Dev @ AWS | 8x AWS Certified.
- Current organization signal: Amazon Web Services.
- Education signal: University of California, San Diego.
- Location signal: Sacramento, California, United States.

Experience uses the current resume entries:

- Amazon Web Services, Associate Cloud App Developer, Nov 2022 to Present.
- Virtusa contract to Fidelity Investments, Software Engineer, Jan 2022 to Nov 2022.
- Infosys contract to Zelle, Software Engineer, Oct 2020 to Nov 2021.
- Mova Globes, Intern, Aug 2018 to Oct 2018.

Skills uses the current skill list grouped into useful clusters:

- Languages: Java, C/C++, Python, HTML, CSS, JavaScript, SQL, ARM, Haskell, R.
- Tools and platforms: Git, GitLab, Docker, Angular, Gradle, Postman.
- APIs and cloud: REST API, SOAP API, AWS.
- Testing and quality: Veracode, JMeter, Gatling.
- Languages spoken: English.

Education uses the current entries:

- UC San Diego, B.S. in Mathematics - Computer Science, Aug 2015 to June 2020.
- Inderkum High School, Aug 2011 to May 2015.

Projects v1 includes one polished project entry for this portfolio rebuild:

- Singularity Portfolio: an interactive Three.js portfolio navigation system for Bayar Tsogtbaatar.

Contact v1 includes:

- LinkedIn link: https://www.linkedin.com/in/bayar-t/
- GitHub link: https://github.com/BayarTsogtbaatar
- GitHub Pages repository link: https://github.com/BayarTsogtbaatar/BayarTsogtbaatar.github.io
- No fabricated email. Add email only after the user supplies an exact target.

## Architecture

Keep the site deployable as a static GitHub Pages project. Preserve the current broad file structure unless implementation proves it needs more separation:

- `index.html` contains semantic fallback content, the WebGL mount, and accessible controls.
- `assets/css/styles.css` contains layout, typography, responsive states, reduced-motion styles, and section overlays.
- `assets/js/main.js` owns app state, Three.js scene setup, animation, input handling, section transitions, and fallback behavior.

Use Three.js for the 3D scene. V1 loads Three.js from a CDN using ES modules to keep the static GitHub Pages setup simple. Vendor the library locally in `assets/vendor/` only if CDN loading fails during verification.

The JavaScript should be organized into clear units:

- Content data for nodes and section copy.
- Scene creation for renderer, camera, lights, singularity, stars, orbit lines, and nodes.
- Interaction controller for pointer, keyboard, hover, focus, selection, and back navigation.
- Transition controller for orbit, dive, focus, and return states.
- Accessibility and fallback helpers.

## Data Flow

Section content should be represented as structured JavaScript data. The orbit nodes are derived from that data so labels, section ids, keyboard controls, and detail views stay in sync.

The app state should have a small explicit state machine:

- `orbit`: all nodes available, no active section.
- `dive`: transition in progress for one node.
- `focus`: one active section is open.
- `returning`: transition back to orbit.

State changes update:

- The Three.js camera target and node emphasis.
- The visible HTML section.
- ARIA state for selected nodes and active content.
- URL hash when entering a focused section, so direct links to sections can work.

## Responsive Behavior

Desktop should prioritize cinematic depth and mouse interaction. Mobile should keep the same concept but reduce motion and complexity:

- Nodes orbit at a slower mobile speed and use larger tap targets.
- Labels must remain readable without hover.
- Section content should use a single-column layout.
- The Back to orbit control must remain reachable.
- The 3D scene should cap pixel ratio and particle count for performance.

## Accessibility And Fallbacks

The site must remain usable without WebGL:

- Show a high-quality static space background using CSS gradients or a lightweight canvas fallback.
- Render the same five sections as accessible HTML navigation.
- Keep all resume content available.

Respect `prefers-reduced-motion`:

- Disable camera dives and star streaks.
- Use short fades instead of large motion.
- Keep the singularity either static or very slow.

Keyboard support:

- Tab reaches all nodes and the Back to orbit control.
- Enter and Space select the focused node.
- Escape returns from a focused section to orbit.

## Testing And Verification

Implementation is complete only when these checks pass:

- The site loads locally without console errors.
- The Three.js canvas renders a nonblank singularity scene on desktop.
- All five nodes are visible, selectable, and keyboard accessible.
- Selecting each node performs a transition and reveals the correct section content.
- Back to orbit and Escape return to the orbit state.
- Reduced-motion mode still exposes the full site without large camera movement.
- WebGL fallback still exposes all sections.
- Desktop and mobile viewport checks show no clipped primary text or unusable controls.

## Non-Goals For V1

- No backend.
- No CMS.
- No fabricated contact information.
- No unrelated rewrite to React or Vite unless implementation shows the static setup blocks the approved interaction.
- No large marketing page below the 3D experience.

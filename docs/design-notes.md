# Spotiswipe interface redesign

The redesign treats Spotiswipe as a listening application: music and keep/pass decisions come first, with recommendation diagnostics available in the Personalize lab.

## Research and direction

Applied the existing-project redesign, frontend-design, responsive adaptation, animation and polish skills. The existing creator context established music listeners and faculty as the two audiences, with a playful, curious, dark record-store identity. The redesign keeps that identity while replacing the oversized introductory layout with a compact workspace.

The accessibility review used W3C's [focus-not-obscured guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum) and [WCAG 2.2](https://www.w3.org/TR/WCAG22/). The fixed navigation and player make focus visibility and adequate scroll padding particularly relevant. This is a focused engineering review, not a formal accessibility certification.

## What changed and why

| Previous issue                                                  | Implemented change                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Large introduction pushed music controls below the fold         | Compact heading and a sleeve-and-track layout; measured controls against the player on laptop and phone |
| Repeated record illustration made the catalog indistinguishable | Sixteen original geometric SVG sleeves, carried into tracks, saved mixes and the player                 |
| Phone navigation required horizontal scanning at the top        | Persistent five-destination bottom navigation, with the same page names and active state                |
| Audio controls appeared and disappeared without a stable home   | Persistent player with an idle state, preview transport, seeking, current artwork and volume controls   |
| Profile controls consumed discovery space                       | Header profile menu; creating listeners remains available on phones and tablets                         |
| Too many taste details competed with the track                  | Preference chips first; taste breakdown and recommendation math expand on demand                        |
| Mix settings and output lacked clear separation                 | Dedicated settings column, illustrated empty state, artwork track list and optional baseline comparison |
| Saved mixes had no visual identity                              | Track-artwork mosaics, clear playback/open actions, and a separate detail panel                         |
| Swipe gestures changed state without showing direction          | Drag-following sleeve with Keep/Pass stamps, then a short exit and replacement transition               |
| Fonts depended on system availability                           | Locally bundled Manrope and its license; fonts, sleeves and application modules are precached           |

The original service, recommendation algorithm, model snapshots and storage schema remain in place. Changes to interaction code are limited to presentation, profile-menu behavior, genre exploration, volume controls, routing focus and gesture feedback.

## Visual system

- Ink background `#161815`, olive-neutral surfaces and warm off-white text.
- Lime `#d3e99a` for primary playback, selected states and focus.
- Manrope weights 400, 600 and 800, loaded locally.
- One original line-icon family and four genre-specific sleeve treatments.
- Short transform/opacity transitions; reduced-motion users receive immediate state changes.

Measured text contrast: main text/background 15.63:1; secondary text/panel 7.68:1; subdued text/panel 4.73:1; primary-button text/fill 10.52:1. These checks cover the principal text tokens, not every possible imported-content combination.

## Verification

- 29 existing behavioral, model-lifecycle, audio-engagement and HTTP tests pass.
- JavaScript syntax, static build, unique HTML IDs and referenced/precache assets checked.
- Browser: preview playback, keep, undo, pointer swipe, mix generation, save/library view, profile panel and mobile model training.
- Responsive: 320 px lab, 390 px discovery and 768 px production-build discovery have no page-level horizontal overflow. The 390 × 844 discovery controls sit above the persistent player.
- Fonts and all visible sleeve images load in the production build at a repository-style subdirectory URL. They remain available after stopping the test server and reloading through the service worker.
- Physical iOS/Android devices and a complete screen-reader audit were not available for this pass.

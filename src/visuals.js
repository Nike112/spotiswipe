import { CATALOG } from "./catalog.js";
const covers = new Set(CATALOG.map((t) => t.id));
export const coverPath = (track) =>
  covers.has(track?.id) ? `assets/covers/${track.id}.svg` : "assets/icon.svg";
const paths = {
  discover: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>',
  mix: '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/>',
  library: '<path d="M4 4v16M9 4v16m5-15 5 14M3 4h3M8 4h3"/>',
  lab: '<path d="M9 3h6m-5 0v6L4 19q-1 2 2 2h12q3 0 2-2L14 9V3M7 15h10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  play: '<path d="m9 5 11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  heart:
    '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-4 4 1 9 8 15 7-6 12-11 8-15Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  undo: '<path d="M4 5v6h6M4 11c2-7 14-7 15 1 1 6-6 10-11 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  "arrow-up": '<path d="M6 18 18 6M6 6h12v12"/>',
  headphones:
    '<path d="M4 15v-3a8 8 0 0 1 16 0v3M4 13h3v7H4q-2 0-2-2v-3q0-2 2-2Zm16 0h-3v7h3q2 0 2-2v-3q0-2-2-2Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  previous: '<path d="M5 5v14m13-14L8 12l10 7z"/>',
  next: '<path d="M19 5v14M6 5l10 7-10 7z"/>',
  volume:
    '<path d="m11 4-5 5H2v6h4l5 5zM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
};
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.play}</svg>`;
}

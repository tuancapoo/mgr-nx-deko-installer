// Simple SVG flags of the language picker . From nfsmw-nx-installer's flags.js.

const stripesH = (colors) =>
  `<svg viewBox="0 0 3 2" preserveAspectRatio="none">${colors
    .map((c, i) => `<rect y="${(2 / colors.length) * i}" width="3" height="${2 / colors.length}" fill="${c}"/>`)
    .join('')}</svg>`;
const stripesV = (colors) =>
  `<svg viewBox="0 0 3 2" preserveAspectRatio="none">${colors
    .map((c, i) => `<rect x="${(3 / colors.length) * i}" width="${3 / colors.length}" height="2" fill="${c}"/>`)
    .join('')}</svg>`;

export const FLAGS = {
  vietnam:
    '<svg viewBox="0 0 30 20" preserveAspectRatio="none"><rect width="30" height="20" fill="#da251d"/>' +
    '<polygon fill="#ffff00" points="15,4 16.76,9.43 22.47,9.43 17.85,12.79 19.62,18.22 15,14.86 10.38,18.22 12.15,12.79 7.53,9.43 13.24,9.43"/></svg>',
  uk:
    '<svg viewBox="0 0 60 30"><clipPath id="uk-clip"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>' +
    '<rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/>' +
    '<path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#uk-clip)" stroke="#c8102e" stroke-width="4"/>' +
    '<path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#c8102e" stroke-width="6"/></svg>',
  japan: '<svg viewBox="0 0 3 2"><rect width="3" height="2" fill="#fff"/><circle cx="1.5" cy="1" r="0.6" fill="#bc002d"/></svg>',
  france: stripesV(['#0055a4', '#fff', '#ef4135']),
  germany: stripesH(['#000', '#dd0000', '#ffce00']),
  spain:
    '<svg viewBox="0 0 750 500"><rect width="750" height="500" fill="#c60b1e"/>' +
    '<rect y="125" width="750" height="250" fill="#ffc400"/></svg>',
  italy: stripesV(['#009246', '#fff', '#ce2b37']),
};

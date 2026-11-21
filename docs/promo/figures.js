// Original sample art for "Aria" (not based on any existing character):
// a chibi sticker and a full-body portrait, both SVG with transparent backgrounds.
const P = { hair: '#ff9a4d', hairD: '#e0662a', hairL: '#ffc48a', eye: '#2fd6c4', eyeD: '#0d5c57', skin: '#ffe6d8', skinS: '#f6c7b2', dress: '#fff6ee', dressS: '#f1dccb', accent: '#ff7a2f', gold: '#ffd36b', dark: '#3a2a3a' };

function face(cx, cy, s, id) {
  // s = head radius
  const ex = s * 0.42, ey = s * 0.08, er = s * 0.24;
  return `
  <ellipse cx="${cx}" cy="${cy}" rx="${s}" ry="${s * 1.05}" fill="url(#${id}sk)"/>
  ${[-1, 1].map(d => `
    <ellipse cx="${cx + d * ex}" cy="${cy + ey}" rx="${er}" ry="${er * 1.25}" fill="#fff"/>
    <ellipse cx="${cx + d * ex}" cy="${cy + ey + er * 0.18}" rx="${er * 0.8}" ry="${er * 1.08}" fill="url(#${id}ir)"/>
    <ellipse cx="${cx + d * ex}" cy="${cy + ey + er * 0.25}" rx="${er * 0.36}" ry="${er * 0.5}" fill="${P.eyeD}"/>
    <ellipse cx="${cx + d * ex - er * 0.3}" cy="${cy + ey - er * 0.35}" rx="${er * 0.3}" ry="${er * 0.36}" fill="#fff"/>
    <circle cx="${cx + d * ex + er * 0.32}" cy="${cy + ey + er * 0.62}" r="${er * 0.14}" fill="#fff" opacity=".85"/>
    <path d="M${cx + d * ex - d * er * 1.15} ${cy + ey - er * 0.7} Q ${cx + d * ex} ${cy + ey - er * 1.55} ${cx + d * ex + d * er * 1.05} ${cy + ey - er * 0.85}" stroke="#4a2a2a" stroke-width="${s * 0.07}" fill="none" stroke-linecap="round"/>
    <ellipse cx="${cx + d * ex * 1.25}" cy="${cy + s * 0.48}" rx="${s * 0.17}" ry="${s * 0.08}" fill="#ff8f8f" opacity=".45"/>`).join('')}
  <path d="M${cx - s * 0.14} ${cy + s * 0.6} Q ${cx} ${cy + s * 0.74} ${cx + s * 0.14} ${cy + s * 0.6}" stroke="#c2505f" stroke-width="${s * 0.05}" fill="none" stroke-linecap="round"/>`;
}
function defs(id) {
  return `<defs>
    <linearGradient id="${id}ir" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.eyeD}"/><stop offset=".6" stop-color="${P.eye}"/><stop offset="1" stop-color="#e9fffb"/></linearGradient>
    <linearGradient id="${id}sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.skin}"/><stop offset="1" stop-color="${P.skinS}"/></linearGradient>
    <linearGradient id="${id}hr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.hairL}"/><stop offset=".45" stop-color="${P.hair}"/><stop offset="1" stop-color="${P.hairD}"/></linearGradient>
    <linearGradient id="${id}dr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${P.dressS}"/></linearGradient>
  </defs>`;
}
function flower(x, y, r) {
  return `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="${r * 0.55}" ry="${r}" transform="rotate(${a}) translate(0 ${-r * 0.7})" fill="${P.accent}"/>`).join('')}<circle r="${r * 0.45}" fill="${P.gold}"/></g>`;
}

// Chibi: big head, tiny body (sticker above the card).
const chibi = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" width="480" height="600">${defs('c')}
  <path d="M40 120 C20 190 30 250 60 280 C80 290 160 290 180 280 C210 250 220 190 200 120 Z" fill="url(#chr)"/>
  <path d="M86 170 L154 170 L176 262 C150 276 90 276 64 262 Z" fill="url(#cdr)" stroke="${P.dressS}" stroke-width="2"/>
  <path d="M64 262 C90 276 150 276 176 262 L172 252 C150 264 90 264 68 252 Z" fill="${P.accent}"/>
  <path d="M100 172 L120 200 L140 172" fill="none" stroke="${P.accent}" stroke-width="5" stroke-linejoin="round"/>
  <rect x="96" y="262" width="14" height="26" rx="6" fill="${P.skin}"/><rect x="130" y="262" width="14" height="26" rx="6" fill="${P.skin}"/>
  <ellipse cx="103" cy="290" rx="12" ry="6" fill="${P.dark}"/><ellipse cx="137" cy="290" rx="12" ry="6" fill="${P.dark}"/>
  <ellipse cx="78" cy="214" rx="11" ry="22" fill="url(#cdr)" transform="rotate(20 78 214)"/><ellipse cx="162" cy="214" rx="11" ry="22" fill="url(#cdr)" transform="rotate(-20 162 214)"/>
  <rect x="100" y="196" width="40" height="30" rx="4" fill="${P.accent}"/><rect x="104" y="200" width="32" height="22" rx="3" fill="${P.gold}"/>
  <circle cx="96" cy="216" r="7" fill="${P.skin}"/><circle cx="144" cy="216" r="7" fill="${P.skin}"/>
  <path d="M40 100 C40 40 80 16 120 16 C160 16 200 40 200 100 L206 160 C190 150 180 140 172 120 L68 120 C60 140 50 150 34 160 Z" fill="url(#chr)"/>
  ${face(120, 112, 58, 'c')}
  <path d="M60 100 C58 52 90 34 120 34 C152 34 184 52 180 100 C168 80 156 70 140 64 C142 80 134 90 124 94 C122 78 114 66 104 60 C94 76 80 88 64 96 Z" fill="url(#chr)"/>
  <path d="M54 96 C40 140 44 190 60 230 L72 226 C62 186 60 140 66 104 Z M186 96 C200 140 196 190 180 230 L168 226 C178 186 180 140 174 104 Z" fill="url(#chr)"/>
  ${flower(170, 58, 12)}${flower(186, 82, 8)}
</svg>`;

// Full-body portrait: adult proportions, long flowing hair, layered gown.
const portrait = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 640" width="600" height="1280">${defs('p')}
  <path d="M96 70 C40 160 30 320 60 470 C70 520 40 560 30 600 C90 560 110 520 112 470 Z" fill="url(#phr)"/>
  <path d="M204 70 C260 160 270 320 240 470 C230 520 260 560 270 600 C210 560 190 520 188 470 Z" fill="url(#phr)"/>
  <path d="M138 140 L162 140 L166 198 L134 198 Z" fill="${P.skin}"/>
  <path d="M112 196 C112 186 188 186 188 196 L198 290 L102 290 Z" fill="url(#pdr)" stroke="${P.dressS}" stroke-width="2"/>
  <path d="M150 196 L150 290" stroke="${P.accent}" stroke-width="4"/>
  <path d="M102 284 L198 284 L246 560 C200 596 100 596 54 560 Z" fill="url(#pdr)" stroke="${P.dressS}" stroke-width="2"/>
  <path d="M120 290 L180 290 L214 556 C190 572 110 572 86 556 Z" fill="${P.accent}" opacity=".92"/>
  <path d="M54 560 C100 596 200 596 246 560 L240 540 C196 572 104 572 60 540 Z" fill="${P.accent}"/>
  ${[70, 110, 150, 190, 230].map(x => `<path d="M${x} 568 l6 18 l6 -18" fill="${P.gold}"/>`).join('')}
  <rect x="100" y="282" width="100" height="12" rx="6" fill="${P.gold}"/>
  <path d="M112 200 C92 230 86 270 96 300 L108 296 C102 270 108 236 124 212 Z" fill="url(#pdr)"/>
  <path d="M188 200 C208 230 214 270 204 300 L192 296 C198 270 192 236 176 212 Z" fill="url(#pdr)"/>
  <circle cx="104" cy="302" r="9" fill="${P.skin}"/><circle cx="196" cy="302" r="9" fill="${P.skin}"/>
  <rect x="132" y="584" width="14" height="38" rx="6" fill="${P.skin}"/><rect x="156" y="584" width="14" height="38" rx="6" fill="${P.skin}"/>
  <path d="M126 620 h26 v10 h-26 z M150 620 h26 v10 h-26 z" fill="${P.dark}"/>
  <path d="M92 90 C92 40 120 18 150 18 C180 18 208 40 208 90 L214 150 C200 140 192 128 186 112 L114 112 C108 128 100 140 86 150 Z" fill="url(#phr)"/>
  ${face(150, 100, 46, 'p')}
  <path d="M106 92 C104 54 128 38 150 38 C174 38 198 54 194 92 C186 76 176 68 164 62 C166 76 160 84 152 88 C150 74 144 64 136 58 C128 72 118 82 108 88 Z" fill="url(#phr)"/>
  <path d="M100 86 C88 140 90 210 104 270 L114 266 C104 210 104 146 110 96 Z M200 86 C212 140 210 210 196 270 L186 266 C196 210 196 146 190 96 Z" fill="url(#phr)"/>
  ${flower(196, 52, 11)}${flower(208, 74, 7)}${flower(98, 300, 6)}
</svg>`;
module.exports = { chibi, portrait };

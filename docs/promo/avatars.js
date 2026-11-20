// Original anime-style avatar generator (SVG). No existing characters are depicted.
function avatar({ id = 'a', bg1, bg2, hair, hairDark, eye, eyeDark, skin = '#ffe3d3', style = 'long', extra = '' }) {
  const back = {
    long: `<path d="M48 120 C40 60 80 26 128 26 C176 26 216 60 208 120 L222 236 L34 236 Z" fill="${hairDark}"/>`,
    bob: `<path d="M52 118 C46 62 84 30 128 30 C172 30 210 62 204 118 L206 184 C186 196 70 196 50 184 Z" fill="${hairDark}"/>`,
    hood: `<path d="M30 236 C26 120 60 30 128 22 C196 30 230 120 226 236 Z" fill="${hairDark}"/>`,
  }[style];
  const bangs = {
    long: `<path d="M62 116 C56 64 92 40 128 40 C166 40 202 64 196 116 C186 92 176 80 160 72 C162 90 156 100 148 106 C146 88 138 76 128 70 C120 82 108 96 92 104 C96 90 98 82 98 74 C80 86 70 100 62 116 Z" fill="${hair}"/>
           <path d="M60 112 C54 150 58 190 66 230 L84 230 C74 190 70 150 72 116 Z M196 112 C202 150 198 190 190 230 L172 230 C182 190 186 150 184 116 Z" fill="${hair}"/>`,
    bob: `<path d="M60 120 C54 66 90 42 128 42 C168 42 204 66 198 120 C190 98 180 86 168 78 C168 94 162 104 152 110 C150 92 140 80 128 74 C118 90 104 102 86 110 C90 96 92 86 90 78 C76 88 66 102 60 120 Z" fill="${hair}"/>
          <path d="M56 116 C52 146 54 170 62 186 L78 182 C70 160 70 140 72 120 Z M200 116 C204 146 202 170 194 186 L178 182 C186 160 186 140 184 120 Z" fill="${hair}"/>`,
    hood: `<path d="M64 118 C60 70 94 46 128 46 C164 46 198 70 194 118 C184 98 172 88 156 82 C150 96 140 104 126 108 C128 96 124 86 118 80 C104 92 86 104 64 118 Z" fill="${hair}"/>`,
  }[style];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="512" height="512">
  <defs>
    <radialGradient id="${id}bg" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient>
    <linearGradient id="${id}iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${eyeDark}"/><stop offset=".55" stop-color="${eye}"/><stop offset="1" stop-color="#ffffff" stop-opacity=".9"/></linearGradient>
    <linearGradient id="${id}skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="#f6c9b6"/></linearGradient>
    <clipPath id="${id}c"><circle cx="128" cy="128" r="128"/></clipPath>
  </defs>
  <g clip-path="url(#${id}c)">
    <rect width="256" height="256" fill="url(#${id}bg)"/>
    <circle cx="40" cy="44" r="3" fill="#fff" opacity=".6"/><circle cx="214" cy="62" r="2" fill="#fff" opacity=".5"/><circle cx="196" cy="30" r="1.6" fill="#fff" opacity=".6"/>
    ${back}
    <path d="M108 196 L108 222 C108 230 148 230 148 222 L148 196 Z" fill="#f2c2ad"/>
    <path d="M70 236 C76 214 100 210 128 210 C156 210 180 214 186 236 Z" fill="${hairDark}" opacity=".0"/>
    <path d="M58 256 C62 226 92 216 128 216 C164 216 194 226 198 256 Z" fill="${extra || '#2a2f45'}"/>
    <path d="M66 112 C66 66 96 52 128 52 C160 52 190 66 190 112 C190 150 172 184 128 204 C84 184 66 150 66 112 Z" fill="url(#${id}skin)"/>
    <!-- eyes -->
    <g>
      <ellipse cx="100" cy="132" rx="16" ry="20" fill="#fff"/>
      <ellipse cx="156" cy="132" rx="16" ry="20" fill="#fff"/>
      <ellipse cx="101" cy="135" rx="12.5" ry="17" fill="url(#${id}iris)"/>
      <ellipse cx="155" cy="135" rx="12.5" ry="17" fill="url(#${id}iris)"/>
      <ellipse cx="101" cy="136" rx="5.5" ry="8" fill="${eyeDark}"/>
      <ellipse cx="155" cy="136" rx="5.5" ry="8" fill="${eyeDark}"/>
      <ellipse cx="96" cy="126" rx="4.6" ry="5.6" fill="#fff"/><ellipse cx="150" cy="126" rx="4.6" ry="5.6" fill="#fff"/>
      <circle cx="106" cy="145" r="2.2" fill="#fff" opacity=".85"/><circle cx="160" cy="145" r="2.2" fill="#fff" opacity=".85"/>
      <path d="M82 118 C90 108 110 106 120 116" stroke="#2b1d2a" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M136 116 C146 106 166 108 174 118" stroke="#2b1d2a" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M84 100 C92 96 104 96 112 99" stroke="${hairDark}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M144 99 C152 96 164 96 172 100" stroke="${hairDark}" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>
    <ellipse cx="86" cy="160" rx="10" ry="5" fill="#ff8fa3" opacity=".45"/><ellipse cx="170" cy="160" rx="10" ry="5" fill="#ff8fa3" opacity=".45"/>
    <path d="M128 152 L126 160" stroke="#d99c86" stroke-width="2" stroke-linecap="round"/>
    <path d="M116 172 C122 179 134 179 140 172" stroke="#b5485e" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${bangs}
    ${style === 'bob' ? `<path d="M60 128 C58 112 66 100 76 98 L78 150 C68 150 60 142 60 128 Z" fill="#20283a"/><path d="M70 100 C80 60 176 60 186 100" stroke="#20283a" stroke-width="5" fill="none"/><rect x="58" y="112" width="14" height="30" rx="6" fill="#00e5ff"/>` : ''}
    ${style === 'long' ? `<path d="M168 66 l6 -12 l6 12 l12 6 l-12 6 l-6 12 l-6 -12 l-12 -6 z" fill="#fff6a8"/>` : ''}
  </g>
</svg>`;
}
module.exports = {
  aria: avatar({ id: 'ar', bg1: '#ffd1ec', bg2: '#7a3d8f', hair: '#f4a6d7', hairDark: '#c96fb0', eye: '#38d6c8', eyeDark: '#0f5c63', style: 'long', extra: '#ffffff' }),
  nova: avatar({ id: 'nv', bg1: '#bdf6ff', bg2: '#0d3b5c', hair: '#c9e4ff', hairDark: '#7fa6d6', eye: '#4aa8ff', eyeDark: '#123a7a', style: 'bob', extra: '#1d3557' }),
  ren:  avatar({ id: 'rn', bg1: '#ffe2a8', bg2: '#3b2346', hair: '#3a2f5a', hairDark: '#1e1833', eye: '#ffb02e', eyeDark: '#7a3c00', style: 'hood', extra: '#4b2e5e' }),
};

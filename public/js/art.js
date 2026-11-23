// Built-in vector art. Every piece can be replaced by a Firefly image dropped into /assets (see ASSETS.md).

const BRICKS = ["#c8453b", "#f2b632", "#2f6fb5", "#2f7d46", "#d9772b", "#7a5aa6"];

export function stadiumSVG(stage, runs = 0, fill = false) {
  const L = (n, body) => `<g class="layer ${n <= stage ? "built" : "locked"}" style="--d:${n * 0.12}s">${body}</g>`;
  // seats for the stands
  let seats = "";
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 26; i++) {
      const x = 262 + i * 18.5 + (row % 2) * 6, y = 150 + row * 17;
      seats += `<rect x="${x}" y="${y}" width="15" height="12" rx="2" fill="${BRICKS[(i + row) % BRICKS.length]}"/>`;
      if ((i * 7 + row * 3) % 5 !== 0) seats += `<circle cx="${x + 7.5}" cy="${y - 3}" r="4.2" fill="${["#f1c27d", "#c68642", "#8d5524", "#e0ac69"][(i + row) % 4]}"/>`;
    }
  }
  const tower = (x, h) => `<rect x="${x - 4}" y="${330 - h}" width="8" height="${h}" fill="#adb5bd"/>
    <rect x="${x - 26}" y="${318 - h}" width="52" height="30" rx="4" fill="#495057"/>
    ${[0, 1, 2].map((c) => [0, 1].map((r) => `<circle cx="${x - 16 + c * 16}" cy="${326 - h + r * 13}" r="5" fill="#fff9db"/>`).join("")).join("")}
    <circle class="glow" cx="${x}" cy="${333 - h}" r="70" fill="url(#glow)"/>`;
  return `<svg viewBox="0 0 1000 520" ${fill ? 'preserveAspectRatio="xMidYMid slice"' : ""} role="img" aria-label="Your stadium" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${stage >= 4 ? "#3b2a6b" : "#74c0fc"}"/><stop offset="1" stop-color="${stage >= 4 ? "#f08c5a" : "#d0ebff"}"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#fff3bf" stop-opacity=".9"/><stop offset="1" stop-color="#fff3bf" stop-opacity="0"/></radialGradient>
    <pattern id="brick" width="24" height="12" patternUnits="userSpaceOnUse"><rect width="24" height="12" fill="#c92a2a"/><path d="M0 .5H24M0 6.5H24M12 .5V6.5M0 6.5V12M24 6.5V12" stroke="#a61e1e" stroke-width="1.2"/></pattern>
    <clipPath id="oval"><ellipse cx="500" cy="380" rx="480" ry="150"/></clipPath>
  </defs>
  <rect width="1000" height="520" fill="url(#sky)"/>
  <g opacity=".85"><ellipse cx="160" cy="70" rx="60" ry="18" fill="#fff"/><ellipse cx="200" cy="60" rx="40" ry="16" fill="#fff"/><ellipse cx="780" cy="90" rx="70" ry="18" fill="#fff"/></g>
  ${L(3, `<path d="M240 225 Q500 120 760 225 L760 240 L240 240Z" fill="#343a40"/>${seats}`)}
  ${L(4, tower(40, 230) + tower(960, 230) + tower(300, 250) + tower(700, 250))}
  <g clip-path="url(#oval)">
    <rect x="0" y="225" width="1000" height="310" fill="#2b8a3e"/>
    ${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 84}" y="225" width="42" height="310" fill="#37b24d" opacity=".55"/>`).join("")}
  </g>
  <ellipse cx="500" cy="380" rx="440" ry="128" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="10 8" opacity=".9"/>
  ${L(1, `<path d="M470 300 L530 300 L548 440 L452 440Z" fill="#e9c46a"/><path d="M466 318 H534 M455 425 H545" stroke="#fff" stroke-width="3"/>
     ${[488, 498, 508].map((x) => `<rect x="${x}" y="292" width="4" height="22" fill="#fff"/>`).join("")}
     ${[484, 497, 510].map((x) => `<rect x="${x}" y="408" width="5" height="30" fill="#fff"/>`).join("")}`)}
  ${L(2, `<rect x="70" y="190" width="190" height="120" fill="url(#brick)" stroke="#7a1414" stroke-width="3"/>
     <path d="M55 192 L165 140 L275 192Z" fill="#212529"/><rect x="85" y="215" width="160" height="16" fill="#fff" opacity=".9"/>
     <text x="165" y="228" text-anchor="middle" font-size="12" font-weight="800" fill="#c92a2a" font-family="sans-serif">PAVILION</text>
     ${[95, 140, 185, 225].map((x) => `<rect x="${x}" y="245" width="26" height="30" rx="3" fill="#ffe066" stroke="#7a1414" stroke-width="2"/>`).join("")}
     <rect x="150" y="280" width="30" height="30" fill="#5c3d2e"/><line x1="165" y1="140" x2="165" y2="100" stroke="#495057" stroke-width="3"/><path d="M165 100 L200 110 L165 120Z" fill="#fcc419"/>`)}
  ${L(5, `<rect x="790" y="170" width="175" height="120" rx="8" fill="#1b263b" stroke="#adb5bd" stroke-width="4"/><rect x="860" y="290" width="10" height="40" fill="#adb5bd"/><rect x="890" y="290" width="10" height="40" fill="#adb5bd"/>
     <text x="877" y="198" text-anchor="middle" font-size="15" fill="#ffd43b" font-family="sans-serif" font-weight="700">RUNS</text>
     <text x="877" y="255" text-anchor="middle" font-size="46" fill="#ffd43b" font-family="Figtree, sans-serif" font-weight="800">${runs}</text>`)}
  ${L(6, `<g transform="translate(165 60)"><path d="M-22 0 H22 V10 Q22 38 0 44 Q-22 38 -22 10Z" fill="#fab005" stroke="#e67700" stroke-width="3"/>
     <rect x="-6" y="44" width="12" height="14" fill="#e67700"/><rect x="-18" y="58" width="36" height="9" rx="2" fill="#e67700"/>
     <path d="M-22 8 Q-40 8 -36 22 Q-32 30 -20 28 M22 8 Q40 8 36 22 Q32 30 20 28" fill="none" stroke="#fab005" stroke-width="4"/></g>
     <path d="M0 24 Q250 60 500 30 T1000 24" fill="none" stroke="#868e96" stroke-width="2"/>
     ${Array.from({ length: 20 }, (_, i) => `<path d="M${i * 50 + 12} ${30 + Math.sin(i) * 8} l12 22 l12 -22z" fill="${BRICKS[i % 6]}"/>`).join("")}
     ${[[620, 70], [880, 50], [420, 60]].map(([x, y]) => Array.from({ length: 10 }, (_, k) => `<line x1="${x}" y1="${y}" x2="${x + Math.cos(k * 0.628) * 26}" y2="${y + Math.sin(k * 0.628) * 26}" stroke="${BRICKS[k % 6]}" stroke-width="3" stroke-linecap="round"/>`).join("")).join("")}`)}
</svg>`;
}

// Coach Stumpy: an original brick-robot cricket coach.
export function coachSVG(mood = "happy") {
  const mouth = mood === "sad" ? "M88 112 Q100 102 112 112" : mood === "wow" ? "" : "M86 106 Q100 120 114 106";
  return `<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Coach Stumpy">
  <ellipse cx="100" cy="210" rx="60" ry="8" fill="#000" opacity=".15"/>
  <rect x="62" y="150" width="20" height="50" rx="6" fill="#1c7ed6"/><rect x="118" y="150" width="20" height="50" rx="6" fill="#1c7ed6"/>
  <rect x="50" y="128" width="100" height="40" rx="10" fill="#fcc419"/>
  <rect x="44" y="52" width="112" height="84" rx="16" fill="#e03131"/>
  <rect x="62" y="38" width="26" height="16" rx="6" fill="#e03131"/><rect x="112" y="38" width="26" height="16" rx="6" fill="#e03131"/>
  <path d="M40 58 Q100 18 160 58 L172 62 L36 62Z" fill="#1c7ed6"/><rect x="138" y="56" width="44" height="8" rx="4" fill="#1864ab"/>
  <circle cx="78" cy="90" r="14" fill="#fff"/><circle cx="122" cy="90" r="14" fill="#fff"/>
  <circle cx="${mood === "wow" ? 78 : 81}" cy="92" r="7" fill="#212529"/><circle cx="${mood === "wow" ? 122 : 125}" cy="92" r="7" fill="#212529"/>
  ${mouth ? `<path d="${mouth}" fill="none" stroke="#212529" stroke-width="5" stroke-linecap="round"/>` : `<circle cx="100" cy="112" r="8" fill="#212529"/>`}
  <g transform="rotate(-28 165 120)"><rect x="158" y="70" width="14" height="40" rx="4" fill="#5c3d2e"/><rect x="152" y="108" width="26" height="80" rx="8" fill="#f2c18d" stroke="#d9a066" stroke-width="2"/></g>
  <circle cx="34" cy="150" r="12" fill="#c92a2a"/><path d="M24 146 Q34 152 44 146" stroke="#fff" stroke-width="2" fill="none"/>
</svg>`;
}

// Badge medallion (brick-shaped, with studs).
const GLYPH = { first_innings: "1st", fifty: "50", perfect_over: "6/6", clean_sheet: "0W", streak3: "3d", streak7: "7d", streak14: "14d",
  big_gain: "+2", topic_master: "5/5", comeback: "↺", all_rounder: "★", early_bird: "☀", honest_review: "✓" };
export function badgeSVG(b, earned) {
  const c = earned ? b.color : "#adb5bd";
  return `<svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="22" y="6" width="26" height="16" rx="6" fill="${c}"/><rect x="72" y="6" width="26" height="16" rx="6" fill="${c}"/>
  <rect x="10" y="18" width="100" height="78" rx="16" fill="${c}"/>
  <rect x="10" y="18" width="100" height="78" rx="16" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="4"/>
  <rect x="18" y="26" width="84" height="20" rx="8" fill="#fff" opacity=".25"/>
  <text x="60" y="76" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="800" font-size="${(GLYPH[b.code] || "").length > 2 ? 22 : 28}" fill="${earned ? "#fff" : "#f1f3f5"}">${earned ? GLYPH[b.code] || "★" : "?"}</text>
</svg>`;
}

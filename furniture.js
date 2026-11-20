// Detailed furniture, fixtures and automatic styling decor.
// Local frame of every piece: x = width, z = depth with the FRONT at +z, y up, origin at the footprint centre.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { projOnSeg, pointInPoly, hostWall } from './model.js';

const geoCache = new Map();
function rgeo(w, h, d, r) {
  r = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const k = [w, h, d, r].map(v => v.toFixed(3)).join('|');
  if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, 3, r));
  return geoCache.get(k);
}
export function clearGeoCache() { geoCache.forEach(g => g.dispose()); geoCache.clear(); }

const add = (g, m, x, y, z) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
export const box = (g, w, h, d, x, y, z, mat) => add(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z);
export const rbox = (g, w, h, d, r, x, y, z, mat) => add(g, new THREE.Mesh(rgeo(w, h, d, r), mat), x, y, z);
export const cyl = (g, rt, rb, h, x, y, z, mat, seg = 28) => add(g, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat), x, y, z);
const sph = (g, r, x, y, z, mat, sx = 1, sy = 1, sz = 1) => { const m = add(g, new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat), x, y, z); m.scale.set(sx, sy, sz); return m; };

function lamp(g, M, x, y, z, h = 0.45) {            // table lamp
  cyl(g, 0.06, 0.07, 0.03, x, y + 0.015, z, M.metal);
  cyl(g, 0.012, 0.012, h * 0.55, x, y + h * 0.3, z, M.metal, 10);
  cyl(g, 0.11, 0.15, h * 0.38, x, y + h * 0.72, z, M.shade, 32);
}
function books(g, M, x, y, z, n = 3, rot = 0) {
  const cols = [M.book1, M.book2, M.book3];
  let yy = y;
  for (let i = 0; i < n; i++) { const t = 0.03 + (i % 2) * 0.012; const b = box(g, 0.26 - i * 0.02, t, 0.19 - i * 0.01, x, yy + t / 2, z, cols[i % 3]); b.rotation.y = rot + i * 0.12; yy += t; }
  return yy;
}
function vase(g, M, x, y, z, h = 0.28) {
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.035 + Math.sin(t * Math.PI) * 0.06 + (t > 0.85 ? 0.01 : 0), t * h)); }
  add(g, new THREE.Mesh(new THREE.LatheGeometry(pts, 28), M.ceramicA), x, y, z);
  // a few stems
  for (let i = 0; i < 3; i++) { const s = cyl(g, 0.004, 0.004, 0.3, x + (i - 1) * 0.02, y + h + 0.12, z, M.leaf, 5); s.rotation.z = (i - 1) * 0.25; }
}
function plant(g, M, x, z, s = 1) {
  const pts = [new THREE.Vector2(0.13 * s, 0), new THREE.Vector2(0.16 * s, 0.34 * s), new THREE.Vector2(0.17 * s, 0.36 * s), new THREE.Vector2(0.0, 0.36 * s)];
  add(g, new THREE.Mesh(new THREE.LatheGeometry(pts, 28), M.pot), x, 0, z);
  const leafG = new THREE.IcosahedronGeometry(0.16 * s, 1);
  const rnd = mulberry(Math.round((x + z) * 100));
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 0.18 * s, y = (0.55 + rnd() * 0.75) * s;
    const m = add(g, new THREE.Mesh(leafG, M.leaf), x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    m.scale.set(1 + rnd() * 0.5, 0.7 + rnd() * 0.6, 1 + rnd() * 0.5); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
  }
  cyl(g, 0.012, 0.016, 0.7 * s, x, 0.55 * s, z, M.wood, 6);
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ── individual pieces ──
export function buildItem(it, M, H) {
  const g = new THREE.Group();
  const w = it.w, d = it.d, hz = d / 2, hw = w / 2, T = it.type;
  if (T === 'bed' || T === 'bed_single') {
    rbox(g, w, 0.26, d - 0.06, 0.02, 0, 0.17, 0.03, M.wood);                        // frame
    cyl(g, 0.02, 0.02, 0.05, -hw + 0.08, 0.025, hz - 0.08, M.metal, 8); cyl(g, 0.02, 0.02, 0.05, hw - 0.08, 0.025, hz - 0.08, M.metal, 8);
    rbox(g, w - 0.08, 0.22, d - 0.16, 0.07, 0, 0.4, 0.05, M.linen);                  // mattress
    rbox(g, w + 0.02, 0.07, d * 0.68, 0.035, 0, 0.53, hz - d * 0.34 - 0.04, M.duvet); // duvet, from the foot
    const fold = rbox(g, w + 0.02, 0.06, 0.32, 0.03, 0, 0.56, hz - d * 0.68 - 0.08, M.duvet); fold.rotation.x = -0.12;
    rbox(g, w + 0.06, 0.05, 0.5, 0.02, 0, 0.575, hz - 0.36, M.throwA);                // throw at the foot
    rbox(g, w + 0.14, 1.15, 0.12, 0.05, 0, 0.6, -hz + 0.06, M.head);                  // upholstered headboard
    const n = T === 'bed' ? 2 : 1, pw = (w - 0.2) / n;
    for (let i = 0; i < n; i++) {
      const px = n === 1 ? 0 : (i ? 1 : -1) * w / 4;
      const p = rbox(g, pw - 0.06, 0.16, 0.42, 0.07, px, 0.62, -hz + 0.34, M.linen); p.rotation.x = -0.35;
      const c = rbox(g, pw * 0.62, 0.14, 0.38, 0.06, px, 0.62, -hz + 0.6, i ? M.cushionB : M.cushionA); c.rotation.x = -0.5;
    }
  } else if (T === 'nightstand') {
    rbox(g, w, 0.48, d, 0.015, 0, 0.27, 0, M.joinery);
    box(g, w - 0.04, 0.004, 0.005, 0, 0.36, hz + 0.001, M.gap);
    box(g, 0.1, 0.012, 0.012, 0, 0.42, hz + 0.008, M.metal);
    lamp(g, M, 0, 0.51, -0.03, 0.5);
  } else if (T === 'wardrobe' || T === 'cabinet') {
    const h = Math.min(2.4, H - 0.02);
    rbox(g, w, h, d, 0.008, 0, h / 2, 0, M.joinery);
    const doors = Math.max(1, Math.round(w / 0.5));
    for (let i = 1; i < doors; i++) box(g, 0.006, h - 0.06, 0.004, -hw + i * w / doors, h / 2, hz + 0.001, M.gap);
    for (let i = 0; i < doors; i++) { const x = -hw + (i + 0.5) * w / doors + (i % 2 ? -1 : 1) * (w / doors / 2 - 0.05); box(g, 0.012, Math.min(0.45, h * 0.25), 0.02, x, Math.min(1.05, h * 0.5), hz + 0.012, M.metal); }
    box(g, w - 0.02, 0.06, 0.01, 0, 0.03, hz - 0.03, M.gap);
  } else if (T === 'shoe') {
    rbox(g, w, 1.0, d, 0.01, 0, 0.55, 0, M.joinery); box(g, w + 0.02, 0.03, d + 0.02, 0, 1.06, 0, M.stone);
    vase(g, M, hw * 0.5, 1.075, 0, 0.22); books(g, M, -hw * 0.4, 1.075, 0, 2);
  } else if (T === 'desk') {
    rbox(g, w, 0.035, d, 0.01, 0, 0.74, 0, M.wood);
    box(g, 0.035, 0.72, d - 0.06, -hw + 0.04, 0.36, 0, M.metalDark); box(g, 0.035, 0.72, d - 0.06, hw - 0.04, 0.36, 0, M.metalDark);
    const lap = box(g, 0.34, 0.012, 0.24, 0.05, 0.764, 0.06, M.metalDark); lap.rotation.y = 0.1;
    const scr = box(g, 0.34, 0.22, 0.01, 0.04, 0.88, -0.07, M.screen); scr.rotation.x = -0.25; scr.rotation.y = 0.1;
    lamp(g, M, -hw + 0.15, 0.76, -hz + 0.12, 0.42); books(g, M, hw - 0.2, 0.76, -hz + 0.15, 3);
  } else if (T === 'chair') {
    rbox(g, w, 0.08, d - 0.04, 0.035, 0, 0.47, 0.02, M.fabric);
    const b = rbox(g, w, 0.4, 0.06, 0.03, 0, 0.72, -hz + 0.05, M.fabric); b.rotation.x = -0.1;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => cyl(g, 0.014, 0.012, 0.44, a * (hw - 0.05), 0.22, c * (hz - 0.06), M.metalDark, 8));
  } else if (T === 'sofa' || T === 'armchair' || T === 'sofa_l') {
    sofa(g, M, it);
  } else if (T === 'coffee') {
    cyl(g, hw, hw, 0.035, 0, 0.4, 0, M.stone, 48); cyl(g, hw * 0.35, hw * 0.45, 0.38, 0, 0.19, 0, M.wood, 32);
    books(g, M, -0.08, 0.418, 0.05, 2, 0.4); vase(g, M, 0.14, 0.418, -0.08, 0.2);
  } else if (T === 'coffee_rect') {
    rbox(g, w, 0.04, d, 0.012, 0, 0.4, 0, M.stone); rbox(g, w - 0.12, 0.34, d - 0.12, 0.02, 0, 0.19, 0, M.wood);
    books(g, M, -w * 0.2, 0.42, 0, 2, 0.3); vase(g, M, w * 0.25, 0.42, 0, 0.2);
  } else if (T === 'tv') {
    rbox(g, w, 0.42, d, 0.012, 0, 0.27, 0, M.joinery);
    for (let i = 1; i < 3; i++) box(g, 0.004, 0.36, 0.004, -hw + i * w / 3, 0.27, hz + 0.001, M.gap);
    box(g, w - 0.02, 0.06, d - 0.06, 0, 0.03, -0.02, M.gap);
    const tw = Math.min(w * 0.72, 1.65), th = tw * 0.5625;
    box(g, tw, th, 0.03, 0, 0.62 + 0.55 + th / 2 - 0.25, -hz + 0.02, M.tvFrame);
    box(g, tw - 0.02, th - 0.02, 0.005, 0, 0.62 + 0.55 + th / 2 - 0.25, -hz + 0.036, M.screen);
    box(g, Math.min(0.9, tw * 0.6), 0.06, 0.09, 0, 0.51, -0.02, M.tvFrame);
    vase(g, M, -hw + 0.22, 0.48, 0, 0.3); books(g, M, hw - 0.25, 0.48, 0.02, 3);
  } else if (T === 'dining' || T === 'dining4') {
    rbox(g, w, 0.045, d, 0.012, 0, 0.75, 0, M.tableTop);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => cyl(g, 0.025, 0.02, 0.73, a * (hw - 0.09), 0.365, c * (hz - 0.12), M.wood, 12));
    const per = T === 'dining' ? 3 : 2, step = d / per;
    for (const side of [-1, 1]) for (let i = 0; i < per; i++) {
      const c = new THREE.Group(); const z = -hz + step * (i + 0.5);
      rbox(c, 0.46, 0.08, 0.44, 0.035, 0, 0.47, 0.02, M.fabric); const bk = rbox(c, 0.46, 0.42, 0.06, 0.03, 0, 0.72, -0.2, M.fabric); bk.rotation.x = -0.1;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => cyl(c, 0.014, 0.012, 0.44, a * 0.19, 0.22, b * 0.18, M.metalDark, 8));
      c.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      c.position.set(side * (hw + 0.16), 0, z); g.add(c);
    }
    vase(g, M, 0, 0.772, -0.1, 0.26);
    cyl(g, 0.16, 0.12, 0.06, 0, 0.8, 0.22, M.ceramicA, 28);
    // pendant hanging over the table
    const ph = Math.min(H - 0.05, 2.35), py = 1.62;
    if (ph > py + 0.1) cyl(g, 0.004, 0.004, ph - py, 0, (ph + py) / 2, 0, M.metalDark, 6);
    const sh = add(g, new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.pendant), 0, py - 0.0, 0);
    sh.scale.y = 0.75; sph(g, 0.05, 0, py - 0.05, 0, M.bulb);
  } else if (T === 'counter' || T === 'sink' || T === 'hob' || T === 'island') {
    rbox(g, w, 0.8, d - 0.02, 0.006, 0, 0.5, -0.01, M.joinery);
    box(g, w - 0.02, 0.1, d - 0.08, 0, 0.05, -0.03, M.gap);                          // recessed plinth
    const n = Math.max(1, Math.round(w / 0.6));
    for (let i = 1; i < n; i++) box(g, 0.004, 0.76, 0.004, -hw + i * w / n, 0.5, hz - 0.019, M.gap);
    for (let i = 0; i < n; i++) box(g, Math.min(0.25, w / n * 0.5), 0.012, 0.02, -hw + (i + 0.5) * w / n, 0.84, hz - 0.01, M.metal);
    rbox(g, w + 0.02, 0.035, d + 0.02, 0.005, 0, 0.917, 0.01, M.counterTop);
    if (T === 'sink') {
      box(g, Math.min(0.68, w - 0.1), 0.006, d * 0.62, 0, 0.936, 0.02, M.steel);
      box(g, Math.min(0.62, w - 0.14), 0.006, d * 0.52, 0, 0.932, 0.02, M.gap);
      cyl(g, 0.018, 0.022, 0.06, 0, 0.965, -hz + 0.08, M.steel, 12);
      const sp = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 20, Math.PI), M.steel), 0, 1.0, -hz + 0.19); sp.rotation.y = Math.PI / 2;
    }
    if (T === 'hob') {
      box(g, Math.min(0.62, w - 0.08), 0.008, d * 0.78, 0, 0.938, 0, M.blackGlass);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const r = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.004, 6, 32), M.hobRing), a * 0.15, 0.944, b * 0.12); r.rotation.x = Math.PI / 2; });
    }
    if (T === 'island') for (let i = -1; i <= 1; i += 2) { const st = new THREE.Group(); cyl(st, 0.18, 0.18, 0.06, 0, 0.75, 0, M.fabric); cyl(st, 0.016, 0.016, 0.72, 0, 0.36, 0, M.metalDark, 8); st.position.set(i * w * 0.25, 0, hz + 0.35); g.add(st); }
  } else if (T === 'fridge') {
    rbox(g, w, 1.86, d, 0.02, 0, 0.93, 0, M.steel);
    box(g, 0.006, 1.8, 0.006, 0, 0.93, hz + 0.001, M.gap);
    box(g, 0.025, 0.55, 0.035, -0.05, 1.15, hz + 0.02, M.metalDark); box(g, 0.025, 0.55, 0.035, 0.05, 1.15, hz + 0.02, M.metalDark);
  } else if (T === 'washer') {
    rbox(g, w, 0.85, d, 0.02, 0, 0.425, 0, M.ceramic);
    const r = Math.min(w, 0.85) * 0.27;
    const ring = add(g, new THREE.Mesh(new THREE.TorusGeometry(r, 0.028, 14, 44), M.steel), 0, 0.4, hz + 0.012);
    add(g, new THREE.Mesh(new THREE.CircleGeometry(r, 44), M.washerGlass), 0, 0.4, hz + 0.008);
    box(g, w - 0.06, 0.1, 0.012, 0, 0.77, hz + 0.004, M.panel); cyl(g, 0.025, 0.025, 0.02, w * 0.25, 0.77, hz + 0.014, M.steel, 20).rotation.x = Math.PI / 2;
  } else if (T === 'toilet') {
    rbox(g, w * 0.92, 0.36, 0.18, 0.04, 0, 0.62, -hz + 0.1, M.ceramic);
    const bowl = add(g, new THREE.Mesh(new THREE.CylinderGeometry(w * 0.47, w * 0.34, 0.38, 32), M.ceramic), 0, 0.2, -hz + 0.18 + (d - 0.18) / 2);
    bowl.scale.z = (d - 0.18) / (w * 0.94);
    const seat = add(g, new THREE.Mesh(new THREE.TorusGeometry(w * 0.36, 0.03, 10, 36), M.ceramic), 0, 0.405, -hz + 0.18 + (d - 0.18) / 2);
    seat.rotation.x = Math.PI / 2; seat.scale.y = (d - 0.18) / (w * 0.82);
    box(g, 0.05, 0.012, 0.03, 0, 0.805, -hz + 0.1, M.steel);
  } else if (T === 'basin') {
    rbox(g, w, 0.45, d, 0.012, 0, 0.6, 0, M.joinery);
    box(g, w - 0.04, 0.004, 0.004, 0, 0.6, hz + 0.001, M.gap);
    rbox(g, w + 0.02, 0.03, d + 0.02, 0.005, 0, 0.84, 0, M.counterTop);
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.1 + Math.sin(t * Math.PI / 2) * 0.1, t * 0.12)); }
    add(g, new THREE.Mesh(new THREE.LatheGeometry(pts, 32), M.ceramic), 0, 0.855, 0.03);
    cyl(g, 0.014, 0.016, 0.22, 0, 0.965, -hz + 0.06, M.steel, 12);
    box(g, 0.016, 0.016, 0.12, 0, 1.07, -hz + 0.11, M.steel);
    const mh = Math.min(0.8, H - 1.05);
    if (mh > 0.1) { rbox(g, Math.min(w * 0.85, 0.8), mh, 0.025, 0.01, 0, 1.05 + mh / 2, -hz + 0.015, M.mirrorFrame); box(g, Math.min(w * 0.85, 0.8) - 0.04, mh - 0.04, 0.005, 0, 1.05 + mh / 2, -hz + 0.03, M.mirror); }
  } else if (T === 'shower') {
    box(g, w, 0.04, d, 0, 0.02, 0, M.showerTray);
    const gh = Math.min(1.95, H - 0.05);
    if (gh > 0.1) { box(g, w, gh, 0.01, 0, 0.04 + gh / 2, hz - 0.005, M.glass); box(g, 0.015, gh, 0.03, -hw + 0.01, 0.04 + gh / 2, hz - 0.005, M.steel); }
    if (H > 2.0) { cyl(g, 0.12, 0.12, 0.012, 0, 2.0, -hz + 0.3, M.steel, 28); box(g, 0.018, 0.018, 0.28, 0, 2.01, -hz + 0.15, M.steel); }
    box(g, 0.03, 0.03, 0.05, 0, 1.05, -hz + 0.025, M.steel);
  } else if (T === 'bathtub') {
    rbox(g, w, 0.55, d, 0.08, 0, 0.275, 0, M.ceramic); rbox(g, w - 0.16, 0.04, d - 0.16, 0.06, 0, 0.535, 0, M.water);
  } else if (T === 'shaft') {
    box(g, w, H, d, 0, H / 2, 0, M.wall);
  } else if (T === 'rack') {
    if (H > 2.2) for (let i = 0; i < 5; i++) { const b = cyl(g, 0.01, 0.01, w, 0, 2.2, -hz + (i + 0.5) * d / 5, M.steel, 6); b.rotation.z = Math.PI / 2; }
  } else if (T === 'plant') {
    plant(g, M, 0, 0, Math.max(0.8, w / 0.45));
  } else if (T === 'rug') {
    rbox(g, w, 0.014, d, 0.006, 0, 0.007, 0, M.rug);
  } else {
    rbox(g, w, 0.8, d, 0.01, 0, 0.4, 0, M.joinery);
  }
  return g;
}

function sofa(g, M, it) {
  const { w, d, type } = it, hw = w / 2, hz = d / 2;
  const seatD = type === 'sofa_l' ? Math.min(0.95, d * 0.62) : Math.min(d, 1.0);
  const z0 = -hz;                                       // back edge
  const armW = type === 'armchair' ? 0.16 : 0.2;
  rbox(g, w, 0.2, seatD, 0.04, 0, 0.17, z0 + seatD / 2, M.fabric);                       // base
  rbox(g, w, 0.48, 0.2, 0.08, 0, 0.5, z0 + 0.1, M.fabric);                               // back frame
  rbox(g, armW, 0.38, seatD, 0.08, -hw + armW / 2, 0.42, z0 + seatD / 2, M.fabric);
  if (type !== 'sofa_l' || !it.mirror) rbox(g, armW, 0.38, seatD, 0.08, hw - armW / 2, 0.42, z0 + seatD / 2, M.fabric);
  if (type === 'sofa_l' && it.mirror) {} // the chaise side has no arm
  const inner = w - armW * 2, n = type === 'armchair' ? 1 : Math.max(2, Math.round(inner / 0.75)), cw = inner / n;
  for (let i = 0; i < n; i++) {
    const x = -hw + armW + (i + 0.5) * cw;
    rbox(g, cw - 0.02, 0.15, seatD - 0.26, 0.06, x, 0.345, z0 + 0.2 + (seatD - 0.22) / 2, M.fabric);     // seat cushion
    const b = rbox(g, cw - 0.04, 0.42, 0.16, 0.07, x, 0.62, z0 + 0.26, M.fabric); b.rotation.x = -0.18;  // back cushion
  }
  // feet
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(g, 0.02, 0.016, 0.07, a * (hw - 0.08), 0.035, z0 + (b < 0 ? 0.08 : seatD - 0.08), M.metalDark, 8);
  if (type === 'sofa_l') {
    const cx = (it.mirror ? -1 : 1) * (hw - 0.45), cd = d - seatD;
    rbox(g, 0.9, 0.2, cd + 0.02, 0.04, cx, 0.17, z0 + seatD + cd / 2 - 0.01, M.fabric);
    rbox(g, 0.86, 0.15, cd + 0.04, 0.06, cx, 0.345, z0 + seatD + cd / 2 - 0.05, M.fabric);
  }
  // throw pillows
  if (type !== 'armchair') {
    const p1 = rbox(g, 0.44, 0.42, 0.13, 0.08, -hw + armW + 0.3, 0.6, z0 + 0.42, M.cushionA); p1.rotation.set(-0.25, 0.25, 0.08);
    const p2 = rbox(g, 0.4, 0.38, 0.12, 0.08, hw - armW - 0.3, 0.58, z0 + 0.42, M.cushionB); p2.rotation.set(-0.25, -0.2, -0.06);
    const p3 = rbox(g, 0.4, 0.38, 0.12, 0.08, -hw + armW + 0.68, 0.58, z0 + 0.43, M.cushionB); p3.rotation.set(-0.3, 0.1, 0);
    const th = rbox(g, 0.5, 0.05, seatD - 0.25, 0.025, hw - armW - 0.35, 0.44, z0 + seatD / 2 + 0.08, M.throwA); th.rotation.y = 0.15;
  } else {
    const p = rbox(g, 0.4, 0.38, 0.12, 0.08, 0, 0.58, z0 + 0.4, M.cushionA); p.rotation.x = -0.25;
  }
}

// ── art ──
const artCache = {};
export function artTexture(S, seed) {
  const k = (S ? S.variant : 'x') + seed;
  if (artCache[k]) return artCache[k];
  const c = document.createElement('canvas'); c.width = 256; c.height = 320; const x = c.getContext('2d');
  const cols = S ? S.colours.map(c => c.hex) : ['#eeeeee', '#bbbbbb', '#555555'];
  const rnd = mulberry(seed * 977 + 13);
  x.fillStyle = cols[0]; x.fillRect(0, 0, 256, 320);
  for (let i = 0; i < 5; i++) {
    x.globalAlpha = 0.55 + rnd() * 0.4; x.fillStyle = cols[1 + (i % 2)];
    x.beginPath(); x.ellipse(40 + rnd() * 176, 50 + rnd() * 220, 30 + rnd() * 70, 20 + rnd() * 60, rnd() * 3, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 0.9; x.strokeStyle = cols[2]; x.lineWidth = 3; x.beginPath(); x.moveTo(30, 260); x.bezierCurveTo(90, 120 + rnd() * 80, 160, 300, 230, 90); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; artCache[k] = t; return t;
}

// ── room edges helpers ──
function polyIsCCW(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return a > 0; }
// For each room edge that sits on a wall: the inner face line, minus openings. Returns [{x1,y1,x2,y2,nx,ny,wall}]
export function innerFaces(room, L, skipTypes = ['door', 'main', 'slide', 'glass', 'window']) {
  const p = room.poly, ccw = polyIsCCW(p), out = [];
  for (let i = 0; i < p.length; i++) {
    const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length];
    const len = Math.hypot(bx - ax, by - ay); if (len < 0.15) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    // inward normal (y down): for CCW polygons in this frame the interior is to the right
    let nx = ccw ? -uy : uy, ny = ccw ? ux : -ux;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (!pointInPoly(mx + nx * 0.2, my + ny * 0.2, p)) { nx = -nx; ny = -ny; }
    // wall under this edge
    let wall = null, wd = 0.12;
    for (const w of L.walls) { const pa = projOnSeg(mx, my, w.x1, w.y1, w.x2, w.y2); const wl = Math.hypot(w.x2 - w.x1, w.y2 - w.y1); const par = Math.abs((w.x2 - w.x1) / wl * uy - (w.y2 - w.y1) / wl * ux) < 0.1; if (par && pa.d < wd) { wd = pa.d; wall = w; } }
    if (!wall) continue;
    const off = wall.t / 2 + 0.004;
    // cut openings
    let segs = [[0, len]];
    for (const o of L.openings) {
      if (!skipTypes.includes(o.type)) continue;
      const pa = projOnSeg(o.x1, o.y1, ax, ay, bx, by), pb = projOnSeg(o.x2, o.y2, ax, ay, bx, by);
      if (pa.d > 0.15 || pb.d > 0.15) continue;
      const s = Math.min(pa.t, pb.t) * len - 0.05, e = Math.max(pa.t, pb.t) * len + 0.05;
      segs = segs.flatMap(([a, b]) => e <= a || s >= b ? [[a, b]] : [[a, s], [e, b]].filter(([q, r]) => r - q > 0.05));
    }
    for (const [a, b] of segs) {
      // trim the ends by the half-thickness of the crossing walls so faces meet in the corners
      const a2 = a === 0 ? a + off : a, b2 = b === len ? b - off : b;
      if (b2 - a2 < 0.05) continue;
      out.push({ x1: ax + ux * a2 + nx * off, y1: ay + uy * a2 + ny * off, x2: ax + ux * b2 + nx * off, y2: ay + uy * b2 + ny * off, nx, ny, wall, ux, uy });
    }
  }
  return out;
}

// strip (baseboard / tile / panel) along an inner face
export function faceStrip(root, f, y0, y1, depth, mat) {
  const len = Math.hypot(f.x2 - f.x1, f.y2 - f.y1);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, y1 - y0, depth), mat);
  m.position.set((f.x1 + f.x2) / 2 + f.nx * depth / 2, (y0 + y1) / 2, (f.y1 + f.y2) / 2 + f.ny * depth / 2);
  m.rotation.y = -Math.atan2(f.uy, f.ux); m.receiveShadow = true; m.castShadow = false;
  root.add(m); return m;
}

// ── automatic styling decor (does not change the layout data) ──
export function addDecor(root, L, S, M, H, roomOf) {
  const dens = S ? (S.decorDensity || 'Moderate') : 'Minimal';
  const rich = /layer/i.test(dens) ? 2 : /moder/i.test(dens) ? 1 : 0;
  const noPlants = S && S.allowedDecor && S.allowedDecor.some(a => /no plants/i.test(a));
  const noArt = S && S.allowedDecor && S.allowedDecor.some(a => /no (framed )?art/i.test(a));
  const items = L.items;
  const place = (g, x, y, rot) => { g.position.set(x, 0, y); g.rotation.y = -rot * Math.PI / 180; root.add(g); return g; };
  const frontVec = rot => { const a = rot * Math.PI / 180; return [-Math.sin(a), Math.cos(a)]; };
  const rightVec = rot => { const a = rot * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; };
  const wallBehind = (x, y, rot, depth) => { const [fx, fy] = frontVec(rot); const px = x - fx * (depth / 2 + 0.12), py = y - fy * (depth / 2 + 0.12); return L.walls.find(w => projOnSeg(px, py, w.x1, w.y1, w.x2, w.y2).d < 0.22); };
  const art = (x, y, rot, depth, w, h, cy, seed) => {
    if (noArt || cy + h / 2 > H - 0.05) return;
    const [fx, fy] = frontVec(rot); const wall = wallBehind(x, y, rot, depth); if (!wall) return;
    const p = projOnSeg(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
    const ax = p.x + fx * (wall.t / 2 + 0.02), ay = p.y + fy * (wall.t / 2 + 0.02);
    const g = new THREE.Group();
    box(g, w + 0.05, h + 0.05, 0.03, 0, cy, 0, M.frameArt);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: artTexture(S, seed), roughness: 0.9 }));
    pic.position.set(0, cy, 0.017); g.add(pic);
    place(g, ax, ay, rot);
  };
  let seed = 1;
  for (const it of items) {
    const [fx, fy] = frontVec(it.rot), [rx, ry] = rightVec(it.rot);
    if (it.type === 'bed' || it.type === 'bed_single') {
      // rug under the lower two thirds of the bed
      const g = new THREE.Group(); rbox(g, it.w + 0.9, 0.014, it.d * 0.75 + 0.5, 0.006, 0, 0.007, 0, M.rug);
      place(g, it.x + fx * (it.d * 0.22), it.y + fy * (it.d * 0.22), it.rot);
      art(it.x, it.y, it.rot, it.d, Math.min(1.2, it.w * 0.6), 0.6, 1.62, seed++);
    }
    if (it.type === 'sofa' || it.type === 'sofa_l') {
      art(it.x, it.y, it.rot, it.d, 1.0, 0.65, 1.55, seed++);
      // floor lamp at the right end
      if (rich >= 1) { const g = new THREE.Group(); cyl(g, 0.13, 0.15, 0.025, 0, 0.012, 0, M.metalDark); cyl(g, 0.012, 0.012, 1.45, 0, 0.74, 0, M.metalDark, 8); cyl(g, 0.17, 0.2, 0.3, 0, 1.5, 0, M.shade, 32); place(g, it.x + rx * (it.w / 2 + 0.3) - fx * (it.d / 2 - 0.3), it.y + ry * (it.w / 2 + 0.3) - fy * (it.d / 2 - 0.3), 0); }
    }
    if (it.type === 'coffee' || it.type === 'coffee_rect') {
      const g = new THREE.Group(); rbox(g, 2.6, 0.014, 1.8, 0.006, 0, 0.007, 0, M.rug);
      // orient the rug toward the nearest sofa
      const sofa = items.filter(s => s.type.startsWith('sofa')).sort((a, b) => Math.hypot(a.x - it.x, a.y - it.y) - Math.hypot(b.x - it.x, b.y - it.y))[0];
      const rot = sofa ? sofa.rot : it.rot; const [sx, sy] = frontVec(rot);
      place(g, it.x - sx * 0.25, it.y - sy * 0.25, rot);
    }
    if (it.type === 'tv') art(it.x + rx * (it.w / 2 + 0.6), it.y + ry * (it.w / 2 + 0.6), it.rot, it.d, 0.45, 0.6, 1.5, seed++);
    if ((it.type === 'counter' || it.type === 'sink' || it.type === 'hob') && H > 1.6) {
      const wall = wallBehind(it.x, it.y, it.rot, it.d);
      if (wall) {
        const g = new THREE.Group(), hz = it.d / 2, top = Math.min(2.3, H - 0.02);
        box(g, it.w, Math.min(0.62, top - 0.94), 0.015, 0, 0.94 + Math.min(0.62, top - 0.94) / 2, -hz + 0.008, M.backsplash);
        if (it.type === 'hob') {
          const hb = Math.min(top, 2.2); if (hb > 1.75) { rbox(g, Math.min(0.75, it.w), 0.12, 0.48, 0.01, 0, 1.68, -hz + 0.24, M.steel); box(g, 0.28, hb - 1.74, 0.24, 0, (hb + 1.74) / 2, -hz + 0.13, M.steel); }
        } else if (top > 1.6) {
          const uh = top - 1.5; rbox(g, it.w, uh, 0.36, 0.006, 0, 1.5 + uh / 2, -hz + 0.18, M.joinery);
          const n = Math.max(1, Math.round(it.w / 0.5)); for (let i = 1; i < n; i++) box(g, 0.004, uh - 0.04, 0.004, -it.w / 2 + i * it.w / n, 1.5 + uh / 2, -hz + 0.361, M.gap);
          box(g, it.w - 0.04, 0.02, 0.3, 0, 1.49, -hz + 0.17, M.ledStrip);
        }
        place(g, it.x, it.y, it.rot);
      }
      if (it.type === 'counter' && rich >= 1) { const g = new THREE.Group(); const b = rbox(g, 0.36, 0.02, 0.24, 0.006, -it.w * 0.2, 0.945, 0.02, M.wood); b.rotation.y = 0.2; cyl(g, 0.07, 0.08, 0.2, it.w * 0.2, 1.035, -0.05, M.steel, 24); place(g, it.x, it.y, it.rot); }
    }
    if (it.type === 'basin') { const g = new THREE.Group(); box(g, 0.5, 0.018, 0.02, 0, 0.9, 0, M.steel); rbox(g, 0.42, 0.5, 0.04, 0.015, 0, 0.66, 0.02, M.towel); place(g, it.x + rx * (it.w / 2 + 0.35), it.y + ry * (it.w / 2 + 0.35), it.rot); }
  }
  // per room: curtains, plants, baseboards, bath tiles, feature walls
  for (const r of L.rooms) {
    if (r.poly.length < 3) continue;
    const living = ['living', 'bedroom'].includes(r.type);
    const faces = innerFaces(r, L);
    if (r.type === 'bath') faces.forEach(f => faceStrip(root, f, 0, Math.min(H, 2.4), 0.012, M.tile));
    else if (r.type !== 'balcony' && r.type !== 'logia') faces.forEach(f => faceStrip(root, f, 0, 0.09, 0.014, M.baseboard));
    // curtains on windows and sliding doors of living spaces
    if (living) for (const o of L.openings) {
      if (!['window', 'slide', 'glass'].includes(o.type)) continue;
      const mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2;
      const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1), ux = (o.x2 - o.x1) / len, uy = (o.y2 - o.y1) / len;
      let nx = -uy, ny = ux; const wl = hostWall(o, L.walls); const t = wl ? wl.t : 0.15;
      if (!pointInPoly(mx + nx * 0.35, my + ny * 0.35, r.poly)) { nx = -nx; ny = -ny; if (!pointInPoly(mx + nx * 0.35, my + ny * 0.35, r.poly)) continue; }
      if ((o.head || 2.6) < 1.5) continue;                     // no curtains on low balustrades
      const ch = Math.min(H - 0.03, 2.6); if (ch < 0.5) continue;
      for (const end of [0, 1]) {
        const ex = end ? o.x2 : o.x1, ey = end ? o.y2 : o.y1, dir = end ? -1 : 1;
        const cx = ex + ux * dir * 0.18 + nx * (t / 2 + 0.1), cy = ey + uy * dir * 0.18 + ny * (t / 2 + 0.1);
        const g = new THREE.Group(), folds = 5;
        for (let k = 0; k < folds; k++) cyl(g, 0.045, 0.045, ch, -0.16 + k * 0.08, ch / 2 + 0.02, (k % 2) * 0.03, M.curtain, 10);
        place(g, cx, cy, -Math.atan2(uy, ux) * 180 / Math.PI);
      }
      // sheer across the middle
      const sh = new THREE.Group(); box(sh, Math.max(0.1, len - 0.7), ch, 0.01, 0, ch / 2 + 0.02, 0, M.sheer);
      place(sh, mx + nx * (t / 2 + 0.06), my + ny * (t / 2 + 0.06), -Math.atan2(uy, ux) * 180 / Math.PI);
    }
    // plants near glazing of the living room and balconies
    if (!noPlants && (r.type === 'living' || r.type === 'balcony' || (r.type === 'bedroom' && rich >= 2))) {
      let n = r.type === 'living' ? 1 + rich : 1;
      for (const o of L.openings) {
        if (n <= 0) break; if (!['slide', 'glass', 'window'].includes(o.type)) continue;
        const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1), ux = (o.x2 - o.x1) / len, uy = (o.y2 - o.y1) / len;
        let nx = -uy, ny = ux;
        for (const end of [0, 1]) {
          if (n <= 0) break;
          const ex = end ? o.x2 : o.x1, ey = end ? o.y2 : o.y1, dir = end ? 1 : -1;
          for (const sgn of [1, -1]) {
            const px = ex + ux * dir * 0.3 + nx * sgn * 0.45, py = ey + uy * dir * 0.3 + ny * sgn * 0.45;
            if (!pointInPoly(px, py, r.poly)) continue;
            const clash = L.items.some(it => Math.hypot(it.x - px, it.y - py) < Math.max(it.w, it.d) / 2 + 0.25) || L.openings.some(q => (q.type === 'door' || q.type === 'main') && Math.hypot((q.x1 + q.x2) / 2 - px, (q.y1 + q.y2) / 2 - py) < 1.1);
            if (clash) continue;
            const g = new THREE.Group(); plant(g, M, 0, 0, r.type === 'balcony' ? 0.9 : 1.15); place(g, px, py, 0); n--; break;
          }
        }
      }
    }
  }
}

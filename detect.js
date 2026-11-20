// Rule-based floor-plan reader (no AI, runs in the browser).
// Works on plans where walls are drawn as solid dark fills (the common sales-brochure style).
// Input: {data: RGBA Uint8ClampedArray, width, height}. Output coordinates are in INPUT PIXELS.

export function detectLayout(img, opt = {}) {
  const { width: W, height: H, data } = img;
  const N = W * H;
  // ── 1. pixel classes ──
  const lum = new Float32Array(N), sat = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255, a = data[i * 4 + 3] / 255;
    const R = r * a + (1 - a), G = g * a + (1 - a), B = b * a + (1 - a);
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    lum[i] = 0.299 * R + 0.587 * G + 0.114 * B; sat[i] = mx > 0 ? (mx - mn) / mx : 0;
  }
  // wall threshold: dark, unsaturated. Adapt to the image: use the darkest big cluster.
  const thr = opt.wallLum || autoWallThreshold(lum, sat);
  const dark = new Uint8Array(N), line = new Uint8Array(N);
  const avg = boxMean(lum, W, H, 4);
  for (let i = 0; i < N; i++) { dark[i] = lum[i] < thr && sat[i] < 0.35 ? 1 : 0; line[i] = (lum[i] < Math.min(0.6, thr + 0.2) || lum[i] < avg[i] - 0.09) ? 1 : 0; }

  // ── 2. wall thickness from run lengths, then remove thin lines (furniture, text, door leaves) ──
  const t0 = estimateThickness(dark, W, H);
  const r = Math.max(1, Math.floor(t0 * 0.22));
  const wall = open(dark, W, H, r);
  const t = estimateThickness(wall, W, H) || t0;

  // ── 3. wall rectangles → centre-line segments ──
  const minLen = Math.max(6, t * 1.2);
  const hs = rects(wall, W, H, true, minLen, t), vs = rects(wall, W, H, false, minLen, t);
  let segs = [
    ...hs.map(g => ({ o: 'h', c: (g.a0 + g.a1) / 2, s: g.b0, e: g.b1, t: g.a1 - g.a0 + 1 })),
    ...vs.map(g => ({ o: 'v', c: (g.a0 + g.a1) / 2, s: g.b0, e: g.b1, t: g.a1 - g.a0 + 1 }))
  ];
  segs = mergeCollinear(segs, t);
  // ── 4. outside region (for exterior detection) computed on the raw wall mask with gaps still open ──
  // ── 5. gaps between collinear pieces and from a free end to the next wall → openings ──
  const openings = [];
  const gapsOf = list => {
    const byLine = groupBy(list, s => s.o + Math.round(s.c / (t * 0.6)));
    for (const k in byLine) {
      const L = byLine[k].sort((a, b) => a.s - b.s);
      for (let i = 0; i + 1 < L.length; i++) {
        const a = L[i], b = L[i + 1], g = b.s - a.e;
        if (g > t * 1.2 && g < t * 30 && !mostlyWall(dark, W, H, a.o, (a.c + b.c) / 2, a.e, b.s, t)) openings.push({ o: a.o, c: (a.c + b.c) / 2, s: a.e, e: b.s, t: Math.max(a.t, b.t), nb: Math.min(a.e - a.s, b.e - b.s), dt: Math.abs(a.t - b.t) });
      }
    }
  };
  gapsOf(segs);
  // free ends: ray-cast along the axis to the next wall pixel
  for (const s of segs) for (const end of [0, 1]) {
    const p0 = end ? s.e : s.s, dir = end ? 1 : -1;
    if (touchesPerp(s, p0, segs, t)) continue;
    let d = 0, hit = -1;
    for (d = Math.ceil(t * 0.6); d < t * 30; d++) {
      const p = p0 + dir * d; const [x, y] = s.o === 'h' ? [p, s.c] : [s.c, p];
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      if (wall[Math.round(y) * W + Math.round(x)]) { hit = d; break; }
    }
    if (hit > t * 1.2 && !mostlyWall(dark, W, H, s.o, s.c, Math.min(p0, p0 + dir * hit), Math.max(p0, p0 + dir * hit), t)) {
      const a = p0, b = p0 + dir * hit;
      if (!openings.some(o => o.o === s.o && Math.abs(o.c - s.c) < t && Math.min(o.e, Math.max(a, b)) - Math.max(o.s, Math.min(a, b)) > 0)) {
        openings.push({ o: s.o, c: s.c, s: Math.min(a, b), e: Math.max(a, b), t: s.t, free: true });
      }
    }
  }
  // ── 6. barrier = walls + openings closed → outside flood fill → rooms ──
  const barrier = wall.slice();
  const stamp = (o, th) => { const hw = Math.max(1, Math.ceil(th / 2)); for (let p = Math.floor(o.s) - 1; p <= Math.ceil(o.e) + 1; p++) for (let q = -hw; q <= hw; q++) { const [x, y] = o.o === 'h' ? [p, Math.round(o.c) + q] : [Math.round(o.c) + q, p]; if (x >= 0 && y >= 0 && x < W && y < H) barrier[y * W + x] = 1; } };
  openings.forEach(o => stamp(o, o.t));
  // also extend every segment by t at both ends to seal corners
  segs.forEach(s => stamp({ o: s.o, c: s.c, s: s.s - t * 0.6, e: s.e + t * 0.6 }, s.t));
  const label = new Int32Array(N).fill(-1);
  // the outside is the light, neutral background reachable from the image border (coloured floors stop it,
  // so balconies and rooms with thin window lines are not lost)
  const outBar = new Uint8Array(N);
  for (let i = 0; i < N; i++) outBar[i] = barrier[i] || !(lum[i] > 0.86 && sat[i] < 0.12) ? 1 : 0;
  const lab0 = new Int32Array(N).fill(-1);
  flood(outBar, W, H, lab0, 0, null, true);
  for (let i = 0; i < N; i++) if (lab0[i] === 0) label[i] = 0;
  const comps = [];
  let id = 1;
  for (let i = 0; i < N; i++) if (!barrier[i] && label[i] === -1) { const c = flood(barrier, W, H, label, id, null, false, i); comps.push(c); id++; }
  // ── 7. classify openings with the door-arc test, exterior vs interior ──
  const side = (o, sg) => { // sample a point on one side of the opening
    const m = (o.s + o.e) / 2, d = o.t * 0.5 + t * 1.5; const [x, y] = o.o === 'h' ? [m, o.c + sg * d] : [o.c + sg * d, m];
    const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0; return label[yi * W + xi];
  };
  const out = [];
  for (const o of openings) {
    const len = o.e - o.s;
    const A = o.o === 'h' ? [o.s, o.c] : [o.c, o.s], B = o.o === 'h' ? [o.e, o.c] : [o.c, o.e];
    const sA = side(o, -1), sB = side(o, 1);
    const ext = sA === 0 || sB === 0;
    const door = arcTest(line, W, H, A, B);
    const glazed = lineAlong(line, wall, W, H, o, t) > 0.55;
    let type;
    if (door.score > 0.42 && len < t * 11) type = ext ? 'main' : 'door';
    else if (ext) type = len > t * 14 ? 'glass' : 'window';
    else if (glazed && len > t * 5) type = 'slide';
    else if (!o.free && o.nb >= t * 4 && o.dt <= t * 0.35 && len >= t * 4 && len <= t * 9) type = 'door';          // door-sized gap without a drawn arc: still a doorway
    else continue;                                     // open passage: no door or glass drawn
    out.push({ type, x1: A[0], y1: A[1], x2: B[0], y2: B[1], hinge: door.hinge || 1, swing: door.swing || 1, score: door.score, ext, t: o.t });
  }
  // ── 7b. rooms are separated only by walls and real doors/windows (open passages stay open) ──
  const bar2 = wall.slice();
  segs.forEach(sg => stamp2(bar2, W, H, { o: sg.o, c: sg.c, s: sg.s - t * 0.6, e: sg.e + t * 0.6 }, sg.t));
  for (const o of out) { const h = Math.abs(o.y1 - o.y2) < 1; stamp2(bar2, W, H, { o: h ? 'h' : 'v', c: h ? o.y1 : o.x1, s: Math.min(h ? o.x1 : o.y1, h ? o.x2 : o.y2), e: Math.max(h ? o.x1 : o.y1, h ? o.x2 : o.y2) }, o.t); }
  for (let i = 0; i < N; i++) if (label[i] !== 0) label[i] = -1;
  comps.length = 0; id = 1;
  for (let i = 0; i < N; i++) if (!bar2[i] && label[i] === -1) { comps.push(flood(bar2, W, H, label, id, null, false, i)); id++; }
  // ── 8. room polygons (grown by half a wall so they sit on wall centre lines) ──
  const rooms = [];
  for (const c of comps) {
    if (c.n < (t * 9) ** 2) continue;                  // closets, shaft boxes, symbol interiors
    const [bx0, by0, bx1, by1] = c.bbox; if (bx0 <= 1 || by0 <= 1 || bx1 >= W - 2 || by1 >= H - 2) continue;
    const poly = traceOrthoPolygon(label, W, H, c.id, c.bbox, t);
    if (poly && poly.length >= 4) rooms.push({ poly, areaPx: c.n, bbox: c.bbox, touchesExt: false });
  }
  // keep only the most convincing main door
  const mains = out.filter(o => o.type === 'main').sort((a, b) => b.score - a.score);
  mains.slice(1).forEach(o => o.type = 'door');
  if (!mains.length) {   // no confident entrance: take the door-sized exterior opening with the best arc evidence
    const cand = out.filter(o => o.ext && o.score > 0.25 && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) <= t * 11).sort((a, b) => b.score - a.score)[0];
    if (cand) cand.type = 'main';
  }
  // facade edges of rooms with no wall drawn (glass balustrades, full-height glazing) → wall + glass
  const tExt = Math.max(t, median(segs.map(s => s.t).filter(v => v > t * 1.15)) || t * 1.5);
  for (const rm of rooms) {
    const P = rm.poly;
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
      const horiz = ay === by, len = Math.abs(horiz ? bx - ax : by - ay); if (len < t * 3) continue;
      const c = horiz ? ay : ax, s0 = Math.min(horiz ? ax : ay, horiz ? bx : by), e0 = Math.max(horiz ? ax : ay, horiz ? bx : by);
      // which side is outside?
      let outSide = 0;
      for (const sg of [-1, 1]) {
        let o = 0, n = 0;
        for (let k = 1; k < 8; k++) { const p = s0 + (e0 - s0) * k / 8; const [x, y] = horiz ? [p, c + sg * t * 1.4] : [c + sg * t * 1.4, p]; const xi = Math.round(x), yi = Math.round(y); n++; if (xi < 0 || yi < 0 || xi >= W || yi >= H || label[yi * W + xi] === 0) o++; }
        if (o / n > 0.5) outSide = sg;
      }
      if (!outSide) continue;
      // uncovered parts of the edge
      let free = [[s0, e0]];
      for (const sg of segs) {
        if ((sg.o === 'h') !== horiz || Math.abs(sg.c - c) > t * 1.3) continue;
        free = free.flatMap(([a, b]) => sg.e <= a || sg.s >= b ? [[a, b]] : [[a, sg.s], [sg.e, b]].filter(([q, r]) => r - q > 1));
      }
      // existing openings on this edge are already handled
      for (const o of out) {
        const oh = Math.abs(o.y1 - o.y2) < 1; if (oh !== horiz) continue;
        const oc = horiz ? o.y1 : o.x1; if (Math.abs(oc - c) > t * 1.5) continue;
        const os = Math.min(horiz ? o.x1 : o.y1, horiz ? o.x2 : o.y2) - t * 0.5, oe = Math.max(horiz ? o.x1 : o.y1, horiz ? o.x2 : o.y2) + t * 0.5;
        free = free.flatMap(([a, b]) => oe <= a || os >= b ? [[a, b]] : [[a, os], [oe, b]].filter(([q, r]) => r - q > 1));
      }
      for (const [a, b] of free) {
        if (b - a < t * 2.5) continue;
        // a solid wall the rectangle pass missed (thickness step etc.): add the wall, no glass
        let wpx = 0, n = 0;
        for (let p = Math.ceil(a); p <= b; p += 2) { n++; for (let q = -Math.ceil(t); q <= Math.ceil(t); q++) { const [x, y] = horiz ? [p, Math.round(c) + q] : [Math.round(c) + q, p]; if (x >= 0 && y >= 0 && x < W && y < H && wall[y * W + x]) { wpx++; break; } } }
        if (n && wpx / n > 0.6) { segs.push({ o: horiz ? 'h' : 'v', c, s: a, e: b, t: tExt, facade: true }); continue; }
        const wl = horiz ? { x1: a, y1: c, x2: b, y2: c, t: tExt } : { x1: c, y1: a, x2: c, y2: b, t: tExt };
        segs.push({ o: horiz ? 'h' : 'v', c, s: a, e: b, t: tExt, facade: true });
        const m = t * 0.3;
        out.push({ type: 'glass', x1: horiz ? a + m : c, y1: horiz ? c : a + m, x2: horiz ? b - m : c, y2: horiz ? c : b - m, hinge: 1, swing: 1, score: 0, ext: true, t: tExt });
      }
    }
  }
  // bridge every opening with wall so doors and windows sit on one continuous wall (lintel / sill above and below)
  for (const o of out) {
    const h = Math.abs(o.y1 - o.y2) < 1;
    const c = h ? o.y1 : o.x1, a = Math.min(h ? o.x1 : o.y1, h ? o.x2 : o.y2), b = Math.max(h ? o.x1 : o.y1, h ? o.x2 : o.y2);
    segs.push({ o: h ? 'h' : 'v', c, s: a - t * 0.3, e: b + t * 0.3, t: o.t || t });
  }
  segs = mergeCollinear(segs, t);
  const walls = segs.map(s => s.o === 'h' ? { x1: s.s, y1: s.c, x2: s.e, y2: s.c, t: s.t } : { x1: s.c, y1: s.s, x2: s.c, y2: s.e, t: s.t });
  // snap openings onto their merged wall line
  for (const o of out) {
    const h = Math.abs(o.y1 - o.y2) < 1, c = h ? o.y1 : o.x1, m = (h ? o.x1 + o.x2 : o.y1 + o.y2) / 2;
    const w = segs.find(sg => (sg.o === 'h') === h && Math.abs(sg.c - c) <= t && m >= sg.s && m <= sg.e);
    if (w) { if (h) { o.y1 = o.y2 = w.c; } else { o.x1 = o.x2 = w.c; } }
  }
  return { walls, openings: out, rooms, t, tExt, thr };
}

function autoWallThreshold(lum, sat) {
  // histogram of low-saturation luminance; walls are the darkest substantial mass
  const h = new Array(64).fill(0); let n = 0;
  for (let i = 0; i < lum.length; i += 2) if (sat[i] < 0.35) { h[Math.min(63, Math.floor(lum[i] * 64))]++; n++; }
  let acc = 0, k = 0;
  for (k = 0; k < 40; k++) { acc += h[k]; if (acc > n * 0.02 && h[k + 1] < h[k] * 0.6 && k > 6) break; }
  return Math.min(0.5, Math.max(0.28, (k + 2) / 64));
}

function estimateThickness(m, W, H) {
  const runs = new Map();
  const add = l => { if (l >= 3 && l <= 80) runs.set(l, (runs.get(l) || 0) + l); };
  for (let y = 0; y < H; y += 2) { let l = 0; for (let x = 0; x < W; x++) { if (m[y * W + x]) l++; else { add(l); l = 0; } } add(l); }
  for (let x = 0; x < W; x += 2) { let l = 0; for (let y = 0; y < H; y++) { if (m[y * W + x]) l++; else { add(l); l = 0; } } add(l); }
  let best = 0, bv = 0;
  for (const [l, v] of runs) { const s = v + (runs.get(l - 1) || 0) * 0.5 + (runs.get(l + 1) || 0) * 0.5; if (s > bv) { bv = s; best = l; } }
  return best;
}

function minmax(src, W, H, r, isMin, horiz) {
  const dst = new Uint8Array(W * H);
  const len = horiz ? W : H, cnt = horiz ? H : W;
  for (let k = 0; k < cnt; k++) {
    // running count of zeros (for min) / ones (for max) in the window
    let c = 0;
    const at = i => horiz ? src[k * W + i] : src[i * W + k];
    const want = isMin ? 0 : 1;
    for (let i = -r; i <= r; i++) if (i >= 0 && i < len && at(i) === want) c++;
    for (let i = 0; i < len; i++) {
      const v = isMin ? (c ? 0 : 1) : (c ? 1 : 0);
      if (horiz) dst[k * W + i] = v; else dst[i * W + k] = v;
      const out = i - r, inn = i + r + 1;
      if (out >= 0 && at(out) === want) c--;
      if (inn < len && at(inn) === want) c++;
    }
    if (isMin) { /* outside the image counts as 0 → treat borders as background */ }
  }
  return dst;
}
function open(m, W, H, r) {
  let e = minmax(m, W, H, r, true, true); e = minmax(e, W, H, r, true, false);
  let d = minmax(e, W, H, r, false, true); d = minmax(d, W, H, r, false, false);
  return d;
}

// group runs of wall pixels into axis-aligned rectangles.
// horiz=true → runs along x, stacked rows → horizontal walls. a = cross axis (thickness), b = along axis.
function rects(m, W, H, horiz, minLen, t) {
  const along = horiz ? W : H, across = horiz ? H : W;
  const groups = [], active = [];
  for (let a = 0; a < across; a++) {
    const runs = []; let s = -1;
    for (let b = 0; b <= along; b++) {
      const v = b < along && (horiz ? m[a * W + b] : m[b * W + a]);
      if (v && s < 0) s = b; else if (!v && s >= 0) { if (b - s >= minLen) runs.push([s, b - 1]); s = -1; }
    }
    const used = new Set();
    for (let gi = active.length - 1; gi >= 0; gi--) {
      const g = active[gi];
      const ri = runs.findIndex((r, j) => !used.has(j) && Math.abs(r[0] - g.b0) <= t * 0.6 && Math.abs(r[1] - g.b1) <= t * 0.6);
      if (ri >= 0) { used.add(ri); g.a1 = a; g.b0 = Math.round((g.b0 * g.n + runs[ri][0]) / (g.n + 1)); g.b1 = Math.round((g.b1 * g.n + runs[ri][1]) / (g.n + 1)); g.n++; }
      else { groups.push(g); active.splice(gi, 1); }
    }
    runs.forEach((r, j) => { if (!used.has(j)) active.push({ a0: a, a1: a, b0: r[0], b1: r[1], n: 1 }); });
  }
  groups.push(...active);
  // a wall: thickness between 0.45 t and 3.2 t, and longer than it is thick
  return groups.filter(g => { const th = g.a1 - g.a0 + 1, ln = g.b1 - g.b0 + 1; return th >= Math.max(2, t * 0.45) && th <= t * 3.2 && ln >= th * 1.5; });
}

function mergeCollinear(segs, t) {
  const out = [];
  const byLine = groupBy(segs, s => s.o);
  for (const o in byLine) {
    const L = byLine[o].sort((a, b) => a.c - b.c || a.s - b.s);
    const used = new Array(L.length).fill(false);
    for (let i = 0; i < L.length; i++) {
      if (used[i]) continue;
      const cur = { ...L[i] }; used[i] = true;
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < L.length; j++) {
          if (used[j]) continue; const s = L[j];
          if (Math.abs(s.c - cur.c) <= t * 0.5 && s.s <= cur.e + t * 0.5 && s.e >= cur.s - t * 0.5) {
            cur.c = (cur.c * (cur.e - cur.s) + s.c * (s.e - s.s)) / (cur.e - cur.s + s.e - s.s);
            cur.s = Math.min(cur.s, s.s); cur.e = Math.max(cur.e, s.e); cur.t = Math.max(cur.t, s.t); used[j] = true; changed = true;
          }
        }
      }
      out.push(cur);
    }
  }
  return out;
}
function touchesPerp(s, p, segs, t) {
  for (const q of segs) {
    if (q.o === s.o) continue;
    // q is perpendicular: its centre line is at coordinate q.c along s's axis
    if (Math.abs(q.c - p) <= q.t / 2 + t * 0.9 && s.c >= q.s - t && s.c <= q.e + t) return true;
  }
  return false;
}
function groupBy(a, f) { const m = {}; a.forEach(x => (m[f(x)] = m[f(x)] || []).push(x)); return m; }

// flood fill; when fromBorder, seeds all border pixels and labels them `id` (0 = outside)
function flood(bar, W, H, label, id, _, fromBorder, seed) {
  const st = [];
  if (fromBorder) { for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y++) { st.push(y * W, y * W + W - 1); } }
  else st.push(seed);
  let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
  while (st.length) {
    const i = st.pop();
    if (bar[i] || label[i] !== -1) continue;
    label[i] = id; n++;
    const x = i % W, y = (i / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W);
  }
  return { id, n, bbox: [x0, y0, x1, y1] };
}

// door arc / leaf test around an opening A–B. Tries both hinge ends and both sides.
function arcTest(line, W, H, A, B) {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 4) return { score: 0 };
  const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, nx = -uy, ny = ux;
  const hit = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xi = Math.round(x) + dx, yi = Math.round(y) + dy; if (xi >= 0 && yi >= 0 && xi < W && yi < H && line[yi * W + xi]) return 1; } return 0; };
  let best = { score: 0 };
  for (const hinge of [1, 2]) for (const swing of [1, -1]) {
    const hx = hinge === 1 ? A[0] : B[0], hy = hinge === 1 ? A[1] : B[1];
    const dx0 = hinge === 1 ? ux : -ux, dy0 = hinge === 1 ? uy : -uy;      // from hinge toward the free end
    const px = nx * swing, py = ny * swing;
    let arc = 0, leaf = 0; const n = 24;
    for (let k = 3; k < n - 2; k++) { const a = (k / n) * Math.PI / 2; const vx = dx0 * Math.cos(a) + px * Math.sin(a), vy = dy0 * Math.cos(a) + py * Math.sin(a); arc += hit(hx + vx * L * 0.97, hy + vy * L * 0.97); }
    for (let k = 3; k <= 12; k++) leaf += hit(hx + px * L * k / 13, hy + py * L * k / 13);
    const score = (arc / (n - 5)) * 0.65 + (leaf / 10) * 0.35;
    if (score > best.score) best = { score, hinge, swing };
  }
  return best;
}

// outline of a labelled component as an orthogonal polygon, grown by ~half a wall
function traceOrthoPolygon(label, W, H, id, bbox, t) {
  const g = Math.max(2, Math.round(t / 2));           // grid cell
  const [x0, y0, x1, y1] = bbox;
  const gx0 = Math.floor(x0 / g) - 2, gy0 = Math.floor(y0 / g) - 2, gw = Math.ceil((x1 - x0) / g) + 5, gh = Math.ceil((y1 - y0) / g) + 5;
  const cell = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    let c = 0, tot = 0;
    for (let yy = 0; yy < g; yy++) for (let xx = 0; xx < g; xx++) { const x = (gx0 + cx) * g + xx, y = (gy0 + cy) * g + yy; if (x >= 0 && y >= 0 && x < W && y < H) { tot++; if (label[y * W + x] === id) c++; } }
    cell[cy * gw + cx] = tot && c / tot > 0.3 ? 1 : 0;
  }
  // close holes left by furniture symbols (they are not part of the floor colour but are inside the room)
  const filled = fillHoles(cell, gw, gh);
  // grow by one cell (≈ half a wall) toward the surrounding walls
  const grown = new Uint8Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) if (filled[y * gw + x] || filled[y * gw + x - 1] || filled[y * gw + x + 1] || filled[(y - 1) * gw + x] || filled[(y + 1) * gw + x]) grown[y * gw + x] = 1;
  const sm = smooth(grown, gw, gh);
  const loop = boundary(sm, gw, gh);
  if (!loop) return null;
  const pts = simplifyOrtho(loop).map(([x, y]) => [(gx0 + x) * g, (gy0 + y) * g]);
  return pts;
}
function fillHoles(c, w, h) {
  const out = new Uint8Array(w * h).fill(1), st = [];
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const i = st.pop(); if (c[i] || !out[i]) continue; out[i] = 0; const x = i % w, y = (i / w) | 0; if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w); }
  return out;
}
// outer boundary of the filled cells as a polygon (cell-corner coordinates), by chaining directed edges
function boundary(c, w, h) {
  const out = new Map(); const key = (x, y) => x + ',' + y;
  const addE = (x1, y1, x2, y2) => { const k = key(x1, y1); if (!out.has(k)) out.set(k, []); out.get(k).push([x2, y2]); };
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && c[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    if (!on(x, y - 1)) addE(x, y, x + 1, y);
    if (!on(x + 1, y)) addE(x + 1, y, x + 1, y + 1);
    if (!on(x, y + 1)) addE(x + 1, y + 1, x, y + 1);
    if (!on(x - 1, y)) addE(x, y + 1, x, y);
  }
  let best = null;
  const used = new Set();
  for (const [k0, list] of out) {
    for (let li = 0; li < list.length; li++) {
      const ek = k0 + '>' + li; if (used.has(ek)) continue;
      const pts = []; let [x, y] = k0.split(',').map(Number), cur = ek, guard = 0, nx, ny;
      [nx, ny] = list[li]; used.add(ek); pts.push([x, y]);
      while (guard++ < 200000) {
        x = nx; y = ny; if (key(x, y) === k0) break;
        pts.push([x, y]);
        const L = out.get(key(x, y)); if (!L) break;
        let j = L.findIndex((_, jj) => !used.has(key(x, y) + '>' + jj)); if (j < 0) break;
        used.add(key(x, y) + '>' + j); [nx, ny] = L[j];
      }
      if (!best || pts.length > best.length) best = pts;
    }
  }
  return best;
}
function simplifyOrtho(pts) {
  let p = pts.slice();
  return p.filter((q, i) => { const a = p[(i - 1 + p.length) % p.length], b = p[(i + 1) % p.length]; return !((a[0] === q[0] && q[0] === b[0]) || (a[1] === q[1] && q[1] === b[1])); });
}

function smooth(c, w, h) {
  const op = (src, isMin) => { const d = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = isMin ? 1 : 0; for (let k = -1; k <= 1; k++) for (let l = -1; l <= 1; l++) { const xx = x + l, yy = y + k; const s = xx >= 0 && yy >= 0 && xx < w && yy < h ? src[yy * w + xx] : 0; if (isMin) v &= s; else v |= s; } d[y * w + x] = v; } return d; };
  return op(op(op(op(c, false), true), true), false);   // close then open
}

function median(a) { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; }
function mostlyWall(m, W, H, o, c, s, e, t) {
  // a gap is fake when solid wall fill (not thin window lines) runs along most of it, within ±1.3 t
  let w = 0, n = 0; const band = Math.ceil(t * 1.3), need = Math.max(3, Math.round(t * 0.4));
  for (let p = Math.ceil(s); p <= e; p++) {
    let run = 0, best = 0;
    for (let q = -band; q <= band; q++) { const [x, y] = o === 'h' ? [p, Math.round(c) + q] : [Math.round(c) + q, p]; if (x >= 0 && y >= 0 && x < W && y < H && m[y * W + x]) { run++; if (run > best) best = run; } else run = 0; }
    n++; if (best >= need) w++;
  }
  return n > 0 && w / n > 0.6;
}

function stamp2(bar, W, H, o, th) { const hw = Math.max(1, Math.ceil(th / 2)); for (let p = Math.floor(o.s) - 1; p <= Math.ceil(o.e) + 1; p++) for (let q = -hw; q <= hw; q++) { const [x, y] = o.o === 'h' ? [p, Math.round(o.c) + q] : [Math.round(o.c) + q, p]; if (x >= 0 && y >= 0 && x < W && y < H) bar[y * W + x] = 1; } }
function boxMean(a, W, H, r) {
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += a[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1);
    out[y * W + x] = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  }
  return out;
}

// share of the gap where thin drawn lines (glass) run along it
function lineAlong(line, wall, W, H, o, t) {
  let hit = 0, n = 0; const band = Math.ceil(t * 0.7);
  for (let p = Math.ceil(o.s + t * 0.3); p <= o.e - t * 0.3; p += 2) {
    n++;
    for (let q = -band; q <= band; q++) { const [x, y] = o.o === 'h' ? [p, Math.round(o.c) + q] : [Math.round(o.c) + q, p]; if (x >= 0 && y >= 0 && x < W && y < H && line[y * W + x] && !wall[y * W + x]) { hit++; break; } }
  }
  return n ? hit / n : 0;
}

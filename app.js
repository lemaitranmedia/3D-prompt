import { CATALOG, OPEN_TYPES, ROOM_TYPES, DIR_VI, dirKey, norm360, emptyLayout, sampleLayout, uid, dist, projOnSeg, polyArea, polyCentroid, pointInPoly, itemCorners, hostWall, opDefaults, isGlazing, MECH, GLASS_HEIGHTS, heightKey, CEIL_H } from './model.js?v=8';
import { detectLayout } from './detect.js?v=8';
import { Viewer3D } from './scene3d.js?v=8';
import { buildPrompts, inventory, warnings } from './prompt.js?v=8';

{
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const STYLES = window.STYLES, GROUPS = window.STYLE_GROUPS;
let L = emptyLayout();
let step = 1, mode = 'select', sel = null, itemType = 'bed', styleKey = 'lux_modern_light';
const undoStack = [];
const imgEl = new Image();
let imgURL = null;

// ── persistence (viewer convenience only) ──
function saveLocal() { try { localStorage.setItem('bocmai.layout', JSON.stringify({ L, styleKey })); } catch (e) {} }
function loadLocal() { try { const s = JSON.parse(localStorage.getItem('bocmai.layout')); if (s && s.L && s.L.walls) { L = s.L; styleKey = s.styleKey || styleKey; return true; } } catch (e) {} return false; }
function snap() { undoStack.push(JSON.stringify(L)); if (undoStack.length > 60) undoStack.shift(); }
function undo() { if (!undoStack.length) return; L = JSON.parse(undoStack.pop()); sel = null; afterChange(); }
function afterChange() { saveLocal(); draw2d(); showProps(); dirty3d = true; ptURL = null; }

// ═════════════ 2D EDITOR ═════════════
const cv = $('#c2d'), ctx = cv.getContext('2d');
let vw = { x: 0, y: 0, z: 60 }; // screen = (m - vw.x)*z
let imgOpacity = 0.55;
let draft = null;   // in-progress wall chain / room polygon / scale line
let mouse = { x: 0, y: 0, mx: 0, my: 0 };
let drag = null;

const toS = (x, y) => [(x - vw.x) * vw.z, (y - vw.y) * vw.z];
const toM = (sx, sy) => [sx / vw.z + vw.x, sy / vw.z + vw.y];

function resize2d() {
  const r = cv.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw2d();
}
new ResizeObserver(resize2d).observe(cv.parentElement);

function fit2d() {
  const r = cv.parentElement.getBoundingClientRect();
  let x0, y0, x1, y1;
  if (L.img) { x0 = 0; y0 = 0; x1 = L.img.w * L.scale; y1 = L.img.h * L.scale; }
  else { const b = L.walls.length ? L.walls.reduce((a, w) => ({ x0: Math.min(a.x0, w.x1, w.x2), y0: Math.min(a.y0, w.y1, w.y2), x1: Math.max(a.x1, w.x1, w.x2), y1: Math.max(a.y1, w.y1, w.y2) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }) : { x0: 0, y0: 0, x1: 12, y1: 9 }; ({ x0, y0, x1, y1 } = b); }
  const padT = 64, pad = 24;
  const z = Math.min((r.width - pad * 2) / (x1 - x0), (r.height - padT - 60) / (y1 - y0));
  vw = { z, x: x0 - (r.width / z - (x1 - x0)) / 2, y: y0 - (padT + ((r.height - padT - 60) / z - (y1 - y0)) * z / 2) / z };
  draw2d();
}

const COL = { wall: '#e9e4da', wallSel: '#e8c98e', room: 'rgba(200,169,110,0.10)', roomSel: 'rgba(200,169,110,0.28)', door: '#7fc7ff', main: '#ffb36b', window: '#9fe0c9', slide: '#9fe0c9', glass: '#9fd6e0', item: 'rgba(240,237,232,0.16)', itemLine: '#f0ede8' };

function draw2d() {
  if (cv.style.display === 'none') return;
  const W = cv.clientWidth, H = cv.clientHeight;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#1b1b1a'; ctx.fillRect(0, 0, W, H);
  // grid (1 m)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  const [gx0, gy0] = toM(0, 0), [gx1, gy1] = toM(W, H);
  if (vw.z > 12) { ctx.beginPath(); for (let x = Math.floor(gx0); x <= gx1; x++) { const [sx] = toS(x, 0); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); } for (let y = Math.floor(gy0); y <= gy1; y++) { const [, sy] = toS(0, y); ctx.moveTo(0, sy); ctx.lineTo(W, sy); } ctx.stroke(); }
  // underlay
  if (L.img && imgEl.complete && imgEl.naturalWidth) {
    ctx.globalAlpha = imgOpacity; const [sx, sy] = toS(0, 0);
    ctx.drawImage(imgEl, sx, sy, L.img.w * L.scale * vw.z, L.img.h * L.scale * vw.z); ctx.globalAlpha = 1;
  }
  // rooms
  for (const r of L.rooms) {
    if (r.poly.length < 2) continue;
    ctx.beginPath(); r.poly.forEach(([x, y], i) => { const [sx, sy] = toS(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.closePath();
    ctx.fillStyle = sel === r ? COL.roomSel : COL.room; ctx.fill();
    ctx.strokeStyle = sel === r ? '#e8c98e' : 'rgba(200,169,110,0.5)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    if (r.poly.length > 2) { const [cx, cy] = polyCentroid(r.poly); const [sx, sy] = toS(cx, cy); ctx.fillStyle = '#f0ede8'; ctx.font = '600 12px DM Sans'; ctx.textAlign = 'center'; ctx.fillText(r.name, sx, sy); ctx.font = '11px DM Sans'; ctx.fillStyle = '#c8a96e'; ctx.fillText(polyArea(r.poly).toFixed(1) + ' m²', sx, sy + 14); }
  }
  // walls
  for (const w of L.walls) {
    const [a, b] = toS(w.x1, w.y1), [c, d] = toS(w.x2, w.y2);
    ctx.strokeStyle = sel === w ? COL.wallSel : COL.wall; ctx.lineWidth = Math.max(3, w.t * vw.z); ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
  }
  // openings
  for (const o of L.openings) {
    const [a, b] = toS(o.x1, o.y1), [c, d] = toS(o.x2, o.y2);
    ctx.strokeStyle = sel === o ? '#fff' : COL[o.type]; ctx.lineWidth = Math.max(4, 0.16 * vw.z); ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
    opDefaults(o);
    const Lm = dist(o.x1, o.y1, o.x2, o.y2); if (Lm < 0.01) continue;
    const ux = (o.x2 - o.x1) / Lm, uy = (o.y2 - o.y1) / Lm, nx = -uy * o.swing, ny = ux * o.swing;
    const leaf = (hx, hy, fx, fy, R) => {
      const [hsx, hsy] = toS(hx, hy), [lx, ly] = toS(hx + nx * R, hy + ny * R);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hsx, hsy); ctx.lineTo(lx, ly); ctx.stroke();
      const a0 = Math.atan2(fy - hy, fx - hx), a1 = Math.atan2(ny, nx); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(hsx, hsy, R * vw.z, a0, a0 + da, da < 0); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(hsx, hsy, 3, 0, Math.PI * 2); ctx.fill();
    };
    const mech = isGlazing(o) ? o.mech : (o.leaves === 2 ? 'swing2' : 'swing');
    const mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2;
    if (mech === 'swing2') { leaf(o.x1, o.y1, mx, my, Lm / 2); leaf(o.x2, o.y2, mx, my, Lm / 2); }
    else if (mech === 'swing') { const h2 = o.hinge === 2; leaf(h2 ? o.x2 : o.x1, h2 ? o.y2 : o.y1, h2 ? o.x1 : o.x2, h2 ? o.y1 : o.y2, Lm); }
    else if (mech === 'slide') {      // arrow showing the sliding direction
      const d = o.slideDir >= 0 ? 1 : -1, [ax, ay] = toS(mx - ux * d * Lm * 0.25, my - uy * d * Lm * 0.25), [bx, by] = toS(mx + ux * d * Lm * 0.25, my + uy * d * Lm * 0.25);
      ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      const ang = Math.atan2(by - ay, bx - ax); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 9 * Math.cos(ang - 0.5), by - 9 * Math.sin(ang - 0.5)); ctx.lineTo(bx - 9 * Math.cos(ang + 0.5), by - 9 * Math.sin(ang + 0.5)); ctx.closePath(); ctx.fill();
    }
    if (isGlazing(o) && vw.z > 30) { const [tx, ty] = toS(mx, my); ctx.fillStyle = '#9fe0c9'; ctx.font = '10px DM Sans'; ctx.textAlign = 'center'; ctx.fillText(`${o.sill.toFixed(1)}–${o.head.toFixed(1)}m`, tx + nx * 14, ty + ny * 14 - 4); }
  }
  // items
  for (const it of L.items) {
    const pts = itemCorners(it).map(([x, y]) => toS(x, y));
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.fillStyle = sel === it ? 'rgba(232,201,142,0.35)' : COL.item; ctx.fill();
    ctx.strokeStyle = sel === it ? '#e8c98e' : COL.itemLine; ctx.lineWidth = 1.2; ctx.stroke();
    // front edge marker (thick) = side the item faces
    ctx.strokeStyle = '#ffb36b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...pts[2]); ctx.lineTo(...pts[3]); ctx.stroke();
    if (vw.z > 35) { const [sx, sy] = toS(it.x, it.y); ctx.fillStyle = '#f0ede8'; ctx.font = '10px DM Sans'; ctx.textAlign = 'center'; ctx.fillText(CATALOG[it.type]?.vi || it.type, sx, sy + 3); }
  }
  // draft
  if (draft) {
    ctx.strokeStyle = '#e8c98e'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
    const pts = [...draft.pts, [mouse.mx, mouse.my]];
    pts.forEach(([x, y], i) => { const [sx, sy] = toS(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.stroke(); ctx.setLineDash([]);
    if (draft.kind === 'wall' || draft.kind === 'scale') { const [p] = draft.pts.slice(-1); const len = dist(p[0], p[1], mouse.mx, mouse.my); const [sx, sy] = toS(mouse.mx, mouse.my); ctx.fillStyle = '#e8c98e'; ctx.font = '12px DM Sans'; ctx.textAlign = 'left'; ctx.fillText(len.toFixed(2) + ' m', sx + 10, sy - 10); }
  }
  if (mode === 'item') { const c = CATALOG[itemType]; const ghost = { x: mouse.mx, y: mouse.my, w: c.w, d: c.d, rot: ghostRot }; const pts = itemCorners(ghost).map(([x, y]) => toS(x, y)); ctx.strokeStyle = '#e8c98e'; ctx.setLineDash([4, 3]); ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = '#ffb36b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...pts[2]); ctx.lineTo(...pts[3]); ctx.stroke(); ctx.lineWidth = 1; }
}
let ghostRot = 0;

// snapping: wall endpoints, then orthogonal
function snapPoint(x, y, from) {
  const tol = 10 / vw.z;
  for (const w of L.walls) for (const [px, py] of [[w.x1, w.y1], [w.x2, w.y2]]) if (dist(x, y, px, py) < tol) return [px, py];
  if (draft && draft.pts.length > 2 && draft.kind === 'room') { const [px, py] = draft.pts[0]; if (dist(x, y, px, py) < tol) return [px, py]; }
  if (from) { const dx = x - from[0], dy = y - from[1]; if (Math.abs(dx) > Math.abs(dy) * 4) y = from[1]; else if (Math.abs(dy) > Math.abs(dx) * 4) x = from[0]; }
  // snap to walls' lines for room drawing
  if (mode === 'room') for (const w of L.walls) { const p = projOnSeg(x, y, w.x1, w.y1, w.x2, w.y2); if (p.d < tol * 0.8) return [p.x, p.y]; }
  return [+x.toFixed(3), +y.toFixed(3)];
}

function pick(x, y) {
  const tol = 8 / vw.z;
  for (let i = L.items.length - 1; i >= 0; i--) { if (pointInPoly(x, y, itemCorners(L.items[i]))) return L.items[i]; }
  for (const o of L.openings) if (projOnSeg(x, y, o.x1, o.y1, o.x2, o.y2).d < Math.max(tol, 0.12)) return o;
  for (const w of L.walls) if (projOnSeg(x, y, w.x1, w.y1, w.x2, w.y2).d < Math.max(tol, w.t / 2)) return w;
  for (const r of L.rooms) if (r.poly.length > 2 && pointInPoly(x, y, r.poly)) return r;
  return null;
}
const kindOf = o => !o ? null : L.walls.includes(o) ? 'wall' : L.openings.includes(o) ? 'open' : L.items.includes(o) ? 'item' : L.rooms.includes(o) ? 'room' : null;

function placeOpening(type, x, y) {
  let best = null, bd = 0.6;
  for (const w of L.walls) { const p = projOnSeg(x, y, w.x1, w.y1, w.x2, w.y2); if (p.d < bd) { bd = p.d; best = { w, p }; } }
  if (!best) { setHint('Bấm sát lên một bức tường để đặt ' + OPEN_TYPES[type].vi.toLowerCase() + '.'); return; }
  const { w, p } = best, Lw = p.L, half = Math.min(OPEN_TYPES[type].w, Lw - 0.1) / 2;
  const ux = (w.x2 - w.x1) / Lw, uy = (w.y2 - w.y1) / Lw;
  let t = Math.max(half, Math.min(Lw - half, p.t * Lw));
  snap();
  const o = { id: uid('o'), type, x1: +(w.x1 + ux * (t - half)).toFixed(3), y1: +(w.y1 + uy * (t - half)).toFixed(3), x2: +(w.x1 + ux * (t + half)).toFixed(3), y2: +(w.y1 + uy * (t + half)).toFixed(3), hinge: 1, swing: 1 };
  opDefaults(o);
  // default swing toward the clicked side
  const nx = -uy, ny = ux; o.swing = ((x - p.x) * nx + (y - p.y) * ny) >= 0 ? 1 : -1;
  L.openings.push(o); sel = o; afterChange();
}

cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const [x, y] = toM(sx, sy);
  if (e.button === 1 || e.button === 2 || e.altKey) { drag = { kind: 'pan', sx, sy, vx: vw.x, vy: vw.y }; cv.setPointerCapture(e.pointerId); return; }
  if (mode === 'select') {
    sel = pick(x, y); showProps(); draw2d();
    if (!sel) { drag = { kind: 'pan', sx, sy, vx: vw.x, vy: vw.y }; cv.setPointerCapture(e.pointerId); return; }
    const k = kindOf(sel);
    if (k === 'item') { drag = { kind: 'item', ox: x - sel.x, oy: y - sel.y, pending: true }; }
    else if (k === 'open') { drag = { kind: 'open', x, y, o: JSON.parse(JSON.stringify(sel)), pending: true }; }
    else if (k === 'wall') { const end = dist(x, y, sel.x1, sel.y1) < 12 / vw.z ? 1 : dist(x, y, sel.x2, sel.y2) < 12 / vw.z ? 2 : 0; if (end) { drag = { kind: 'wallEnd', end, pending: true }; } }
    cv.setPointerCapture(e.pointerId); return;
  }
  if (mode === 'wall' || mode === 'room' || mode === 'scale') {
    const from = draft ? draft.pts[draft.pts.length - 1] : null;
    const p = snapPoint(x, y, from);
    if (!draft) { draft = { kind: mode, pts: [p] }; draw2d(); return; }
    if (mode === 'wall') { snap(); L.walls.push({ id: uid('w'), x1: from[0], y1: from[1], x2: p[0], y2: p[1], t: wallT }); draft.pts.push(p); afterChange(); return; }
    if (mode === 'scale') { draft.pts.push(p); finishScale(); return; }
    if (mode === 'room') { const f = draft.pts[0]; if (draft.pts.length > 2 && dist(p[0], p[1], f[0], f[1]) < 1e-6) { finishRoom(); return; } draft.pts.push(p); draw2d(); return; }
  }
  if (mode === 'erase') { const p = pick(x, y); if (p) { sel = p; delSel(); } return; }
  if (OPEN_TYPES[mode]) { placeOpening(mode, x, y); return; }
  if (mode === 'item') { snap(); const c = CATALOG[itemType]; const it = { id: uid('i'), type: itemType, x: +x.toFixed(3), y: +y.toFixed(3), w: c.w, d: c.d, rot: ghostRot }; L.items.push(it); sel = it; afterChange(); }
});
cv.addEventListener('pointermove', e => {
  const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const [x, y] = toM(sx, sy); mouse = { x: sx, y: sy, mx: x, my: y };
  if (draft) { const p = snapPoint(x, y, draft.pts[draft.pts.length - 1]); mouse.mx = p[0]; mouse.my = p[1]; }
  if (!drag) { if (draft || mode === 'item') draw2d(); return; }
  if (drag.pending) { snap(); drag.pending = false; drag.moved = true; }
  if (drag.kind === 'pan') { vw.x = drag.vx - (sx - drag.sx) / vw.z; vw.y = drag.vy - (sy - drag.sy) / vw.z; draw2d(); return; }
  if (drag.kind === 'item') { sel.x = +(x - drag.ox).toFixed(3); sel.y = +(y - drag.oy).toFixed(3); draw2d(); return; }
  if (drag.kind === 'wallEnd') { const [px, py] = snapPoint(x, y, drag.end === 1 ? [sel.x2, sel.y2] : [sel.x1, sel.y1]); if (drag.end === 1) { sel.x1 = px; sel.y1 = py; } else { sel.x2 = px; sel.y2 = py; } draw2d(); return; }
  if (drag.kind === 'open') { // slide along its wall
    const o0 = drag.o, Lm = dist(o0.x1, o0.y1, o0.x2, o0.y2), ux = (o0.x2 - o0.x1) / Lm, uy = (o0.y2 - o0.y1) / Lm;
    const t = (x - drag.x) * ux + (y - drag.y) * uy;
    sel.x1 = +(o0.x1 + ux * t).toFixed(3); sel.y1 = +(o0.y1 + uy * t).toFixed(3); sel.x2 = +(o0.x2 + ux * t).toFixed(3); sel.y2 = +(o0.y2 + uy * t).toFixed(3); draw2d(); }
});
cv.addEventListener('pointerup', () => { if (drag && drag.moved && drag.kind !== 'pan') afterChange(); drag = null; });
cv.addEventListener('dblclick', () => { if (draft && draft.kind === 'room') finishRoom(); else if (draft) { draft = null; draw2d(); } });
cv.addEventListener('wheel', e => {
  e.preventDefault(); const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const [mx, my] = toM(sx, sy); vw.z = Math.max(5, Math.min(600, vw.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  vw.x = mx - sx / vw.z; vw.y = my - sy / vw.z; draw2d();
}, { passive: false });

function finishRoom() {
  if (!draft || draft.pts.length < 3) { draft = null; draw2d(); return; }
  snap(); const r = { id: uid('r'), name: 'Phòng ' + (L.rooms.length + 1), type: 'bedroom', poly: draft.pts }; L.rooms.push(r); draft = null; sel = r; setMode('select'); afterChange();
}
function finishScale() {
  const [[x1, y1], [x2, y2]] = draft.pts; const dm = dist(x1, y1, x2, y2); draft = null; draw2d();
  modal(`<h3 style="margin-bottom:8px">Đo tỷ lệ</h3><p class="muted">Đoạn chị vừa đo đang dài ${dm.toFixed(2)} m theo tỷ lệ hiện tại. Kích thước thật là bao nhiêu mét?</p>
  <input type="number" id="sc-in" step="0.01" value="${dm.toFixed(2)}" style="margin:10px 0"><div class="row"><button class="btn pri" id="sc-ok">Áp dụng</button><button class="btn" id="sc-x">Huỷ</button></div>`);
  $('#sc-ok').onclick = () => { const real = +$('#sc-in').value; if (real > 0 && dm > 0) { snap(); rescale(real / dm); } closeModal(); setMode('select'); };
  $('#sc-x').onclick = () => { closeModal(); setMode('select'); };
}
function rescale(k) {
  L.scale *= k;
  const s = v => +(v * k).toFixed(3);
  L.walls.forEach(w => { w.x1 = s(w.x1); w.y1 = s(w.y1); w.x2 = s(w.x2); w.y2 = s(w.y2); });
  L.openings.forEach(o => { o.x1 = s(o.x1); o.y1 = s(o.y1); o.x2 = s(o.x2); o.y2 = s(o.y2); });
  L.rooms.forEach(r => r.poly = r.poly.map(([x, y]) => [s(x), s(y)]));
  L.items.forEach(it => { it.x = s(it.x); it.y = s(it.y); it.w = s(it.w); it.d = s(it.d); });
  fit2d(); afterChange();
}

let wallT = 0.12;
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.key === 'Escape') { if (draft && draft.kind === 'room' && draft.pts.length > 2) finishRoom(); draft = null; draw2d(); return; }
  if (e.key === 'Enter' && draft && draft.kind === 'room') { finishRoom(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { delSel(); return; }
  if (e.key.toLowerCase() === 'r' && step === 1) { if (mode === 'item') { ghostRot = norm360(ghostRot + 90); draw2d(); } else if (kindOf(sel) === 'item') { snap(); sel.rot = norm360(sel.rot + 90); afterChange(); } else setMode('room'); return; }
  const k = { v: 'select', w: 'wall', d: 'door', f: 'item' }[e.key.toLowerCase()]; if (k && step === 1) setMode(k);
});
function delSel() {
  const k = kindOf(sel); if (!k) return; snap();
  const arr = { wall: L.walls, open: L.openings, item: L.items, room: L.rooms }[k]; arr.splice(arr.indexOf(sel), 1); sel = null; afterChange();
}

const HINTS = {
  select: 'Bấm để chọn, kéo để di chuyển (cửa trượt dọc tường, kéo đầu tường để sửa). Kéo vùng trống hoặc chuột phải để cuộn, lăn chuột để zoom. Delete để xoá.',
  wall: 'Bấm điểm đầu rồi bấm liên tiếp để vẽ chuỗi tường (tự bắt thẳng ngang/dọc và bắt vào đầu tường có sẵn). Esc hoặc bấm đúp để kết thúc.',
  room: 'Bấm lần lượt các góc phòng (tự bắt vào tường). Bấm lại điểm đầu, Enter hoặc bấm đúp để đóng phòng.',
  door: 'Bấm lên tường, phía cánh cửa mở vào. Chỉnh bản lề / chiều mở / bề rộng ở bảng bên phải.',
  main: 'Bấm lên tường tại vị trí cửa chính, phía cánh mở vào.',
  window: 'Bấm lên tường để đặt cửa sổ.', slide: 'Bấm lên tường để đặt cửa lùa kính.', glass: 'Bấm lên tường mặt ngoài để đặt lan can / vách kính.',
  item: 'Chọn loại ở bảng bên phải rồi bấm để đặt. R để xoay 90°. Cạnh cam = mặt trước của món đồ.',
  erase: 'Bấm vào tường, cửa, phòng hoặc món nội thất để xoá ngay. Hoàn tác bằng Ctrl+Z.',
  scale: 'Bấm 2 điểm của một kích thước đã biết (VD: chiều ngang tổng căn), rồi nhập độ dài thật.'
};
function setHint(t) { $('#hint').textContent = t || ''; }
function setMode(m) {
  mode = m; draft = null; $$('#bar2d [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#item-card').style.display = m === 'item' ? '' : 'none'; setHint(HINTS[m]); draw2d();
}
$$('#bar2d [data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#btn-undo').onclick = undo; $('#btn-fit').onclick = fit2d;

// item palette
$('#palette').innerHTML = Object.entries(CATALOG).map(([k, c]) => `<button class="pal-item${k === itemType ? ' on' : ''}" data-it="${k}">${c.vi}</button>`).join('');
$$('[data-it]').forEach(b => b.onclick = () => { itemType = b.dataset.it; $$('[data-it]').forEach(x => x.classList.toggle('on', x === b)); });

// ── properties panel ──
function showProps() {
  const P = $('#props'), k = kindOf(sel);
  if (!k) { P.innerHTML = 'Bấm vào một tường, cửa, phòng hoặc món nội thất để chỉnh.<br><span class="small">Mặc định tường mới dày <select id="wall-t" style="width:auto;min-height:32px;font-size:13px;padding:2px 6px"><option value="0.12">0,12 m (trong)</option><option value="0.2">0,20 m (ngoài)</option></select></span>'; $('#wall-t').value = String(wallT); $('#wall-t').onchange = e => wallT = +e.target.value; return; }
  const num = (key, label, step = 0.01) => `<label class="f">${label}<input type="number" step="${step}" data-k="${key}" value="${typeof sel[key] === 'number' ? +sel[key].toFixed(3) : ''}"></label>`;
  let h = '';
  if (k === 'wall') h = `<p class="muted" style="margin-bottom:8px">Tường dài ${dist(sel.x1, sel.y1, sel.x2, sel.y2).toFixed(2)} m</p><div class="grid2">${num('t', 'Độ dày (m)')}</div>`;
  if (k === 'open') {
    opDefaults(sel);
    const w = dist(sel.x1, sel.y1, sel.x2, sel.y2), gl = isGlazing(sel);
    const mech = gl ? sel.mech : (sel.leaves === 2 ? 'swing2' : 'swing');
    const hk = gl ? heightKey(sel) : '';
    h = `<div class="grid2"><label class="f">Loại<select data-k="type">${Object.entries(OPEN_TYPES).map(([t, o]) => `<option value="${t}"${t === sel.type ? ' selected' : ''}>${o.vi}</option>`).join('')}</select></label>
      <label class="f">Bề rộng (m)<input type="number" step="0.05" id="op-w" value="${w.toFixed(2)}"></label></div>
      <label class="f" style="margin-top:8px">Kiểu mở<select id="op-mech">${(gl ? ['fixed', 'slide', 'swing', 'swing2'] : ['swing', 'swing2']).map(m => `<option value="${m}"${m === mech ? ' selected' : ''}>${MECH[m].vi}</option>`).join('')}</select></label>
      ${mech === 'swing' || mech === 'swing2' ? `<div class="row" style="margin-top:8px"><button class="btn" id="op-rot" title="Xoay vòng 4 hướng mở">↻ Xoay hướng mở</button>${mech === 'swing' ? '<button class="btn" id="op-hinge">Đổi bên bản lề</button>' : ''}<button class="btn" id="op-swing">Mở vào / mở ra</button></div>` : ''}
      ${mech === 'slide' ? '<div class="row" style="margin-top:8px"><button class="btn" id="op-slide">⇄ Đổi hướng lùa</button></div>' : ''}
      ${gl ? `<label class="f" style="margin-top:8px">Chiều cao kính<select id="op-hp">${Object.entries(GLASS_HEIGHTS).map(([k2, v]) => `<option value="${k2}"${k2 === hk ? ' selected' : ''}>${v[0]}</option>`).join('')}<option value="custom"${hk === 'custom' ? ' selected' : ''}>Tuỳ chỉnh…</option></select></label>
      <div class="grid2" style="margin-top:8px"><label class="f">Bệ kính, từ sàn (m)<input type="number" step="0.05" min="0" max="${CEIL_H}" id="op-sill" value="${sel.sill.toFixed(2)}"></label><label class="f">Đỉnh kính (m, trần = ${CEIL_H})<input type="number" step="0.05" min="0.3" max="${CEIL_H}" id="op-head" value="${sel.head.toFixed(2)}"></label></div>` : ''}`;
  }
  if (k === 'room') h = `<div class="grid2"><label class="f">Tên phòng<input type="text" data-k="name" value="${sel.name.replace(/"/g, '&quot;')}"></label>
      <label class="f">Loại<select data-k="type">${Object.entries(ROOM_TYPES).map(([t, v]) => `<option value="${t}"${t === sel.type ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <p class="small" style="margin-top:6px">${polyArea(sel.poly).toFixed(1)} m² · ${sel.poly.length} góc</p>`;
  if (k === 'item') h = `<div class="grid2"><label class="f">Loại<select data-k="type">${Object.entries(CATALOG).map(([t, c]) => `<option value="${t}"${t === sel.type ? ' selected' : ''}>${c.vi}</option>`).join('')}</select></label>
      ${num('w', 'Rộng (m)')}${num('d', 'Sâu (m)')}<label class="f">Mặt trước<select data-k="rot">${[0, 90, 180, 270].map(a => `<option value="${a}"${dirKey(sel.rot) === a ? ' selected' : ''}>${DIR_VI[a]}</option>`).join('')}</select></label></div>
      ${sel.type === 'sofa_l' ? `<label class="row" style="margin-top:8px;gap:8px"><input type="checkbox" id="it-mir"${sel.mirror ? ' checked' : ''}> Đảo phía chân sofa</label>` : ''}`;
  P.innerHTML = h + `<div class="row" style="margin-top:10px"><button class="btn" id="p-del">Xoá</button>${k === 'item' ? '<button class="btn" id="p-dup">Nhân bản</button>' : ''}</div>`;
  $$('#props [data-k]').forEach(inp => inp.onchange = () => { snap(); const key = inp.dataset.k; let v = inp.value; if (inp.type === 'number' || key === 'rot') v = +v; sel[key] = v; if (key === 'type' && k === 'item') { const c = CATALOG[v]; sel.w = c.w; sel.d = c.d; } if (key === 'type' && k === 'open') { ['mech', 'sill', 'head', 'leaves'].forEach(q => delete sel[q]); opDefaults(sel); } afterChange(); });
  const ow = $('#op-w'); if (ow) ow.onchange = () => { snap(); const w = +ow.value, Lm = dist(sel.x1, sel.y1, sel.x2, sel.y2), mx = (sel.x1 + sel.x2) / 2, my = (sel.y1 + sel.y2) / 2, ux = (sel.x2 - sel.x1) / Lm, uy = (sel.y2 - sel.y1) / Lm; sel.x1 = +(mx - ux * w / 2).toFixed(3); sel.y1 = +(my - uy * w / 2).toFixed(3); sel.x2 = +(mx + ux * w / 2).toFixed(3); sel.y2 = +(my + uy * w / 2).toFixed(3); afterChange(); };
  if ($('#op-hinge')) $('#op-hinge').onclick = () => { snap(); sel.hinge = sel.hinge === 2 ? 1 : 2; afterChange(); };
  if ($('#op-swing')) $('#op-swing').onclick = () => { snap(); sel.swing = -sel.swing; afterChange(); };
  if ($('#op-rot')) $('#op-rot').onclick = () => {   // cycle the 4 combinations of hinge side × opening side
    snap(); const st = [[1, 1], [2, 1], [2, -1], [1, -1]]; const i = st.findIndex(([a, b]) => a === sel.hinge && b === sel.swing);
    [sel.hinge, sel.swing] = st[(i + 1) % 4]; afterChange(); };
  if ($('#op-slide')) $('#op-slide').onclick = () => { snap(); sel.slideDir = -(sel.slideDir || 1); afterChange(); };
  if ($('#op-mech')) $('#op-mech').onchange = e => { snap(); const m = e.target.value; if (isGlazing(sel)) sel.mech = m; else sel.leaves = m === 'swing2' ? 2 : 1; afterChange(); };
  if ($('#op-hp')) $('#op-hp').onchange = e => { const v = GLASS_HEIGHTS[e.target.value]; if (!v) return; snap(); sel.sill = v[1]; sel.head = v[2]; afterChange(); };
  if ($('#op-sill')) $('#op-sill').onchange = e => { snap(); sel.sill = Math.max(0, Math.min(+e.target.value, sel.head - 0.2)); afterChange(); };
  if ($('#op-head')) $('#op-head').onchange = e => { snap(); sel.head = Math.min(CEIL_H, Math.max(+e.target.value, sel.sill + 0.2)); afterChange(); };
  if ($('#it-mir')) $('#it-mir').onchange = e => { snap(); sel.mirror = e.target.checked; afterChange(); };
  $('#p-del').onclick = delSel;
  if ($('#p-dup')) $('#p-dup').onclick = () => { snap(); const c = { ...sel, id: uid('i'), x: sel.x + 0.3, y: sel.y + 0.3 }; L.items.push(c); sel = c; afterChange(); };
}

// ── image upload ──
function setImage(src, w, h, keepScale) {
  imgURL = src; imgEl.onload = () => { draw2d(); }; imgEl.src = src;
  $('#img-info').textContent = `${w}×${h} px`;
  updateScaleInfo();
}
function updateScaleInfo() { $('#scale-info').textContent = L.img ? `Tỷ lệ hiện tại: 1 px ảnh = ${(L.scale * 100).toFixed(2)} cm. Ảnh rộng ≈ ${(L.img.w * L.scale).toFixed(1)} m. Dùng "Đo tỷ lệ" để chỉnh theo một kích thước đã biết.` : ''; }
$('#in-img').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
  const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = url; });
  // downscale very large images to keep the page light (max 2400 px)
  const k = Math.min(1, 2400 / Math.max(im.width, im.height));
  const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.86);
  snap(); L = emptyLayout(); L.img = { src: data, w: c.width, h: c.height };
  L.scale = 15 / c.width; // first guess: 15 m wide; correct with "Đo tỷ lệ" or the AI width field
  sel = null; setImage(data, c.width, c.height); fit2d(); afterChange();
  setHint('Ảnh đã tải. Bước tiếp: bấm "Đo tỷ lệ" để khai kích thước thật, rồi cho AI đọc layout hoặc tự vẽ tường.');
  e.target.value = '';
};
$('#img-op').oninput = e => { imgOpacity = +e.target.value; draw2d(); };
$('#btn-clear').onclick = () => { snap(); L.walls = []; L.openings = []; L.rooms = []; L.items = []; sel = null; afterChange(); };

// ── sample / json ──
function loadLayout(newL) {
  L = newL; sel = null; undoStack.length = 0;
  if (L.img) setImage(L.img.src, L.img.w, L.img.h); else { imgEl.src = ''; $('#img-info').textContent = 'chưa có ảnh'; }
  $('#apt-type').value = L.meta.aptType || '3-bedroom'; $('#area').value = L.meta.area || ''; $('#orientation').value = L.meta.orientation || '';
  fit2d(); afterChange();
}
$('#btn-sample').onclick = () => loadLayout(sampleLayout());
$('#btn-save-json').onclick = () => saveFile('layout-boc-mai.json', new Blob([JSON.stringify(L)], { type: 'application/json' }));
$('#in-json').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (!d.walls) throw 0; loadLayout(d); } catch (err) { modalMsg('File không đúng định dạng layout.'); } e.target.value = ''; };
['apt-type', 'area', 'orientation'].forEach(id => $('#' + id).onchange = e => { L.meta[{ 'apt-type': 'aptType', area: 'area', orientation: 'orientation' }[id]] = e.target.value; saveLocal(); });

// ── automatic recognition (rule-based, runs in the browser, no AI / no API) ──
function nameRooms(rooms, openings) {
  const cnt = {};
  const next = (t, base) => { cnt[t] = (cnt[t] || 0) + 1; return base + ' ' + cnt[t]; };
  const sorted = rooms.slice().sort((a, b) => polyArea(b.poly) - polyArea(a.poly));
  sorted.forEach((r, i) => {
    const A = polyArea(r.poly), xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), asp = Math.max(w, h) / Math.max(0.1, Math.min(w, h));
    const near = o => r.poly.some((p, k) => { const q = r.poly[(k + 1) % r.poly.length]; return projOnSeg((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2, p[0], p[1], q[0], q[1]).d < 0.35; });
    const facadeGlass = openings.some(o => (o.type === 'glass' || o.type === 'window') && o.ext && near(o));
    const doors = openings.filter(o => (o.type === 'door' || o.type === 'main') && near(o)).length;
    if (i === 0) { r.type = 'living'; r.name = 'Khách – ăn – bếp'; }
    else if (facadeGlass && A < 12 && asp > 2.2 && !doors) { r.type = A < 6 ? 'balcony' : 'logia'; r.name = r.type === 'balcony' ? next('bc', 'Ban công') : next('lg', 'Lô gia'); }
    else if (A < 7.5 && doors) { r.type = 'bath'; r.name = next('wc', 'WC'); }
    else if (A >= 7.5 && asp < 2.6) { r.type = 'bedroom'; r.name = next('pn', 'Phòng ngủ'); }
    else if (asp >= 2.6 && !facadeGlass) { r.type = 'hall'; r.name = next('hl', 'Hành lang'); }
    else { r.type = 'utility'; r.name = next('ph', 'Phòng'); }
  });
}
$('#btn-ai').onclick = async () => {
  const msg = $('#ai-msg'); msg.className = 'msg';
  if (!L.img || !imgEl.naturalWidth) { msg.className = 'msg err'; msg.textContent = 'Tải ảnh layout (JPG/PNG) lên trước.'; return; }
  const btn = $('#btn-ai'); btn.disabled = true; msg.textContent = 'Đang nhận diện…';
  await new Promise(r => setTimeout(r, 30));
  try {
    const k = Math.min(1, 1400 / Math.max(L.img.w, L.img.h));
    const c = document.createElement('canvas'); c.width = Math.round(L.img.w * k); c.height = Math.round(L.img.h * k);
    const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    // downscale in halving steps (smoother than one big jump, keeps thin door arcs visible)
    let src = imgEl, sw = L.img.w, sh = L.img.h;
    while (sw / 2 > c.width) { const tc = document.createElement('canvas'); tc.width = Math.round(sw / 2); tc.height = Math.round(sh / 2); const tx = tc.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(src, 0, 0, tc.width, tc.height); src = tc; sw = tc.width; sh = tc.height; }
    x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
    const R = detectLayout(x.getImageData(0, 0, c.width, c.height));
    if (!R.walls.length) throw new Error('không thấy tường đặc màu tối trong ảnh');
    // scale (metres per detection pixel): known overall width > median door width > wall thickness
    let mpp;
    const W0 = +$('#ai-width').value, xs = R.walls.flatMap(w => [w.x1, w.x2]);
    const doors = R.openings.filter(o => o.type === 'door').map(o => Math.hypot(o.x2 - o.x1, o.y2 - o.y1)).sort((a, b) => a - b);
    let how;
    if (W0 > 0) { mpp = W0 / (Math.max(...xs) - Math.min(...xs) + R.tExt); how = 'theo chiều ngang chị nhập'; }
    else if (doors.length >= 2) { mpp = 0.82 / doors[Math.floor(doors.length / 2)]; how = `ước theo bề rộng cửa đi (~0,82 m)`; }
    else { mpp = 0.2 / R.tExt; how = 'ước theo độ dày tường ngoài (~0,2 m)'; }
    const m = v => +(v * mpp).toFixed(3);
    snap();
    L.scale = mpp * k;                                    // metres per ORIGINAL image px
    L.walls = R.walls.map(w => ({ id: uid('w'), x1: m(w.x1), y1: m(w.y1), x2: m(w.x2), y2: m(w.y2), t: w.t >= R.t * 1.25 ? 0.2 : 0.12 }));
    L.openings = R.openings.map(o => opDefaults({ id: uid('o'), type: o.type, x1: m(o.x1), y1: m(o.y1), x2: m(o.x2), y2: m(o.y2), hinge: o.hinge, swing: o.swing, ext: o.ext }));
    L.openings.filter(o => o.type === 'glass' && o.ext).forEach(o => { o.sill = 0; o.head = CEIL_H; });
    L.rooms = R.rooms.map(r => ({ id: uid('r'), name: 'Phòng', type: 'living', poly: r.poly.map(([px, py]) => [m(px), m(py)]) }));
    nameRooms(L.rooms, L.openings);
    // balconies/loggias facing out get a glass balustrade by default
    L.openings.forEach(o => { if (o.type !== 'glass' || !o.ext) return; const rm = L.rooms.find(r => r.poly.some((p, i) => { const q = r.poly[(i + 1) % r.poly.length]; return projOnSeg((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2, p[0], p[1], q[0], q[1]).d < 0.35; })); if (rm && (rm.type === 'balcony' || rm.type === 'logia')) { o.sill = 0; o.head = 1.1; } });
    L.openings.forEach(o => delete o.ext);
    L.items = [];
    sel = null; updateScaleInfo(); fit2d(); afterChange();
    const n = t => L.openings.filter(o => o.type === t).length;
    msg.className = 'msg ok';
    msg.innerHTML = `Nhận diện xong: <b>${L.walls.length}</b> đoạn tường, <b>${L.rooms.length}</b> phòng, <b>${n('door')}</b> cửa đi, <b>${n('main')}</b> cửa chính, <b>${n('slide')}</b> cửa kính, <b>${n('window') + n('glass')}</b> cửa sổ/vách kính. Tỷ lệ ${how}: căn rộng ≈ ${((Math.max(...xs) - Math.min(...xs)) * mpp).toFixed(1)} m.<br>Việc tiếp theo: kiểm tra tên phòng, hướng mở cửa, chiều cao kính; đặt nội thất bằng nút "Nội thất".`;
  } catch (e) {
    msg.className = 'msg err'; msg.textContent = 'Chưa nhận diện được (' + (e.message || e) + '). Bản vẽ cần có tường tô đặc màu tối; nếu không, chị vẽ tay bằng thanh công cụ.';
  } finally { btn.disabled = false; }
};

// ═════════════ 3D ═════════════
let viewer = null, dirty3d = true;
function ensure3d() {
  if (!viewer) viewer = new Viewer3D($('#c3d'));
  viewer.active = true;
  if (dirty3d) { viewer.build(L, STYLES[styleKey]); dirty3d = false; }
  else viewer.resize();
}
function setViewMode(m) { if (!viewer) return; viewer.opts.mode = m; $$('#bar3d [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === m)); viewer.build(L, STYLES[styleKey]); }
$$('#bar3d [data-view]').forEach(b => b.onclick = () => setViewMode(b.dataset.view));
$$('#bar3d [data-cam]').forEach(b => b.onclick = () => { if (!viewer) return; viewer.opts.cam = b.dataset.cam; if (viewer.opts.mode === 'plan') setViewMode('style'); else viewer.build(L, STYLES[styleKey]); $$('#bar3d [data-cam]').forEach(x => x.classList.toggle('on', x === b)); });
$('#cut').oninput = e => { $('#cut-v').textContent = (+e.target.value).toFixed(1) + ' m'; if (viewer) { viewer.opts.cut = +e.target.value; viewer.build(L, STYLES[styleKey]); } };
$('#az').oninput = e => { $('#az-v').textContent = e.target.value + '°'; if (viewer) { viewer.opts.az = +e.target.value; if (viewer.opts.lowFront) viewer.build(L, STYLES[styleKey]); else { viewer.fitCamera(true); viewer.render(); } } };
$('#lowfront').onchange = e => { if (viewer) { viewer.opts.lowFront = e.target.checked; viewer.build(L, STYLES[styleKey]); } };
$('#light').onchange = e => { if (viewer) { viewer.opts.light = e.target.value; viewer.setupLights(); viewer.render(); } };
$('#bg').onchange = e => { if (viewer) { viewer.opts.bg = e.target.value; viewer.setupLights(); viewer.render(); } };
$('#persp').onchange = e => { if (viewer) { viewer.opts.persp = e.target.checked; viewer.fitCamera(true); viewer.render(); } };
$('#overlay-orig').onchange = e => { if (viewer) { viewer.opts.overlay = e.target.checked && L.img ? L.img.src : null; viewer.build(L, STYLES[styleKey]); } };

// ── path-traced render ──
let ptURL = null;
$('#btn-pt').onclick = async () => {
  ensure3d(); const msg = $('#pt-msg'); msg.className = 'msg';
  if (viewer.opts.mode !== 'style') setViewMode('style');
  msg.textContent = 'Đang chuẩn bị cảnh (dựng BVH)…'; $('#btn-pt').disabled = true; $('#btn-pt-save').disabled = true;
  const max = +$('#pt-q').value, t0 = performance.now();
  try {
    await viewer.startPT({
      samples: max,
      onProgress: n => { if (n % 5 === 0 || n < 5) msg.textContent = `Đang render: ${n}/${max} mẫu · ${((performance.now() - t0) / 1000).toFixed(0)} giây`; },
      onDone: () => { ptURL = viewer.ptImage(); msg.className = 'msg ok'; msg.textContent = `Xong ${max} mẫu trong ${((performance.now() - t0) / 1000).toFixed(0)} giây. Bấm "Tải ảnh render" để lưu; ảnh này cũng có ở bước 4.`; $('#btn-pt').disabled = false; $('#btn-pt-save').disabled = false; }
    });
  } catch (e) { msg.className = 'msg err'; msg.textContent = 'Không tải được bộ render chân thực (' + (e.message || e) + '). Chế độ xem thường vẫn dùng được.'; $('#btn-pt').disabled = false; }
};
$('#btn-pt-stop').onclick = () => { if (!viewer || !viewer.ptOn) return; ptURL = viewer.ptImage(); viewer.ptOn = false; $('#pt-msg').className = 'msg'; $('#pt-msg').textContent = `Đã dừng ở ${viewer.pt.samples} mẫu. Có thể tải ảnh hiện tại.`; $('#btn-pt').disabled = false; $('#btn-pt-save').disabled = false; };
$('#btn-pt-save').onclick = async () => { if (ptURL) saveFile('boc-mai-render.png', await dataURLtoBlob(ptURL)); };

// ── styles list ──
$('#style-count').textContent = Object.keys(STYLES).length + ' phong cách';
$('#styles-nav').innerHTML = GROUPS.map(g => `<div class="sg">${g.group}</div>` + g.styles.map(s => `<button class="sbtn" data-style="${s.key}">${s.label}</button>`).join('')).join('');
function selectStyle(k) {
  styleKey = k; $$('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === k));
  const S = STYLES[k];
  $('#style-prev').innerHTML = `<div style="font-family:'DM Serif Display',serif;font-size:17px">${S.name} — <em style="color:var(--gold)">${S.variant}</em></div>
    <div class="swatches">${S.colours.map(c => `<div class="sw"><i style="background:${c.hex}"></i><div>${c.role.split(' ')[0]} · ${c.hex}</div></div>`).join('')}</div>
    <p class="small">${S.primaryMat.slice(0, 2).join(' · ')}</p>`;
  saveLocal();
  if (viewer && step >= 3) { if (viewer.opts.mode !== 'style') setViewMode('style'); else viewer.build(L, S); }
}
$$('[data-style]').forEach(b => b.onclick = () => selectStyle(b.dataset.style));

// ═════════════ STEPS ═════════════
function goStep(n) {
  step = n; $$('.step').forEach(b => b.classList.toggle('on', +b.dataset.step === n)); $$('.pane').forEach(p => p.classList.toggle('on', +p.dataset.pane === n));
  const is2d = n === 1;
  cv.style.display = is2d ? '' : 'none'; $('#c3d').style.display = is2d ? 'none' : '';
  $('#bar2d').style.display = is2d ? '' : 'none'; $('#bar3d').style.display = is2d ? 'none' : '';
  if (is2d) { if (viewer) viewer.active = false; setHint(HINTS[mode]); resize2d(); return; }
  setHint(n === 2 ? 'Mặt bằng nét: chính mô hình 3D cắt ngang ở 1,2 m, nhìn thẳng từ trên. So với bản vẽ gốc trước khi phủ style.' : 'Kéo chuột để xoay, lăn để zoom, chuột phải để dời. Góc nhìn dùng để xuất ảnh là góc đang hiển thị.');
  ensure3d();
  if (n === 2) { setViewMode('plan'); renderSummary(); }
  else if (viewer.opts.mode === 'plan') setViewMode('style');
}
$$('.step').forEach(b => b.onclick = () => goStep(+b.dataset.step));
$$('[data-go]').forEach(b => b.onclick = () => goStep(+b.dataset.go));

function renderSummary() {
  const inv = inventory(L);
  $('#sum-total').textContent = `${inv.rooms.length} phòng · ${inv.main + inv.doors} cửa đi · ${inv.windows} cửa sổ · ${inv.slides + inv.glass} mảng kính`;
  $('#summary').innerHTML = `<div class="scroll"><table><thead><tr><th>Phòng</th><th class="n">m²</th><th class="n">Cửa</th><th class="n">Sổ/kính</th></tr></thead><tbody>${inv.rooms.map(({ r, area, ops }) => `<tr><td>${r.name}<div class="small">${ROOM_TYPES[r.type]}</div></td><td class="n">${area.toFixed(1)}</td><td class="n">${ops.filter(o => o.type === 'door' || o.type === 'main').length}</td><td class="n">${ops.filter(o => ['window', 'slide', 'glass'].includes(o.type)).length}</td></tr>`).join('')}</tbody></table></div>
  <p class="small" style="margin-top:8px">Tổng sàn các phòng (thông thuỷ): ${inv.rooms.reduce((a, x) => a + x.area, 0).toFixed(1)} m². Thiết bị: ${L.items.filter(i => ['washer', 'toilet', 'basin', 'shower', 'bathtub', 'sink', 'hob', 'fridge'].includes(i.type)).map(i => `${CATALOG[i.type].vi} (${DIR_VI[dirKey(i.rot)]})`).join(', ') || 'chưa có'}.</p>`;
  const W = warnings(L);
  $('#warnings').innerHTML = W.length ? W.map(w => `<div class="warn">• ${w}</div>`).join('') : '<span class="ok">Không phát hiện lỗi cấu trúc. Vẫn cần chị so bằng mắt với bản vẽ gốc.</span>';
}

// ═════════════ OUTPUT ═════════════
let downloads = null;
(async () => { try { if (window.claude && window.claude.use) downloads = await window.claude.use('downloads'); } catch (e) {} })();
async function saveFile(name, blob) {
  if (downloads) { try { await downloads.save({ filename: name, data: blob }); return; } catch (e) { if (e && (e.code === 'declined' || e.code === 'cancelled')) return; } }
  let framed = true; try { framed = window.top !== window.self; } catch (e) {}
  if (!framed) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); return; }
  // sandboxed frame without the downloads capability: hand the content over manually
  if (blob.type.startsWith('image/')) { const u = URL.createObjectURL(blob); modal(`<h3>${name}</h3><p class="small">Chuột phải vào ảnh → Lưu ảnh thành…</p><img src="${u}"><button class="btn" id="mm-x">Đóng</button>`); }
  else { const t = await blob.text(); modal(`<h3>${name}</h3><p class="small">Copy nội dung dưới đây, dán vào một file .json để lưu.</p><textarea style="min-height:240px;margin:10px 0" readonly>${t.replace(/</g, '&lt;')}</textarea><button class="btn" id="mm-x">Đóng</button>`); }
  $('#mm-x').onclick = closeModal;
}
const dataURLtoBlob = u => fetch(u).then(r => r.blob());
let shots = {};
async function makeShots() {
  ensure3d(); const msg = $('#shot-msg'); msg.className = 'msg'; msg.textContent = 'Đang render…';
  await new Promise(r => setTimeout(r, 30));
  const cur = viewer.opts.mode === 'plan' ? 'style' : viewer.opts.mode;
  if (viewer.opts.mode === 'plan') setViewMode('style');
  shots = { clay: viewer.snapshot('clay'), style: viewer.snapshot('style'), plan: viewer.snapshot('plan') };
  if (cur !== viewer.opts.mode) setViewMode(cur);
  if (ptURL) shots.render = ptURL;
  shotsKey = shotKey();
  const names = { clay: 'Ảnh 1 · khối trắng', style: 'Ảnh 2 · phủ style', plan: 'Mặt bằng nét (đối chiếu)', render: 'Render chân thực' };
  $('#shots').innerHTML = Object.entries(shots).map(([k, u]) => `<figure><img src="${u}" alt="${names[k]}" data-shot="${k}"><figcaption>${names[k]}<br><button class="btn" style="min-height:32px;padding:4px 8px;margin-top:4px" data-dl="${k}">Tải PNG</button></figcaption></figure>`).join('');
  $$('[data-dl]').forEach(b => b.onclick = async () => saveFile(`boc-mai-${b.dataset.dl}.png`, await dataURLtoBlob(shots[b.dataset.dl])));
  $$('[data-shot]').forEach(im => im.onclick = () => modal(`<h3>${names[im.dataset.shot]}</h3><p class="small">Nếu nút tải không chạy: chuột phải vào ảnh → Lưu ảnh.</p><img src="${im.src}"><button class="btn" onclick="this.closest('.modal').classList.remove('on')">Đóng</button>`));
  msg.className = 'msg ok'; msg.textContent = 'Xong. Bấm vào ảnh để xem lớn, hoặc "Tải PNG".';
}
$('#btn-shots').onclick = makeShots;
let shotsKey = '';
const shotKey = () => JSON.stringify([L.walls.length, L.items.length, L.openings.length, styleKey, viewer && viewer.camera.position.toArray().map(v => v.toFixed(2)), viewer && viewer.opts.cut, viewer && viewer.opts.light, !!ptURL]);
const promptOpts = () => ({ aptType: $('#apt-type').value, area: $('#area').value, orientation: $('#orientation').value, light: $('#light').value, bg: $('#bg').value, cam: viewer ? viewer.opts.cam : 'iso45', persp: $('#persp').checked, quality: $('#quality').value, extra: $('#extra').value, lowFront: $('#lowfront').checked, hasRender: !!ptURL });
$('#btn-prompt').onclick = () => {
  const S = STYLES[styleKey];
  const P = buildPrompts(L, S, promptOpts());
  const blk = (id, title, txt) => `<div style="margin-top:12px"><div class="row" style="justify-content:space-between"><b style="font-size:13px">${title}</b><button class="btn" data-copy="${id}">Copy</button></div><div class="out" id="${id}" style="margin-top:6px"></div></div>`;
  $('#prompts').innerHTML = blk('p-main', '① Main prompt', P.main) + blk('p-neg', '② Negative prompt', P.neg) + blk('p-fix', '③ Fix prompt — khi kết quả sai', P.fix);
  $('#p-main').textContent = P.main; $('#p-neg').textContent = P.neg; $('#p-fix').textContent = P.fix;
  $$('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText($('#' + b.dataset.copy).textContent); b.textContent = 'Đã copy'; } catch (e) { const r = document.createRange(); r.selectNodeContents($('#' + b.dataset.copy)); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'Đã chọn — Ctrl+C'; } setTimeout(() => b.textContent = 'Copy', 2000); });
};

// ── modal ──
function modal(html) { $('#modal-box').innerHTML = html; $('#modal').classList.add('on'); }
function closeModal() { $('#modal').classList.remove('on'); }
function modalMsg(t) { modal(`<p>${t}</p><button class="btn" style="margin-top:10px" id="mm-x">Đóng</button>`); $('#mm-x').onclick = closeModal; }
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

// ── boot: open mid-use with the sample (or the viewer's last layout) ──
if (loadLocal()) loadLayout(L); else loadLayout(sampleLayout());
selectStyle(styleKey);
setMode('select');
window.__app = { get L() { return L; }, goStep, setViewMode, get viewer() { return viewer; }, select(o) { sel = o; showProps(); draw2d(); } };
}

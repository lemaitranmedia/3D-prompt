// Layout data model — everything in metres. Plan axes: x → right, y → down (same as the drawing).
// Item rotation `rot` (degrees, clockwise on the drawing): 0 = front faces down the drawing,
// 90 = faces left, 180 = faces up, 270 = faces right.

export const ROOM_TYPES = {
  living: 'Khách / ăn / bếp', bedroom: 'Phòng ngủ', bath: 'Vệ sinh', kitchen: 'Bếp riêng',
  balcony: 'Ban công', logia: 'Lô gia', hall: 'Hành lang / sảnh', utility: 'Kho / kỹ thuật'
};
export const ROOM_EN = {
  living: 'living / dining / kitchen', bedroom: 'bedroom', bath: 'bathroom', kitchen: 'kitchen',
  balcony: 'balcony', logia: 'loggia (utility balcony)', hall: 'hallway', utility: 'storage / technical'
};

export const OPEN_TYPES = {
  door:  { vi: 'Cửa đi', en: 'hinged door', w: 0.85 },
  main:  { vi: 'Cửa chính', en: 'main entrance door', w: 1.0 },
  window:{ vi: 'Cửa sổ', en: 'window', w: 1.4 },
  slide: { vi: 'Cửa lùa kính', en: 'full-height sliding glass door', w: 2.4 },
  glass: { vi: 'Lan can / vách kính', en: 'full-height glass balustrade / glazing', w: 3.0 }
};

// w = width along the back, d = depth (front–back), h = height
export const CATALOG = {
  bed:        { vi: 'Giường đôi', en: 'double bed', w: 1.9, d: 2.1, h: 0.5, note: 'headboard against the back wall' },
  bed_single: { vi: 'Giường đơn', en: 'single bed', w: 1.1, d: 2.05, h: 0.5, note: 'headboard against the back wall' },
  nightstand: { vi: 'Tab đầu giường', en: 'bedside table', w: 0.45, d: 0.4, h: 0.5 },
  wardrobe:   { vi: 'Tủ áo', en: 'built-in wardrobe', w: 1.8, d: 0.6, h: 2.4 },
  desk:       { vi: 'Bàn làm việc', en: 'desk', w: 1.0, d: 0.6, h: 0.75 },
  chair:      { vi: 'Ghế', en: 'chair', w: 0.48, d: 0.5, h: 0.85 },
  sofa:       { vi: 'Sofa', en: 'sofa', w: 2.4, d: 0.95, h: 0.8 },
  sofa_l:     { vi: 'Sofa góc L', en: 'L-shaped corner sofa', w: 2.6, d: 1.6, h: 0.8 },
  armchair:   { vi: 'Ghế bành', en: 'lounge armchair', w: 0.85, d: 0.85, h: 0.8 },
  coffee:     { vi: 'Bàn trà tròn', en: 'round coffee table', w: 0.8, d: 0.8, h: 0.4 },
  coffee_rect:{ vi: 'Bàn trà chữ nhật', en: 'coffee table', w: 1.2, d: 0.6, h: 0.4 },
  tv:         { vi: 'Kệ + TV', en: 'TV console with wall-mounted TV', w: 2.0, d: 0.4, h: 0.5 },
  dining:     { vi: 'Bàn ăn 6 ghế', en: 'dining table with 6 chairs', w: 0.9, d: 1.8, h: 0.75 },
  dining4:    { vi: 'Bàn ăn 4 ghế', en: 'dining table with 4 chairs', w: 0.85, d: 1.3, h: 0.75 },
  counter:    { vi: 'Tủ bếp dưới', en: 'kitchen base cabinet run with worktop', w: 2.4, d: 0.6, h: 0.9 },
  sink:       { vi: 'Chậu rửa bếp', en: 'kitchen sink (set into the worktop)', w: 0.8, d: 0.6, h: 0.9 },
  hob:        { vi: 'Bếp nấu', en: 'kitchen hob / cooktop (set into the worktop)', w: 0.8, d: 0.6, h: 0.9 },
  fridge:     { vi: 'Tủ lạnh', en: 'refrigerator', w: 0.9, d: 0.7, h: 1.85 },
  island:     { vi: 'Đảo bếp', en: 'kitchen island', w: 1.8, d: 0.9, h: 0.9 },
  washer:     { vi: 'Máy giặt', en: 'front-loading washing machine', w: 0.6, d: 0.6, h: 0.85, note: 'upright on the floor, round drum door on its front face' },
  toilet:     { vi: 'Bồn cầu', en: 'toilet', w: 0.4, d: 0.7, h: 0.75, note: 'cistern against the back wall, bowl opening upward' },
  basin:      { vi: 'Lavabo', en: 'wash basin vanity', w: 0.9, d: 0.5, h: 0.85 },
  shower:     { vi: 'Khu tắm đứng', en: 'walk-in shower with glass screen', w: 1.2, d: 1.0, h: 2.0 },
  bathtub:    { vi: 'Bồn tắm', en: 'bathtub', w: 1.7, d: 0.75, h: 0.55 },
  shoe:       { vi: 'Tủ giày / tủ thấp', en: 'low cabinet / shoe cabinet', w: 1.2, d: 0.4, h: 1.0 },
  cabinet:    { vi: 'Tủ âm tường cao', en: 'full-height built-in cabinet', w: 1.2, d: 0.55, h: 2.4 },
  shaft:      { vi: 'Hộp kỹ thuật', en: 'technical shaft (solid box, not a room)', w: 0.4, d: 0.4, h: 2.8 },
  rack:       { vi: 'Giàn phơi', en: 'ceiling drying rack', w: 1.2, d: 0.3, h: 0.1 },
  plant:      { vi: 'Cây xanh', en: 'potted plant', w: 0.45, d: 0.45, h: 1.2 },
  rug:        { vi: 'Thảm', en: 'area rug', w: 2.0, d: 1.4, h: 0.01 }
};

export const DIR_VI = { 0: 'quay xuống (mép dưới bản vẽ)', 90: 'quay sang trái', 180: 'quay lên (mép trên)', 270: 'quay sang phải' };
export const DIR_EN = { 0: 'toward the bottom edge of the floor plan', 90: 'toward the left edge of the floor plan', 180: 'toward the top edge of the floor plan', 270: 'toward the right edge of the floor plan' };
export const norm360 = a => ((Math.round(a) % 360) + 360) % 360;
export const dirKey = a => { const r = norm360(Math.round(norm360(a) / 90) * 90); return r; };

export function emptyLayout() {
  return { v: 1, img: null, scale: 0.01, walls: [], openings: [], rooms: [], items: [],
           meta: { aptType: '3-bedroom', area: '', orientation: '', name: '' } };
}

let _id = 1;
export const uid = p => p + (_id++) + '_' + Math.random().toString(36).slice(2, 6);

// ── geometry helpers ─────────────────────────────────────────
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export function projOnSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - x1) * dx + (py - y1) * dy) / L2; t = Math.max(0, Math.min(1, t));
  const x = x1 + t * dx, y = y1 + t * dy;
  return { t, x, y, d: dist(px, py, x, y), L: Math.sqrt(L2) };
}
export function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; }
export function polyCentroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
  if (Math.abs(a) < 1e-9) return [p[0][0], p[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}
export function pointInPoly(x, y, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
export function distToPolyEdge(x, y, p) {
  let m = Infinity;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; m = Math.min(m, projOnSeg(x, y, x1, y1, x2, y2).d); }
  return m;
}
// item corners in plan coords
export function itemCorners(it) {
  const a = it.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = it.w / 2, hd = it.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => [it.x + lx * c - ly * s, it.y + lx * s + ly * c]);
}
// host wall of an opening: the wall it lies on (colinear, within tolerance)
export function hostWall(o, walls) {
  const mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2;
  let best = null, bd = 0.25;
  for (const w of walls) {
    const p = projOnSeg(mx, my, w.x1, w.y1, w.x2, w.y2);
    const ang = Math.abs(((Math.atan2(o.y2 - o.y1, o.x2 - o.x1) - Math.atan2(w.y2 - w.y1, w.x2 - w.x1)) % Math.PI + Math.PI) % Math.PI);
    const par = Math.min(ang, Math.PI - ang) < 0.2;
    if (par && p.d < bd) { bd = p.d; best = w; }
  }
  return best;
}
// cardinal description of a wall/opening direction in plan terms
export function planSide(x, y, bbox) {
  const cx = (bbox.x0 + bbox.x1) / 2, cy = (bbox.y0 + bbox.y1) / 2;
  const v = y < bbox.y0 + (bbox.y1 - bbox.y0) * 0.25 ? 'top' : y > bbox.y1 - (bbox.y1 - bbox.y0) * 0.25 ? 'bottom' : 'middle';
  const h = x < bbox.x0 + (bbox.x1 - bbox.x0) * 0.25 ? 'left' : x > bbox.x1 - (bbox.x1 - bbox.x0) * 0.25 ? 'right' : 'centre';
  return v === 'middle' && h === 'centre' ? 'centre' : (v === 'middle' ? h : h === 'centre' ? v : v + '-' + h);
}
export function layoutBBox(L) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  L.walls.forEach(w => { add(w.x1, w.y1); add(w.x2, w.y2); });
  L.rooms.forEach(r => r.poly.forEach(([x, y]) => add(x, y)));
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 10, y1: 8 };
  return { x0, y0, x1, y1 };
}

// ── sample: the 3PN plan the user supplied (traced on sample/3pn.jpg, 1782×1369 px) ──
export function sampleLayout() {
  const S = 0.0093; // m per image px  (≈ 15.4 m outer width; editable with "Đo tỷ lệ")
  const m = v => +(v * S).toFixed(3);
  const L = emptyLayout();
  L.img = { src: 'sample/3pn.jpg', w: 1782, h: 1369 };
  L.scale = S;
  L.meta = { aptType: '3-bedroom', area: '', orientation: '', name: 'Mẫu 3PN' };
  const W = (x1, y1, x2, y2, t = 0.12) => L.walls.push({ id: uid('w'), x1: m(x1), y1: m(y1), x2: m(x2), y2: m(y2), t });
  const E = (x1, y1, x2, y2) => W(x1, y1, x2, y2, 0.2);
  // exterior
  E(87, 113, 1735, 113); E(87, 113, 87, 1198); E(87, 1198, 296, 1198); E(296, 1198, 296, 860);
  E(296, 860, 1180, 860); E(1180, 860, 1180, 1210); E(1180, 1210, 1735, 1210); E(1735, 1210, 1735, 113);
  // interior
  W(97, 270, 405, 270);            // balcony | master (sliding)
  W(414, 113, 414, 860);           // master | bedroom 2 & corridor (door gap later)
  W(87, 832, 296, 832);            // master | WC1
  W(87, 1135, 296, 1135, 0.08);    // WC1 | shafts
  W(748, 113, 748, 675);           // bedroom 2 | bedroom 3
  W(414, 675, 1084, 675);          // bedrooms | corridor
  W(1084, 113, 1084, 675);         // bedroom 3 | loggia & living
  W(1084, 270, 1735, 270);         // loggia | living (sliding)
  W(1380, 860, 1380, 1210);        // WC2 | kitchen/entry
  W(1210, 1175, 1380, 1175, 0.08); // WC2 | shafts
  W(1210, 860, 1210, 1210, 0.08);  // WC2 left shaft line
  const O = (type, x1, y1, x2, y2, hinge = 1, swing = 1) => L.openings.push({ id: uid('o'), type, x1: m(x1), y1: m(y1), x2: m(x2), y2: m(y2), hinge, swing });
  // facade glazing (top edge)
  O('glass', 100, 113, 398, 113); O('window', 450, 113, 705, 113); O('window', 785, 113, 1000, 113); O('glass', 1095, 113, 1715, 113);
  O('slide', 105, 270, 355, 270); O('slide', 1335, 270, 1675, 270);
  // doors: hinge 1/2 = which end; swing ±1 = side relative to the wall's left normal (−dy, dx)
  O('door', 414, 695, 414, 780, 2, 1);      // master: opens into the bedroom (left)
  O('door', 195, 832, 272, 832, 2, 1);      // WC1: opens down into the bath
  O('door', 640, 675, 730, 675, 2, -1);     // bedroom 2: opens up
  O('door', 768, 675, 862, 675, 1, -1);     // bedroom 3: opens up
  O('door', 1380, 880, 1380, 955, 1, 1);    // WC2: opens left into the bath
  O('main', 1405, 1210, 1510, 1210, 1, -1); // entrance: opens up into the flat
  const R = (name, type, pts) => L.rooms.push({ id: uid('r'), name, type, poly: pts.map(([x, y]) => [m(x), m(y)]) });
  R('Ban công', 'balcony', [[97, 122], [405, 122], [405, 270], [97, 270]]);
  R('Phòng ngủ master', 'bedroom', [[97, 270], [414, 270], [414, 832], [97, 832]]);
  R('Phòng ngủ 2', 'bedroom', [[414, 122], [748, 122], [748, 675], [414, 675]]);
  R('Phòng ngủ 3', 'bedroom', [[748, 122], [1084, 122], [1084, 675], [748, 675]]);
  R('Lô gia', 'logia', [[1084, 122], [1725, 122], [1725, 270], [1084, 270]]);
  R('WC master', 'bath', [[97, 832], [296, 832], [296, 1135], [97, 1135]]);
  R('WC chung', 'bath', [[1210, 860], [1380, 860], [1380, 1175], [1210, 1175]]);
  R('Khách – ăn – bếp – hành lang', 'living', [[1084, 270], [1725, 270], [1725, 1200], [1380, 1200], [1380, 860], [414, 860], [414, 675], [1084, 675]]);
  const I = (type, cx, cy, w, d, rot, extra = {}) => L.items.push({ id: uid('i'), type, x: m(cx), y: m(cy), w: m(w), d: m(d), rot, ...extra });
  // master
  I('bed', 206, 457, 205, 212, 270); I('nightstand', 118, 330, 40, 40, 270); I('nightstand', 118, 582, 40, 40, 270);
  I('wardrobe', 194, 663, 195, 62, 0); I('wardrobe', 128, 762, 128, 62, 270);
  // bedroom 2
  I('bed', 537, 286, 172, 215, 270); I('nightstand', 450, 177, 40, 40, 270); I('nightstand', 450, 395, 40, 40, 270);
  I('desk', 460, 548, 105, 64, 270); I('chair', 512, 548, 46, 46, 90); I('wardrobe', 528, 636, 197, 62, 180);
  // bedroom 3
  I('bed', 952, 286, 172, 215, 90); I('nightstand', 1040, 177, 40, 40, 90); I('nightstand', 1040, 395, 40, 40, 90);
  I('desk', 1046, 548, 105, 64, 90); I('chair', 994, 548, 46, 46, 270); I('wardrobe', 979, 636, 197, 62, 180);
  // loggia
  I('washer', 1167, 225, 64, 64, 0); I('shaft', 1105, 222, 30, 82, 0); I('shaft', 1700, 248, 32, 34, 0); I('rack', 1175, 147, 100, 24, 0);
  // living / dining / kitchen
  I('dining', 1238, 452, 97, 195, 0); I('sofa_l', 1450, 452, 275, 150, 270, { mirror: true }); I('coffee', 1566, 470, 86, 86, 0);
  I('tv', 1696, 442, 255, 38, 90); I('fridge', 1670, 785, 105, 70, 90);
  I('counter', 1672, 905, 130, 64, 90); I('sink', 1672, 1010, 80, 64, 90); I('counter', 1672, 1125, 150, 64, 90); I('hob', 1592, 1168, 95, 64, 180);
  // corridor built-ins
  I('cabinet', 534, 825, 212, 48, 180); I('shaft', 694, 825, 92, 48, 0); I('shaft', 796, 825, 92, 48, 0); I('cabinet', 1117, 825, 535, 48, 180);
  // WC master
  I('basin', 125, 888, 95, 50, 270); I('toilet', 137, 985, 42, 74, 270); I('shower', 193, 1082, 192, 98, 0);
  I('shaft', 150, 1165, 108, 40, 0); I('shaft', 255, 1165, 66, 40, 0);
  // WC common
  I('basin', 1240, 910, 92, 50, 270); I('toilet', 1252, 1012, 42, 74, 270); I('shower', 1312, 1120, 118, 108, 0);
  I('shaft', 1222, 1135, 30, 120, 0);
  return L;
}

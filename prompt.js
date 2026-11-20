// Prompt builder for Gemini: geometry-locked restyle of the exported 3D massing render.
import { CATALOG, OPEN_TYPES, ROOM_EN, DIR_EN, dirKey, polyArea, pointInPoly, distToPolyEdge, layoutBBox, planSide, hostWall, opDefaults, isGlazing, glassHeightEN } from './model.js';

const LIGHT_EN = {
  day: 'natural daylight from the upper left, soft realistic shadows',
  golden: 'warm golden-hour light, long soft shadows',
  studio: 'bright even studio lighting, minimal shadows',
  dramatic: 'dramatic directional lighting with deep contrast, luxury editorial feel'
};
const CAM_EN = { iso45: '45-degree elevated view', top: 'straight top-down bird’s-eye view (90°)', low30: 'low elevated view (30°)' };
const BG_EN = { white: 'pure white background', grey: 'soft light grey background', dark: 'dark charcoal background' };

export function roomOf(L, x, y) { return L.rooms.find(r => r.poly.length > 2 && pointInPoly(x, y, r.poly)); }

// Doors/windows that belong to a room: opening midpoint close to the room outline
export function openingsOfRoom(L, r) {
  return L.openings.filter(o => distToPolyEdge((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2, r.poly) < 0.3);
}

export function inventory(L) {
  const rooms = L.rooms.filter(r => r.poly.length > 2).map(r => {
    const ops = openingsOfRoom(L, r);
    const items = L.items.filter(it => roomOf(L, it.x, it.y) === r);
    return { r, area: polyArea(r.poly), ops, items };
  });
  const count = t => L.openings.filter(o => o.type === t).length;
  return {
    rooms, doors: count('door'), main: count('main'), windows: count('window'), slides: count('slide'), glass: count('glass'),
    unplaced: L.items.filter(it => !roomOf(L, it.x, it.y))
  };
}

export function warnings(L) {
  const W = [];
  const inv = inventory(L);
  if (!L.walls.length) W.push('Chưa có tường nào.');
  if (!L.rooms.length) W.push('Chưa khai báo phòng nào — sàn sẽ không hiện trong 3D.');
  if (inv.main !== 1) W.push(`Có ${inv.main} cửa chính (nên là đúng 1).`);
  L.openings.forEach(o => { if (!hostWall(o, L.walls)) W.push(`${OPEN_TYPES[o.type].vi} tại (${((o.x1 + o.x2) / 2).toFixed(1)}; ${((o.y1 + o.y2) / 2).toFixed(1)}) m không nằm trên tường nào.`); });
  inv.rooms.forEach(({ r, ops }) => {
    if (['bedroom', 'bath'].includes(r.type) && !ops.some(o => o.type === 'door' || o.type === 'main' || o.type === 'slide')) W.push(`"${r.name}" chưa có cửa đi.`);
  });
  inv.unplaced.forEach(it => W.push(`${CATALOG[it.type]?.vi || it.type} nằm ngoài mọi phòng.`));
  return W;
}

function fixtureLine(L, it, bb) {
  const c = CATALOG[it.type] || { en: it.type };
  const r = roomOf(L, it.x, it.y);
  const front = DIR_EN[dirKey(it.rot)];
  const where = r ? `in the ${r.name} (${ROOM_EN[r.type] || r.type})` : 'outside any room';
  return `- ${c.en} ${where}, ${planSide(it.x, it.y, bb)} part of the plan; its front faces ${front}${c.note ? '; ' + c.note : ''}`;
}

export function buildPrompts(L, S, o) {
  const inv = inventory(L), bb = layoutBBox(L);
  const W = (bb.x1 - bb.x0).toFixed(1), D = (bb.y1 - bb.y0).toFixed(1);
  const totalRooms = inv.rooms.length;
  const openList = L.openings.map(op => {
    const r = inv.rooms.filter(x => x.ops.includes(op)).map(x => x.r.name).join(' ↔ ') || 'exterior wall';
    const w = Math.hypot(op.x2 - op.x1, op.y2 - op.y1);
    opDefaults(op);
    const mx = (op.x1 + op.x2) / 2, my = (op.y1 + op.y2) / 2, ux = (op.x2 - op.x1) / w, uy = (op.y2 - op.y1) / w;
    const into = roomOf(L, mx - uy * op.swing * 0.45, my + ux * op.swing * 0.45);
    const intoTxt = into ? `opens into the ${into.name}` : 'opens outward';
    const intoPl = into ? `open into the ${into.name}` : 'open outward';
    const hx = op.hinge === 2 ? op.x2 : op.x1, hy = op.hinge === 2 ? op.y2 : op.y1, fx = op.hinge === 2 ? op.x1 : op.x2, fy = op.hinge === 2 ? op.y1 : op.y2;
    const hingeEnd = Math.abs(fx - hx) >= Math.abs(fy - hy) ? (hx < fx ? 'left' : 'right') : (hy < fy ? 'upper' : 'lower');
    let kind;
    if (isGlazing(op)) {
      const m = op.mech;
      kind = m === 'fixed' ? `fixed ${op.type === 'window' ? 'window' : 'glazing'} (does not open), ${glassHeightEN(op)}`
        : m === 'slide' ? `sliding glass door, ${glassHeightEN(op)}`
        : m === 'swing2' ? `double-leaf hinged glass door, ${glassHeightEN(op)}, both leaves ${intoPl}`
        : `single-leaf hinged glass door, ${glassHeightEN(op)}, hinged at its ${hingeEnd} end (as seen on the plan), ${intoTxt}`;
    } else {
      kind = op.leaves === 2 ? `double-leaf ${OPEN_TYPES[op.type].en}, both leaves ${intoPl}` : `single-leaf ${OPEN_TYPES[op.type].en}, hinged at its ${hingeEnd} end (as seen on the plan), ${intoTxt}`;
    }
    return `- ${kind}; ${w.toFixed(2)} m wide; ${planSide(mx, my, bb)} of the plan; between: ${r}`;
  });
  const fixtures = L.items.filter(it => ['washer', 'toilet', 'basin', 'shower', 'bathtub', 'sink', 'hob', 'fridge', 'counter', 'island'].includes(it.type)).map(it => fixtureLine(L, it, bb));
  const furniture = L.items.filter(it => !['washer', 'toilet', 'basin', 'shower', 'bathtub', 'sink', 'hob', 'fridge', 'counter', 'island', 'shaft', 'rack'].includes(it.type)).map(it => fixtureLine(L, it, bb));
  const shafts = L.items.filter(it => it.type === 'shaft').length;
  const roomLines = inv.rooms.map(({ r, area, ops }) => {
    const d = ops.filter(x => x.type === 'door' || x.type === 'main').length, wn = ops.filter(x => x.type === 'window').length, gl = ops.filter(x => x.type === 'slide' || x.type === 'glass').length;
    return `- ${r.name} — ${ROOM_EN[r.type] || r.type}, about ${area.toFixed(1)} m²; doors: ${d}; windows: ${wn}; glazed openings: ${gl}`;
  });
  const extra = o.extra === 'noplants' ? '\n- Do not add plants or greenery.' : o.extra === 'noart' ? '\n- Do not add wall art or decorative wall objects.' : '';

  const main = `3D Cutaway Restyle — geometry-locked
Task: Turn the attached 3D massing render (IMAGE 1) into a finished, photorealistic roofless 3D dollhouse cutaway of the same apartment. IMAGE 1 is the geometric ground truth. You are only adding materials, finishes, lighting and decor — not designing the layout.

1. PRIORITY ORDER
1. Keep every wall, opening, fixture and furniture position exactly as in IMAGE 1
2. Keep the camera, framing and orientation of IMAGE 1 exactly
3. Correct materials and colours from IMAGE 2 and the style module
4. Realistic detail, lighting and render quality
Never sacrifice geometric accuracy for aesthetics.

2. ATTACHED IMAGES — ROLES
- IMAGE 1 — white massing model: exact geometry, camera angle and framing. Treat it like a line drawing to be traced.
- IMAGE 2 — the same model with draft materials${o.hasRender ? ', physically based lighting' : ''} and decor: the colour, material and decor placement to follow (walls, floors, joinery, fabrics, curtains, rugs, lamps, art, plants).
- IMAGE 3 — the original 2D floor plan: use only to confirm room names and functions. If IMAGE 3 seems to disagree with IMAGE 1, follow IMAGE 1.

3. APARTMENT
- Typology: ${o.aptType}${o.area ? `\n- Gross floor area (measured to wall centrelines): about ${o.area} m²` : ''}
- Footprint: about ${W} m wide × ${D} m deep${o.orientation ? `\n- Main entrance door faces ${o.orientation}` : ''}
- Exactly ${totalRooms} spaces, listed in section 5

4. GEOMETRY LOCK
- Output must overlay IMAGE 1 exactly: same camera position, angle, lens, framing and image proportions
- Do not rotate, mirror, flip, crop, re-frame or zoom
- Walls are cut at the same height as in IMAGE 1; keep the dark cut tops of the walls; no roof, no ceiling${o.lowFront ? '\n- The exterior walls nearest the camera are deliberately cut low (about 1 m) so the rooms stay visible — keep them low, do not rebuild them to full height' : ''}
- Do not move, add, remove, merge or split any wall, room, column or technical shaft (${shafts} solid shaft boxes are present — keep them as solid boxes, never as rooms or doors)
- Do not add balconies, steps, columns, beams or niches that are not in IMAGE 1

5. VERIFIED INVENTORY (checked by the user against the original plan)
Spaces:
${roomLines.join('\n')}
Openings — total: ${inv.main} main entrance door, ${inv.doors} interior doors, ${inv.windows} windows, ${inv.slides} sliding glass doors, ${inv.glass} glass balustrades/glazed walls:
${openList.join('\n')}

6. DOORS AND WINDOWS — CRITICAL
- Render exactly the openings listed above, each once, at the position shown in IMAGE 1
- Door leaves are shown open at 90°; keep each hinge side and opening direction as in IMAGE 1 and as listed above
- Keep each glazed opening at the height listed above: solid wall below a raised glass sill, glass up to the stated head height; sliding doors stay sliding, fixed glazing stays fixed
- Do not duplicate, omit, move, widen or narrow any opening; windows must never become doors
- Do not interpret wardrobes, cabinet fronts or glass shower screens as doors

7. FIXTURES AND APPLIANCES (position and facing are fixed)
${fixtures.join('\n') || '- none'}
Every fixture stays upright on the floor or worktop with its working face where IMAGE 1 shows it. A washing machine's round drum door is vertical on its front face — never on top. Toilets keep the cistern against the wall.

8. FURNITURE (position and facing are fixed)
${furniture.join('\n') || '- none'}
- Restyle furniture in the style below but keep each piece's footprint, height class and facing
- Do not add large furniture; small decor is allowed only where it blocks nothing

9. INTERIOR STYLE MODULE
Style: ${S.name} — ${S.variant}
The style is a surface layer only. It must not change any geometry.
Atmosphere: ${S.mood.join(', ')}
Colour hierarchy:
${S.colours.map(c => `- ${c.role}: ${c.label} (${c.hex}) — ${c.note}`).join('\n')}
Primary materials:
${S.primaryMat.map(m => `- ${m}`).join('\n')}
Secondary and accent materials:
${[...S.secondaryMat, ...S.accentMat].map(m => `- ${m}`).join('\n')}
Form language:
${S.formLang.map(f => `- ${f}`).join('\n')}
Walls: ${S.walls}
Floors: ${S.floors}
Ceiling and lighting (roofless cutaway — only elements that remain visible): ${S.ceiling}
Furniture and joinery: ${S.furniture}
Textiles and decor: ${S.textiles} Decor density: ${S.decorDensity}. Allowed decor: ${S.allowedDecor.join('; ')}
Room by room:
- Living / dining: ${S.rooms.living}
- Kitchen: ${S.rooms.kitchen}
- Bedrooms: ${S.rooms.bedroom}
- Bathrooms: ${S.rooms.bathroom}
- Utility / circulation: ${S.rooms.utility}
Cutaway rule: ${S.cutaway}
Avoid: ${S.avoid.join('; ')}. Do not mix in other interior styles.

10. CAMERA, LIGHT, OUTPUT
- View: ${o.persp ? 'perspective' : 'long-lens, near-orthographic'} ${CAM_EN[o.cam] || ''}, identical to IMAGE 1
- Lighting: ${LIGHT_EN[o.light]}; keep every room bright and readable, no shadow hiding the layout
- ${BG_EN[o.bg]}
- Quality: ${o.quality}; clean geometry, real-world scale, crisp detail${extra}

11. FINAL INTERNAL AUDIT — check before output
1. The image overlays IMAGE 1 exactly: not rotated, mirrored, re-framed or zoomed
2. ${totalRooms} spaces, no more, no fewer; every wall where IMAGE 1 has it
3. Openings: ${inv.main} main door, ${inv.doors} interior doors, ${inv.windows} windows, ${inv.slides} sliding doors, ${inv.glass} glazed balustrades — each once
4. Every fixture and appliance upright, in place and facing as listed in section 7
5. Every furniture piece in place and facing as listed in section 8; nothing blocks a door or passes through a wall
6. Colours and materials follow the ${S.variant} module and IMAGE 2`;

  const neg = `Do not generate:
- any change of camera, framing, crop or zoom compared with IMAGE 1
- mirrored, rotated or flipped layout
- added, removed, moved, merged or split walls or rooms
- missing, extra, duplicated or relocated doors or windows; windows turned into doors
- technical shaft boxes turned into doors, wardrobes or rooms
- washing machines lying down or with the drum door on top; upside-down or rotated toilets
- furniture floating, intersecting walls, or blocking doors and corridors
- a roof, ceiling slab or full-height walls that hide the interior
- extra balconies, steps or columns
- ${S.avoid.join('\n- ')}
- materials or decor from other interior styles`;

  const fix = `The last render has an error. Regenerate using IMAGE 1 as the exact geometry and camera, and change ONLY what is needed to fix this error:
[DESCRIBE THE ERROR — e.g. "the door of ${inv.rooms.find(x => x.r.type === 'bedroom')?.r.name || 'the bedroom'} is duplicated — there is exactly one door, as in IMAGE 1"; "the washing machine lies on its back — it must stand upright with the drum door on its front face"; "the image is mirrored left-right compared with IMAGE 1"]
Keep the style, materials, lighting and everything else unchanged.`;

  return { main, neg, fix };
}

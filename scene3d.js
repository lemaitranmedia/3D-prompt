// three.js scene: builds a roofless cutaway apartment from the layout data.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { hostWall, projOnSeg, layoutBBox, polyCentroid, polyArea, pointInPoly, opDefaults, isGlazing, CEIL_H } from './model.js';
import { buildItem, addDecor, clearGeoCache } from './furniture.js';

const DOOR_H = 2.1, WIN_SILL = 0.9, WIN_HEAD = 2.3, SLAB = 0.22;

// ── textures (CC0, Poly Haven, via the casa-serra repo) ──
const texLoader = new THREE.TextureLoader();
const texCache = {};
function tex(name, rep = 1, srgb = true) {
  const k = name + rep;
  if (!texCache[k]) {
    const t = texLoader.load('tex/' + name + '.jpg');
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache[k] = t;
  }
  return texCache[k];
}
const hex = h => new THREE.Color(h);
const lum = h => { const c = hex(h); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
const mix = (a, b, t) => '#' + hex(a).lerp(hex(b), t).getHexString();

// ── materials ──
function palette(mode, S) {
  const std = o => new THREE.MeshStandardMaterial(o);
  const phys = o => new THREE.MeshPhysicalMaterial(o);
  if (mode !== 'style' || !S) {
    const white = std({ color: '#f4f3f0', roughness: 0.9 });
    const M = new Proxy({}, { get: (t, k) => k in t ? t[k] : white });
    M.glass = phys({ color: '#dfe7ea', transparent: true, opacity: 0.3, roughness: 0.05 });
    M.sheer = M.glass; M.mirror = std({ color: '#d9dcdd', roughness: 0.2 });
    M.cap = new THREE.MeshBasicMaterial({ color: mode === 'plan' ? '#1c1c1c' : '#2b2b2b' });
    M.line = new THREE.LineBasicMaterial({ color: '#202020' });
    M.floor = std({ color: mode === 'plan' ? '#ffffff' : '#ecebe7', roughness: 1 }); M.floorWet = M.floor;
    M.slab = std({ color: '#e2e1dd', roughness: 1 });
    M.gap = std({ color: '#cfcfcc', roughness: 1 });
    M.screen = std({ color: '#d8d8d8' });
    return M;
  }
  const M = {};
  const [cD, cS, cA] = S.colours.map(c => c.hex);
  const all = (S.primaryMat.join(' ') + ' ' + S.secondaryMat.join(' ') + ' ' + S.accentMat.join(' ') + ' ' + S.furniture).toLowerCase();
  const floorTxt = (S.floors || '').toLowerCase(), firstClause = floorTxt.split(/\bor\b|—|\./)[0];
  const isStone = /stone|porcelain|travertine|marble|concrete|terrazzo|tile|cement/.test(firstClause) && !/timber|oak|walnut|wood|teak|pine|ash|parquet/.test(firstClause);
  const isConcrete = /concrete|cement/.test(firstClause);
  const darkWood = lum(cS) < 0.3, darkScheme = lum(cD) < 0.35;
  const woodTex = darkWood ? 'natural_walnut_veneer_g' : 'oak_wood_planks_g', woodNor = darkWood ? 'natural_walnut_veneer_n' : 'oak_wood_planks_n';
  const tint = (h, k = 1.25) => { const c = hex(h).multiplyScalar(k); c.r = Math.min(c.r, 1); c.g = Math.min(c.g, 1); c.b = Math.min(c.b, 1); return c; };
  const metalCol = /brass|bronze|gold/.test(all) ? '#b0894f' : /chrome|nickel|silver|stainless/.test(all) ? '#c9c9c7' : '#2a2a2a';
  const v2 = s => new THREE.Vector2(s, s);
  M.wall = std({ color: tint(cD, 1.18), map: tex('white_stucco_g', 3), normalMap: tex('white_stucco_n', 3, false), normalScale: v2(0.2), roughness: 0.92 });
  M.cap = new THREE.MeshStandardMaterial({ color: '#3a3633', roughness: 0.9 });
  M.slab = std({ color: darkScheme ? '#2f2c29' : '#d6d1c8', roughness: 0.95 });
  M.floor = isStone
    ? std({ color: tint(isConcrete ? cS : mix(cS, cD, 0.35), 1.18), map: tex(isConcrete ? 'wood_textured_concrete_g' : 'marble_01_g', 2), normalMap: tex('marble_01_n', 2, false), roughness: isConcrete ? 0.55 : 0.28 })
    : std({ color: tint(cS, 1.28), map: tex(woodTex, 2), normalMap: tex(woodNor, 2, false), normalScale: v2(0.35), roughness: 0.48 });
  M.floorWet = std({ color: tint(mix(cD, cS, 0.25), 1.12), map: tex('marble_01_g', 1.5), normalMap: tex('marble_01_n', 1.5, false), roughness: 0.3 });
  M.wood = std({ color: tint(cS, 1.25), map: tex(woodTex, 1), normalMap: tex(woodNor, 1, false), roughness: 0.45 });
  M.joinery = std({ color: tint(darkScheme ? cS : (lum(cD) > 0.6 ? mix(cD, cS, 0.3) : cS), 1.1), roughness: 0.42 });
  M.gap = std({ color: darkScheme ? '#151413' : '#6f6a63', roughness: 1 });
  const fabCol = darkScheme ? mix(cS, cD, 0.3) : mix(cD, cS, 0.42);
  M.fabric = phys({ color: tint(fabCol, 1.12), map: tex('rough_linen_g', 2), normalMap: tex('rough_linen_n', 2, false), roughness: 0.95, sheen: 0.6, sheenColor: hex(mix(fabCol, '#ffffff', 0.5)), sheenRoughness: 0.8 });
  M.linen = phys({ color: tint(mix('#f3f0ea', cD, 0.15), 1.0), map: tex('rough_linen_g', 1), roughness: 0.95, sheen: 0.5, sheenColor: hex('#ffffff') });
  M.duvet = phys({ color: tint(darkScheme ? mix(cS, cD, 0.5) : mix(cD, '#ffffff', 0.25), 1.05), map: tex('rough_linen_g', 1), normalMap: tex('rough_linen_n', 1, false), roughness: 0.95, sheen: 0.6, sheenColor: hex('#ffffff') });
  M.throwA = phys({ color: tint(cA, 1.0), map: tex('rough_linen_g', 2), roughness: 0.9, sheen: 0.7, sheenColor: hex(mix(cA, '#ffffff', 0.4)) });
  M.head = phys({ color: tint(mix(cS, cD, 0.35), 1.1), map: tex('rough_linen_g', 2), normalMap: tex('rough_linen_n', 2, false), roughness: 0.9, sheen: 0.5, sheenColor: hex('#ffffff') });
  M.cushionA = phys({ color: tint(cA, 1.05), roughness: 0.85, sheen: 0.6, sheenColor: hex('#ffffff') });
  M.cushionB = phys({ color: tint(mix(cS, cD, 0.45), 1.12), map: tex('rough_linen_g', 2), roughness: 0.9, sheen: 0.5, sheenColor: hex('#ffffff') });
  M.metal = std({ color: metalCol, metalness: 0.9, roughness: 0.32 });
  M.metalDark = std({ color: metalCol === '#c9c9c7' ? '#9a9a98' : metalCol === '#b0894f' ? '#8a6a3c' : '#262626', metalness: 0.8, roughness: 0.4 });
  M.steel = std({ color: '#d4d6d8', metalness: 0.55, roughness: 0.3 });
  M.ceramic = phys({ color: '#f6f6f3', roughness: 0.12, clearcoat: 0.6 });
  M.ceramicA = std({ color: tint(mix(cS, '#ffffff', 0.35), 1.05), roughness: 0.6 });
  M.stone = std({ color: tint(darkScheme ? mix(cD, '#555', 0.3) : mix(cD, '#ffffff', 0.45), 1.08), map: tex('marble_01_g', 1), normalMap: tex('marble_01_n', 1, false), roughness: 0.2 });
  M.counterTop = M.stone; M.tableTop = /marble|stone/.test(S.rooms.living.toLowerCase()) ? M.stone : M.wood;
  M.backsplash = std({ color: tint(mix(cD, '#ffffff', 0.3), 1.08), map: tex('marble_01_g', 2), roughness: 0.18 });
  M.tile = std({ color: tint(mix(cD, cS, 0.18), 1.1), map: tex('marble_01_g', 1.2), normalMap: tex('marble_01_n', 1.2, false), roughness: 0.25 });
  M.baseboard = std({ color: tint(darkScheme ? cD : mix(cD, cS, 0.15), 1.05), roughness: 0.5 });
  M.shade = std({ color: '#f3e7d3', emissive: hex('#ffcf95'), emissiveIntensity: 0.55, roughness: 0.9, side: THREE.DoubleSide });
  M.pendant = std({ color: hex(cA), metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide });
  M.bulb = std({ color: '#fff4e0', emissive: hex('#ffd59a'), emissiveIntensity: 2.5 });
  M.book1 = std({ color: tint(cA, 1), roughness: 0.8 }); M.book2 = std({ color: tint(mix(cS, '#ffffff', 0.3), 1), roughness: 0.8 }); M.book3 = std({ color: tint(mix(cD, '#222', 0.5), 1), roughness: 0.8 });
  M.leaf = std({ color: '#4e6a3d', roughness: 0.7, flatShading: true }); M.pot = M.ceramicA;
  M.screen = std({ color: '#0d0e10', roughness: 0.15, metalness: 0.3 }); M.tvFrame = std({ color: '#141414', roughness: 0.4 });
  M.blackGlass = std({ color: '#0b0b0c', roughness: 0.08, metalness: 0.2 }); M.hobRing = std({ color: '#5a5a5a', roughness: 0.5 });
  M.washerGlass = std({ color: '#2a3238', roughness: 0.1, metalness: 0.3 }); M.panel = std({ color: '#e7e7e5', roughness: 0.4 });
  M.mirror = std({ color: '#e9eef0', metalness: 1, roughness: 0.04 }); M.mirrorFrame = M.metal;
  M.showerTray = std({ color: tint(mix(cD, '#ffffff', 0.3), 1.05), roughness: 0.4 });
  M.glass = phys({ color: '#eef6f8', metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.01, ior: 1.5, transparent: true, opacity: 0.25 });
  M.water = std({ color: '#cfe3e8', roughness: 0.05 });
  M.rug = std({ color: tint(darkScheme ? mix(cS, cD, 0.4) : mix(cS, cD, 0.62), 1.1), map: tex('poly_wool_herringbone_g', 3), roughness: 1 });
  M.frameArt = M.metalDark;
  M.ledStrip = std({ color: '#fff2dc', emissive: hex('#ffdcae'), emissiveIntensity: 0.9 });
  M.towel = phys({ color: tint(mix(cD, '#ffffff', 0.4), 1), roughness: 1, sheen: 0.8, sheenColor: hex('#ffffff') });
  M.curtain = phys({ color: tint(darkScheme ? mix(cS, cD, 0.5) : mix(cD, '#ffffff', 0.1), 1.05), map: tex('rough_linen_g', 2), roughness: 0.95, sheen: 0.6, sheenColor: hex('#ffffff') });
  M.sheer = std({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 1, side: THREE.DoubleSide });
  M.frame = std({ color: '#3b3b3b', roughness: 0.45, metalness: 0.5 });
  M.line = null;
  return M;
}

// ── walls with openings ──
function wallPieces(w, openings) {
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const cuts = [];
  for (const o of openings) {
    if (hostWall(o, [w]) !== w) continue;
    const a = projOnSeg(o.x1, o.y1, w.x1, w.y1, w.x2, w.y2).t * L, b = projOnSeg(o.x2, o.y2, w.x1, w.y1, w.x2, w.y2).t * L;
    cuts.push({ a: Math.min(a, b), b: Math.max(a, b), o });
  }
  cuts.sort((p, q) => p.a - q.a);
  const pieces = []; let s = 0;
  for (const c of cuts) {
    if (c.a > s + 0.005) pieces.push({ a: s, b: c.a, y0: -SLAB, y1: null });
    const o = opDefaults(c.o);
    pieces.push({ a: c.a, b: c.b, y0: -SLAB, y1: 0, open: o, sill: true });                 // under the opening, down to the slab
    if (!isGlazing(o)) pieces.push({ a: c.a, b: c.b, y0: DOOR_H, y1: null, open: o });
    else {
      if (o.sill > 0.01) pieces.push({ a: c.a, b: c.b, y0: 0, y1: o.sill, open: o });
      if (o.head < CEIL_H - 0.01) pieces.push({ a: c.a, b: c.b, y0: o.head, y1: null, open: o });
    }
    s = Math.max(s, c.b);
  }
  if (s < L - 0.005) pieces.push({ a: s, b: L, y0: -SLAB, y1: null });
  return { L, pieces };
}

function skyTexture(Grad, mode) {
  const t = new Grad(256);
  t.topColor.set(mode === 'golden' ? '#ffd9a8' : '#e4eef8');
  t.bottomColor.set('#bdb5aa'); t.exponent = 2; t.update();
  return t;
}

export class Viewer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    // long-lens camera: almost no perspective distortion, works with AO and the path tracer
    this.camera = new THREE.PerspectiveCamera(12, 1, 0.1, 600);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => { this.stopPT(); this.render(); });
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.opts = { mode: 'style', cut: 2.4, light: 'day', bg: 'white', cam: 'iso45', az: -30, persp: false, overlay: null, lowFront: true, ao: true };
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, 8, 8);
    this.gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1.0, scale: 1.1, samples: 16 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.gtao.blendIntensity = 0.9;
    this.composer.addPass(this.gtao);
    this.composer.addPass(new OutputPass());
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas.parentElement);
    this.active = false; this.pt = null; this.ptOn = false;
    const loop = () => {
      if (this.active) {
        this.controls.update();
        if (this.ptOn && this.pt) {
          this.pt.renderSample();
          if (this.onPT) this.onPT(this.pt.samples);
          if (this.pt.samples >= this.ptMax) { this.ptOn = false; if (this.onPTDone) this.onPTDone(); }
        }
      }
      requestAnimationFrame(loop);
    };
    loop();
    THREE.DefaultLoadingManager.onLoad = () => { this.render(); if (this.ptOn && this.pt) this.pt.updateMaterials(); };
  }
  resize() {
    const el = this.canvas.parentElement; const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    this.renderer.setSize(W, H, false); this.composer.setSize(W, H); this.aspect = W / H;
    this.stopPT(); this.fitCamera(!this._fitted); this.render();
  }
  render() {
    if (!this.layout || this.ptOn) return;
    if (this.opts.mode === 'style' && this.opts.ao) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  build(layout, style) {
    this.stopPT();
    this.layout = layout; this.style = style;
    const { mode, cut } = this.opts;
    const H = mode === 'plan' ? 1.2 : cut;
    while (this.root.children.length) { const c = this.root.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    clearGeoCache();
    const M = palette(mode, style);
    const bb = layoutBBox(layout); this.bb = bb;
    const lines = [];
    const markLines = m => { if (M.line) lines.push(m); };

    // floors + slab (the apartment sits on a cut floor slab, like an architectural model)
    for (const r of layout.rooms) {
      if (r.poly.length < 3) continue;
      const sh = new THREE.Shape(r.poly.map(([x, y]) => new THREE.Vector2(x, -y)));
      const wet = ['bath', 'logia', 'balcony'].includes(r.type);
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(sh), wet ? M.floorWet : M.floor);
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.001; mesh.receiveShadow = true;
      const pos = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 2.5, pos.getY(i) / 2.5);
      this.root.add(mesh);
      if (mode !== 'plan') {
        const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: SLAB - 0.002, bevelEnabled: false }), M.slab);
        slab.rotation.x = -Math.PI / 2; slab.position.y = -SLAB; slab.receiveShadow = true;
        this.root.add(slab);
      }
    }

    // exterior walls on the camera side are lowered to 1 m so they don't hide the rooms
    const low = new Set();
    if (this.opts.lowFront && mode !== 'plan' && this.opts.cam !== 'top') {
      const az = this.opts.az * Math.PI / 180, cx = Math.sin(az), cz = Math.cos(az);
      for (const w of layout.walls) {
        if (w.t < 0.17) continue;
        const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1); if (L < 0.01) continue;
        const nx = -(w.y2 - w.y1) / L, ny = (w.x2 - w.x1) / L, dp = nx * cx + ny * cz;
        if (Math.abs(dp) < 0.35) continue;
        const sg = Math.sign(dp), px = (w.x1 + w.x2) / 2 + nx * sg * 0.3, py = (w.y1 + w.y2) / 2 + ny * sg * 0.3;
        if (!layout.rooms.some(r => r.poly.length > 2 && pointInPoly(px, py, r.poly))) low.add(w);
      }
    }
    const Hw = w => (w && low.has(w)) ? Math.min(H, 1.0) : H;

    // walls
    for (const w of layout.walls) {
      const { L, pieces } = wallPieces(w, layout.openings);
      if (L < 0.01) continue;
      const Hh = Hw(w);
      const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L, ang = Math.atan2(uy, ux);
      for (const p of pieces) {
        let y0 = mode === 'plan' ? Math.max(0, p.y0) : p.y0;
        const top = p.y1 == null ? Hh : Math.min(p.y1, Hh);
        if (top - y0 < 0.005 || y0 >= Hh) continue;
        let a = p.a, b = p.b;
        if (!p.open) { if (a < 0.01) a -= w.t / 2; if (b > L - 0.01) b += w.t / 2; }
        const len = b - a, mid = (a + b) / 2;
        const geo = new THREE.BoxGeometry(len, top - y0, w.t);
        const isTop = top >= Hh - 0.001;
        const mesh = new THREE.Mesh(geo, p.sill ? M.slab : M.wall);
        mesh.position.set(w.x1 + ux * mid, y0 + (top - y0) / 2, w.y1 + uy * mid);
        mesh.rotation.y = -ang; mesh.castShadow = mesh.receiveShadow = true;
        this.root.add(mesh); markLines(mesh);
        if (isTop) {   // dark cut on top of the wall (section poché)
          const cap = new THREE.Mesh(new THREE.PlaneGeometry(len, w.t), M.cap);
          cap.rotation.order = 'YXZ'; cap.rotation.set(-Math.PI / 2, -ang, 0);
          cap.position.set(mesh.position.x, top + 0.0015, mesh.position.z); this.root.add(cap);
        }
      }
    }

    // openings
    for (const o of layout.openings) {
      const wl = hostWall(o, layout.walls);
      const Hh = Hw(wl);
      const L = Math.hypot(o.x2 - o.x1, o.y2 - o.y1); if (L < 0.05) continue;
      const ux = (o.x2 - o.x1) / L, uy = (o.y2 - o.y1) / L, nx = -uy, ny = ux, ang = Math.atan2(uy, ux);
      const t = wl ? wl.t : 0.12, mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2;
      const addBox = (w, h, d, y, mat, ox = 0, oz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(mx + ux * ox + nx * oz, y, my + uy * ox + ny * oz); m.rotation.y = -ang; m.castShadow = true; m.receiveShadow = true; this.root.add(m); markLines(m); return m; };
      opDefaults(o);
      const arc = (hx, hy, fx, fy, sx, sy, R) => {             // swing arc on the floor (line views)
        if (mode === 'style') return;
        const a0 = Math.atan2(fy - hy, fx - hx), a1 = Math.atan2(sy, sx);
        let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const pts = []; for (let i = 0; i <= 24; i++) { const aa = a0 + da * i / 24; pts.push(new THREE.Vector3(hx + Math.cos(aa) * R, 0.012, hy + Math.sin(aa) * R)); }
        this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#333' })));
      };
      // a leaf of width lw hinged at (hx,hy), opened 90° toward the swing side
      const leafAt = (hx, hy, lw, toward, y0, h, mat, glass) => {
        const sgn = o.swing >= 0 ? 1 : -1;
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(glass ? 0.02 : 0.045, h - 0.01, lw - 0.02), glass ? M.glass : mat);
        body.castShadow = !glass; body.receiveShadow = true; g.add(body); markLines(body);
        if (glass && mode === 'style') { for (const z of [-lw / 2 + 0.02, lw / 2 - 0.02]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.04), M.frame); f.position.z = z; g.add(f); } for (const yy of [-h / 2 + 0.02, h / 2 - 0.02]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, lw), M.frame); f.position.y = yy; g.add(f); } }
        g.position.set(hx + nx * sgn * lw / 2 + ux * toward * 0.03, y0 + h / 2, hy + ny * sgn * lw / 2 + uy * toward * 0.03); g.rotation.y = -ang;
        this.root.add(g);
        if (mode === 'style' && !glass) { const hd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), M.metal); const k = sgn * (lw - 0.1); hd.position.set(hx + nx * k + ux * toward * 0.07, 1.0, hy + ny * k + uy * toward * 0.07); hd.rotation.y = -ang; this.root.add(hd); }
        arc(hx, hy, hx + ux * toward * lw, hy + uy * toward * lw, nx * sgn, ny * sgn, lw);
      };
      if (isGlazing(o)) {
        const y0 = Math.max(0, o.sill), y1 = Math.min(o.head, Hh);
        if (y1 > y0 + 0.02) {
          const rail = o.sill < 0.02 && o.head <= 1.3;
          if (o.mech === 'swing' || o.mech === 'swing2') {
            if (o.mech === 'swing2') { leafAt(o.x1, o.y1, L / 2, 1, y0, y1 - y0, null, true); leafAt(o.x2, o.y2, L / 2, -1, y0, y1 - y0, null, true); }
            else { const h1 = o.hinge === 2; leafAt(h1 ? o.x2 : o.x1, h1 ? o.y2 : o.y1, L, h1 ? -1 : 1, y0, y1 - y0, null, true); }
            if (mode === 'style') { for (const s2 of [-1, 1]) addBox(0.05, y1 - y0, t * 0.7, (y0 + y1) / 2, M.frame, s2 * L / 2); if (y1 < Hh) addBox(L, 0.05, t * 0.7, y1, M.frame); }
          } else if (o.mech === 'slide') {
            const d = o.slideDir >= 0 ? 1 : -1;
            for (const [k, oz] of [[-1, 0.025], [1, -0.025]]) {
              const pw = L * 0.52, ox = k * (L / 2 - pw / 2) + (k === d ? -d * L * 0.1 : 0);
              const g = addBox(pw, y1 - y0, 0.012, (y0 + y1) / 2, M.glass, ox, oz); g.castShadow = false;
              for (const e of [-1, 1]) addBox(0.04, y1 - y0, 0.04, (y0 + y1) / 2, M.frame, ox + e * pw / 2, oz);
            }
            addBox(L, 0.045, t * 0.8, y0 + 0.022, M.frame); if (y1 >= o.head - 0.001) addBox(L, 0.045, t * 0.8, y1 - 0.022, M.frame);
          } else {
            const g = addBox(L, y1 - y0, 0.012, (y0 + y1) / 2, M.glass); g.castShadow = false;
            addBox(L, 0.045, t * 0.7, y0 + 0.022, M.frame);
            if (y1 >= o.head - 0.001) addBox(L, 0.045, t * 0.7, y1 - 0.022, M.frame);
            const panes = Math.max(1, Math.round(L / (rail ? 1.4 : 0.9)));
            for (let i = 0; i <= panes; i++) addBox(rail ? 0.03 : 0.04, y1 - y0, t * 0.7, (y0 + y1) / 2, M.frame, -L / 2 + i * L / panes);
            if (rail) addBox(L, 0.04, 0.07, y1 + 0.01, M.frame);                        // handrail
          }
          if (o.sill > 0.3) addBox(L + 0.06, 0.03, t + 0.06, o.sill - 0.015, M.stone || M.frame);   // window board
        }
        continue;
      }
      // doors (1 or 2 leaves), frame in the styled view
      const leafH = Math.min(DOOR_H, Hh), dmat = o.type === 'main' ? M.wood : M.joinery;
      if (mode === 'style') {
        for (const s2 of [-1, 1]) addBox(0.05, leafH, t + 0.04, leafH / 2, M.joinery, s2 * (L / 2 + 0.005));
        if (Hh > DOOR_H) addBox(L + 0.1, 0.05, t + 0.04, DOOR_H + 0.02, M.joinery);
      }
      if (o.leaves === 2) { leafAt(o.x1, o.y1, L / 2, 1, 0, leafH, dmat, false); leafAt(o.x2, o.y2, L / 2, -1, 0, leafH, dmat, false); }
      else { const h2 = o.hinge === 2; leafAt(h2 ? o.x2 : o.x1, h2 ? o.y2 : o.y1, L, h2 ? -1 : 1, 0, leafH, dmat, false); }
    }

    // furniture & fixtures
    for (const it of layout.items) {
      const g = buildItem(it, M, H);
      g.position.set(it.x, 0, it.y); g.rotation.y = -it.rot * Math.PI / 180;
      if (mode === 'plan') g.traverse(o => { if (o.isMesh) { o.updateMatrixWorld(true); const bbx = new THREE.Box3().setFromObject(o); if (bbx.min.y > 1.2) o.visible = false; else if (bbx.max.y > 1.2 && o.geometry.parameters && o.geometry.parameters.height > 1.2) { o.scale.y = (1.2 - bbx.min.y) / (bbx.max.y - bbx.min.y); o.position.y = bbx.min.y + (1.2 - bbx.min.y) / 2; } } });
      this.root.add(g); g.traverse(o => { if (o.isMesh && o.visible) markLines(o); });
    }
    // styling decor (only in the styled view)
    if (mode === 'style') addDecor(this.root, layout, style, M, H, null);

    // line drawing overlay (plan / clay)
    if (M.line) for (const m of lines) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 35), M.line);
      e.position.copy(m.position); e.rotation.copy(m.rotation); e.scale.copy(m.scale);
      (m.parent === this.root ? this.root : m.parent).add(e);
    }
    // room labels in plan mode
    if (mode === 'plan') for (const r of layout.rooms) {
      if (r.poly.length < 3) continue;
      const [cx, cy] = polyCentroid(r.poly); const a = polyArea(r.poly);
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; const x = cv.getContext('2d');
      let fs = 44; x.font = `600 ${fs}px DM Sans, sans-serif`; while (x.measureText(r.name.toUpperCase()).width > 1000 && fs > 20) { fs -= 2; x.font = `600 ${fs}px DM Sans, sans-serif`; }
      x.fillStyle = '#111'; x.textAlign = 'center'; x.fillText(r.name.toUpperCase(), 512, 56);
      x.font = '36px DM Sans, sans-serif'; x.fillStyle = '#555'; x.fillText(a.toFixed(1) + ' m²', 512, 104);
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
      sp.rotation.x = -Math.PI / 2; sp.position.set(cx, 1.25, cy); sp.renderOrder = 10; this.root.add(sp);
    }
    if (mode === 'plan' && this.opts.overlay && layout.img) {
      const t = texLoader.load(this.opts.overlay, () => this.render()); t.colorSpace = THREE.SRGBColorSpace;
      const W = layout.img.w * layout.scale, Hh = layout.img.h * layout.scale;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.5, depthTest: false }));
      pl.rotation.x = -Math.PI / 2; pl.position.set(W / 2, 1.3, Hh / 2); pl.renderOrder = 20; this.root.add(pl);
    }
    // soft ground shadow under the model
    if (mode !== 'plan') {
      const sz = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 3;
      const gnd = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.ShadowMaterial({ opacity: 0.16 }));
      gnd.rotation.x = -Math.PI / 2; gnd.position.set((bb.x0 + bb.x1) / 2, -SLAB - 0.002, (bb.y0 + bb.y1) / 2); gnd.receiveShadow = true; gnd.userData.noPT = true;
      this.root.add(gnd);
    }
    this.setupLights();
    this._fitted = false;
    this.fitCamera(true);
    this.render();
  }

  setupLights() {
    this.scene.children.filter(c => c.isLight || c.userData.lt).forEach(c => this.scene.remove(c));
    const { light, bg, mode } = this.opts;
    const bgc = mode === 'plan' ? '#ffffff' : bg === 'grey' ? '#e6e6e3' : bg === 'dark' ? '#2a2a28' : '#ffffff';
    // tone mapping darkens pure white; lift the background so it prints as the chosen colour
    this.scene.background = new THREE.Color(bgc).multiplyScalar(mode === 'plan' ? 1 : bg === 'dark' ? 1.3 : 3.2);
    this.scene.environment = mode === 'plan' ? null : this.envTex;
    const presets = {
      day:      { sun: '#fff3e2', si: 2.4, hemi: 0.7, env: 0.6, el: 50, az: -40, exp: 1.0 },
      golden:   { sun: '#ffbf80', si: 2.8, hemi: 0.45, env: 0.45, el: 24, az: -65, exp: 1.0 },
      studio:   { sun: '#ffffff', si: 1.3, hemi: 1.3, env: 0.85, el: 72, az: -20, exp: 1.05 },
      dramatic: { sun: '#ffdcae', si: 3.4, hemi: 0.3, env: 0.35, el: 34, az: -55, exp: 0.95 }
    };
    const P = mode === 'style' ? presets[light] : { sun: '#ffffff', si: mode === 'plan' ? 0.6 : 1.6, hemi: mode === 'plan' ? 2.2 : 1.2, env: mode === 'plan' ? 0 : 0.6, el: 60, az: -35, exp: 1 };
    this.lightPreset = P;
    this.renderer.toneMappingExposure = P.exp;
    this.scene.environmentIntensity = P.env;
    const hemi = new THREE.HemisphereLight('#ffffff', '#cfc8bd', P.hemi); this.scene.add(hemi); this.hemi = hemi;
    const bb = this.bb || { x0: 0, y0: 0, x1: 10, y1: 8 };
    const cx = (bb.x0 + bb.x1) / 2, cz = (bb.y0 + bb.y1) / 2, R = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0);
    const sun = new THREE.DirectionalLight(P.sun, P.si);
    const el = P.el * Math.PI / 180, az = P.az * Math.PI / 180;
    sun.position.set(cx + Math.sin(az) * Math.cos(el) * R * 2, Math.sin(el) * R * 2, cz - Math.cos(az) * Math.cos(el) * R * 2);
    sun.target.position.set(cx, 0, cz); this.scene.add(sun.target); sun.target.userData.lt = true;
    sun.castShadow = mode !== 'plan'; sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -R * 0.75; sc.right = sc.top = R * 0.75; sc.near = 0.1; sc.far = R * 5;
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02; sun.shadow.radius = 5;
    this.scene.add(sun); this.sun = sun;
  }

  setCam(name) { this.opts.cam = name; this.fitCamera(true); this.render(); }

  fitCamera(reset) {
    if (!this.aspect) { const el = this.canvas.parentElement; if (el.clientWidth && el.clientHeight) { this.renderer.setSize(el.clientWidth, el.clientHeight, false); this.composer.setSize(el.clientWidth, el.clientHeight); this.aspect = el.clientWidth / el.clientHeight; } }
    if (!this.bb || !this.aspect) { this._fitted = false; return; }
    if (reset) this._fitted = true;
    const bb = this.bb, cx = (bb.x0 + bb.x1) / 2, cz = (bb.y0 + bb.y1) / 2;
    const mode = this.opts.mode, cam = mode === 'plan' ? 'top' : this.opts.cam;
    const el = { iso45: 45, top: 89.9, low30: 30 }[cam] * Math.PI / 180;
    const az = (mode === 'plan' ? 0 : this.opts.az) * Math.PI / 180;
    const fov = mode === 'plan' ? 3 : this.opts.persp ? 32 : 12;
    this.camera.fov = fov; this.camera.aspect = this.aspect;
    if (reset) {
      // camera sits on the BOTTOM side of the drawing (+z) looking toward its top edge → plan orientation is preserved
      const dir = cam === 'top' ? new THREE.Vector3(0, 1, 0.0001).normalize() : new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      const top = mode === 'plan' ? 1.2 : Math.max(this.opts.cut, 1);
      const tgt = new THREE.Vector3(cx, top * 0.35, cz);
      // frame: project bbox corners onto the view plane
      const zAxis = dir.clone(), xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize(), yAxis = zAxis.clone().cross(xAxis).normalize();
      if (cam === 'top') { xAxis.set(1, 0, 0); yAxis.set(0, 0, -1); }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zmax = -Infinity;
      for (const X of [bb.x0, bb.x1]) for (const Z of [bb.y0, bb.y1]) for (const Y of [-SLAB, top]) {
        const v = new THREE.Vector3(X, Y, Z).sub(tgt); x0 = Math.min(x0, v.dot(xAxis)); x1 = Math.max(x1, v.dot(xAxis)); y0 = Math.min(y0, v.dot(yAxis)); y1 = Math.max(y1, v.dot(yAxis)); zmax = Math.max(zmax, v.dot(zAxis));
      }
      const pad = 1.06, w = (x1 - x0) * pad, h = (y1 - y0) * pad;
      tgt.add(xAxis.clone().multiplyScalar((x0 + x1) / 2)).add(yAxis.clone().multiplyScalar((y0 + y1) / 2));
      const t = Math.tan(fov * Math.PI / 360), need = Math.max(h / 2 / t, w / 2 / (t * this.aspect));
      const dist = need + zmax;
      this.controls.target.copy(tgt);
      this.camera.position.copy(tgt).add(dir.multiplyScalar(dist));
      this.camera.up.set(0, 1, 0);
      this.camera.near = Math.max(0.1, dist - 60); this.camera.far = dist + 80;
    }
    this.camera.updateProjectionMatrix();
    this.controls.enableRotate = mode !== 'plan';
    this.controls.update();
  }

  // ── path tracing (three-gpu-pathtracer, loaded on demand) ──
  async startPT({ samples = 400, onProgress, onDone } = {}) {
    if (this.opts.mode !== 'style') return false;
    const mod = await import('three-gpu-pathtracer');
    if (!this.pt) {
      this.pt = new mod.WebGLPathTracer(this.renderer);
      this.pt.tiles.set(2, 2); this.pt.minSamples = 1; this.pt.renderDelay = 0; this.pt.fadeDuration = 0;
      this.pt.filterGlossyFactor = 0.5; this.pt.bounces = 6; this.pt.dynamicLowRes = false;
      this.sky = skyTexture(mod.GradientEquirectTexture, this.opts.light);
    }
    // the path tracer needs an equirect environment and no shadow-catcher / AO
    this.root.traverse(o => { if (o.userData.noPT) o.visible = false; });
    this.sky.topColor.set(this.opts.light === 'golden' ? '#ffd9a8' : '#e4eef8'); this.sky.update();
    this._envBackup = this.scene.environment; this.scene.environment = this.sky;
    this.scene.environmentIntensity = this.lightPreset.env * 1.6;
    this.hemi.visible = false;
    this.ptMax = samples; this.onPT = onProgress; this.onPTDone = onDone;
    // render at ~2000 px wide so the image is usable for print/social
    const css = this.canvas.parentElement.clientWidth || 1000;
    this._prBackup = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(Math.max(this._prBackup, Math.min(3, 2000 / css)));
    this.renderer.setSize(css, this.canvas.parentElement.clientHeight, false);
    await new Promise(r => setTimeout(r, 30));
    this.pt.setScene(this.scene, this.camera);
    this.ptOn = true;
    return true;
  }
  stopPT() {
    if (!this.pt || (!this.ptOn && !this._envBackup)) return;
    this.ptOn = false;
    if (this._envBackup) { this.scene.environment = this._envBackup; this._envBackup = null; this.scene.environmentIntensity = this.lightPreset ? this.lightPreset.env : 0.6; }
    if (this.hemi) this.hemi.visible = true;
    this.root.traverse(o => { if (o.userData.noPT) o.visible = true; });
    if (this._prBackup) { this.renderer.setPixelRatio(this._prBackup); this._prBackup = null; const el = this.canvas.parentElement; this.renderer.setSize(el.clientWidth, el.clientHeight, false); }
  }
  ptImage() { return this.renderer.domElement.toDataURL('image/png'); }

  // high-res still with the current camera
  snapshot(mode, width = 2400) {
    this.stopPT();
    const prev = this.opts.mode;
    const keep = { pos: this.camera.position.clone(), tgt: this.controls.target.clone(), fov: this.camera.fov, near: this.camera.near, far: this.camera.far };
    if (mode !== prev) { this.opts.mode = mode; this.build(this.layout, this.style); }
    if (mode !== 'plan') { this.camera.position.copy(keep.pos); this.controls.target.copy(keep.tgt); this.camera.fov = keep.fov; this.camera.near = keep.near; this.camera.far = keep.far; this.camera.lookAt(keep.tgt); this.camera.updateProjectionMatrix(); }
    const size = new THREE.Vector2(); this.renderer.getSize(size); const pr = this.renderer.getPixelRatio();
    const h = Math.round(width / this.aspect);
    this.renderer.setPixelRatio(1); this.renderer.setSize(width, h, false); this.composer.setPixelRatio(1); this.composer.setSize(width, h);
    if (mode === 'style' && this.opts.ao) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setPixelRatio(pr); this.renderer.setSize(size.x, size.y, false); this.composer.setPixelRatio(pr); this.composer.setSize(size.x, size.y);
    if (mode !== prev) {
      this.opts.mode = prev; this.build(this.layout, this.style);
      this.camera.position.copy(keep.pos); this.controls.target.copy(keep.tgt); this.camera.fov = keep.fov; this.camera.near = keep.near; this.camera.far = keep.far; this.camera.lookAt(keep.tgt); this.camera.updateProjectionMatrix();
    }
    this.render();
    return url;
  }
}

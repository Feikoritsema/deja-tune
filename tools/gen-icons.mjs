#!/usr/bin/env node
/**
 * Dependency-free PWA icon generator.
 * Draws the Déjà Tune mark (neon gradient tile + music note) with pixel math and
 * writes public/pwa-192.png, public/pwa-512.png and public/pwa-maskable-512.png.
 * Safe-zone (maskable) variant keeps the note inside the central 80% circle.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');

// ---------- minimal PNG encoder ----------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- pixel drawing ----------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Coverage alpha for a filled disc centered (cx,cy) radius r with ~1.6px AA. */
function discAlpha(x, y, cx, cy, r) {
  const d = Math.hypot(x - cx, y - cy);
  return clamp01(r + 1.6 - d); // soft edge
}
/** Coverage alpha for a horizontal rect [x0,x1]×[y0,y1]. */
function rectAlpha(x, y, x0, x1, y0, y1) {
  const ax = clamp01(Math.min(x1 - x, x - x0) + 1.0);
  const ay = clamp01(Math.min(y1 - y, y - y0) + 1.0);
  return Math.min(ax, ay);
}
/** Coverage alpha for an angular arc band around (cx,cy): angles a0..a1, radii r0..r1. */
function arcAlpha(x, y, cx, cy, r0, r1, a0, a1) {
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d < r0 || d > r1) return 0;
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang < a0) ang += 360;
  if (ang > a1) return 0;
  const radial = clamp01(Math.min(r1 - d, d - r0) + 1.6);
  return Math.min(radial, 1);
}

/** The music note: head disc, stem, single trailing flag (arc hook). */
function noteAlpha(x, y, s, cx, cy, scale) {
  const headR = 0.15 * s * scale;
  const headCx = cx - 0.26 * s * scale;
  const headCy = cy + 0.16 * s * scale;
  const stemX0 = cx - 0.05 * s * scale;
  const stemX1 = cx + 0.02 * s * scale;
  const stemY0 = cy - 0.52 * s * scale;
  const stemY1 = cy + 0.16 * s * scale;
  const topX = cx + 0.22 * s * scale; // flag pivot near stem top
  const topY = cy - 0.46 * s * scale;
  return Math.max(
    discAlpha(x, y, headCx, headCy, headR),
    rectAlpha(x, y, stemX0, stemX1, stemY0, stemY1),
    arcAlpha(x, y, topX, topY, 0.04 * s * scale, 0.13 * s * scale, -80, 78)
  );
}

function render(size, maskable) {
  const s = size;
  const rgba = new Uint8Array(s * s * 4);
  // background vertical gradient (deep purple → near-black), neon slash accent
  const cTop = [0x26, 0x10, 0x4e];
  const cBot = [0x0c, 0x07, 0x16];
  const neonA = [0xff, 0x5d, 0x8f]; // pink
  const neonB = [0x37, 0xe0, 0xc2]; // teal

  // safe zone for maskable: keep logo within central 80% circle
  const scale = maskable ? 0.52 : 0.62;
  const cx = s / 2;
  const cy = s / 2 + (maskable ? 0.012 * s : 0.02 * s);
  const safeR = maskable ? 0.4 * s : 0.5 * s;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const t = y / (s - 1);
      // base gradient
      let r = cTop[0] + (cBot[0] - cTop[0]) * t;
      let g = cTop[1] + (cBot[1] - cTop[1]) * t;
      let b = cTop[2] + (cBot[2] - cTop[2]) * t;
      // diagonal neon slash (soft)
      const diag = clamp01(1 - Math.abs((x + y) / (s * 2) - 0.62) * 9);
      r += (neonA[0] - r) * diag * 0.28;
      g += (neonB[1] - g) * diag * 0.24;
      b += (neonB[2] - b) * diag * 0.3;
      // note: white body, neon rim coloring inside the safe circle
      const na = noteAlpha(x, y, s, cx, cy, scale);
      const radial = Math.hypot(x - cx, y - cy) / safeR;
      const tint = clamp01(1 - radial); // pink near center, teal at rim? keep: pink-tinted white
      const bodyR = 255 - (255 - neonA[0]) * tint * 0.45;
      const bodyG = 255 - (255 - 0x9a) * tint * 0.5;
      const bodyB = 255 - (255 - neonB[2]) * tint * 0.55;
      // subtle drop glow under the note
      const glow = Math.exp(-Math.hypot(x - cx, y - cy + 0.06 * s) / (0.38 * s)) * 0.18;
      r = Math.min(255, r + glow * 255);
      g = Math.min(255, g + glow * 255);
      b = Math.min(255, b + glow * 255);
      // composite
      const a = clamp01(na);
      r = r * (1 - a) + bodyR * a;
      g = g * (1 - a) + bodyG * a;
      b = b * (1 - a) + bodyB * a;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(s, rgba);
}

mkdirSync(outDir, { recursive: true });
const jobs = [
  ['pwa-192.png', 192, false],
  ['pwa-512.png', 512, false],
  ['pwa-maskable-512.png', 512, true]
];
for (const [name, size, maskable] of jobs) {
  const png = render(size, maskable);
  writeFileSync(join(outDir, name), png);
  console.log(`wrote ${name} (${size}x${size}, ${(png.length / 1024).toFixed(1)} KiB)`);
}
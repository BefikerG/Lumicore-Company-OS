// Rasterises the Lumicore mark in public/favicon.svg to the PNG sizes iOS and
// Android need. Run with `node scripts/generate-icons.mjs` after editing the SVG.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const INK = [20, 23, 31];
const PAPER = [250, 250, 248];
const VIOLET = [108, 99, 255];

// Artwork is authored in a 64x64 space to match favicon.svg.
const UNIT = 64;
const STEM = { x: 18, y: 17, w: 7.5, h: 28, r: 2.5 };
const FOOT = { x: 18, y: 37.5, w: 16, h: 7.5, r: 2.5 };
const DOT = { cx: 42, cy: 41.25, r: 5.5 };

function inRoundRect(px, py, { x, y, w, h, r }) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function inCircle(px, py, { cx, cy, r }) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function render(size, samples = 4) {
  const scale = UNIT / size;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) * scale;
          const v = (y + (sy + 0.5) / samples) * scale;
          let c = INK;
          if (inRoundRect(u, v, STEM) || inRoundRect(u, v, FOOT)) c = PAPER;
          if (inCircle(u, v, DOT)) c = VIOLET;
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      }
      const n = samples * samples;
      const i = (y * size + x) * 4;
      px[i] = Math.round(acc[0] / n);
      px[i + 1] = Math.round(acc[1] / n);
      px[i + 2] = Math.round(acc[2] / n);
      px[i + 3] = 255;
    }
  }
  return px;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
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

function toPng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ['public/apple-touch-icon.png', 180],
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
]) {
  writeFileSync(name, toPng(size, render(size)));
  console.log(`wrote ${name} (${size}x${size})`);
}

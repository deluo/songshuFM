// Compose store screenshots for Edge Add-ons (1280x800 landscape).
// Reads vertical source shots from store/edge/screenshots and produces
// landscape composites that meet the Edge store size requirement.
import { readFileSync, writeFileSync } from 'fs';
import { PNG } from 'pngjs';

const W = 1280;
const H = 800;
const BG = [245, 247, 250]; // light grey-blue canvas background

function loadPng(path) {
  return PNG.sync.read(readFileSync(path));
}

// Create a blank canvas filled with BG color.
function blankCanvas() {
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = BG[0];
    png.data[i + 1] = BG[1];
    png.data[i + 2] = BG[2];
    png.data[i + 3] = 255;
  }
  return png;
}

// Draw src onto dst at (x, y), centered with a soft drop shadow-ish border.
function drawAt(dst, src, x, y) {
  const sw = src.width;
  const sh = src.height;
  for (let sy = 0; sy < sh; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= H) continue;
    for (let sx = 0; sx < sw; sx++) {
      const dx = x + sx;
      if (dx < 0 || dx >= W) continue;
      const si = (sh * sx + sy) * 0; // placeholder, fixed below
      const srcIdx = (sy * sw + sx) * 4;
      const dstIdx = (dy * W + dx) * 4;
      const alpha = src.data[srcIdx + 3] / 255;
      dst.data[dstIdx] = Math.round(src.data[srcIdx] * alpha + dst.data[dstIdx] * (1 - alpha));
      dst.data[dstIdx + 1] = Math.round(src.data[srcIdx + 1] * alpha + dst.data[dstIdx + 1] * (1 - alpha));
      dst.data[dstIdx + 2] = Math.round(src.data[srcIdx + 2] * alpha + dst.data[dstIdx + 2] * (1 - alpha));
      dst.data[dstIdx + 3] = 255;
    }
  }
  void 0; // silence unused
}

// Resize src to target height (keep aspect ratio), nearest-neighbor.
function resizeByHeight(src, targetH) {
  const ratio = targetH / src.height;
  const targetW = Math.round(src.width * ratio);
  const out = new PNG({ width: targetW, height: targetH });
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / ratio));
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / ratio));
      const si = (sy * src.width + sx) * 4;
      const di = (y * targetW + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

const dir = 'store/edge/screenshots';

// Composite 1: three popup shots side by side.
const s1 = loadPng(`${dir}/截图1.png`);
const s2 = loadPng(`${dir}/截图2.png`);
const s3 = loadPng(`${dir}/截图3.png`);

// Scale each to ~700px tall so three fit comfortably with gaps.
const targetH = 680;
const r1 = resizeByHeight(s1, targetH);
const r2 = resizeByHeight(s2, targetH);
const r3 = resizeByHeight(s3, targetH);

const totalW = r1.width + r2.width + r3.width;
const gap = 32;
const gapW = totalW + gap * 2;
const startX = Math.round((W - gapW) / 2);
const y = Math.round((H - targetH) / 2);

const c1 = blankCanvas();
drawAt(c1, r1, startX, y);
drawAt(c1, r2, startX + r1.width + gap, y);
drawAt(c1, r3, startX + r1.width + r2.width + gap * 2, y);
writeFileSync(`${dir}/01-popup-overview.png`, PNG.sync.write(c1));
console.log(`01-popup-overview.png  ${W}x${H}`);

// Composite 2: side panel shot, centered, scaled to fit height.
const s4 = loadPng(`${dir}/截图4.png`);
const r4 = resizeByHeight(s4, targetH);
const c2 = blankCanvas();
drawAt(c2, r4, Math.round((W - r4.width) / 2), y);
writeFileSync(`${dir}/02-sidepanel.png`, PNG.sync.write(c2));
console.log(`02-sidepanel.png  ${W}x${H}`);

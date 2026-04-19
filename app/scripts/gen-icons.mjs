#!/usr/bin/env node
// Rasterise build/mark.svg to the platform-specific icon assets electron-
// builder picks up:
//   build/icon.png   — Linux (1024×1024)
//   build/icon.ico   — Windows (16, 24, 32, 48, 64, 128, 256)
//   build/icon.icns  — macOS   (16, 32, 64, 128, 256, 512, 1024)
//
// Platform radii differ — see README.md:
//   macOS / iOS : squircle rx=56  (the OS applies its own mask on top; we
//                                   export at the designed rx and let iOS
//                                   re-mask as needed)
//   Windows 11  : rounded square rx=46
//   Linux       : any; we use the macOS radius for consistency
//   Favicon     : rx=24 (tighter)
//
// We generate a full-tile PNG per platform (with the radius baked into the
// SVG source by substitution) so the icon looks right without needing any
// post-rasterise masking.
//
// Run locally with `node scripts/gen-icons.mjs`. Outputs are committed to
// the repo so CI build runners don't need sharp installed.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import png2icons from 'png2icons';

const HERE   = path.dirname(fileURLToPath(import.meta.url));
const APP    = path.resolve(HERE, '..');
const BUILD  = path.join(APP, 'build');
const MARK   = path.join(BUILD, 'mark.svg');

async function svgWithRadius(rx) {
  const raw = await fs.readFile(MARK, 'utf8');
  // The first <rect> in mark-standalone.svg is the tile; substitute its rx.
  return raw.replace(/<rect([^>]*?)rx="\d+"/, `<rect$1rx="${rx}"`);
}

async function render(rx, size) {
  const svg = await svgWithRadius(rx);
  return sharp(Buffer.from(svg), { density: Math.max(300, size) })
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer();
}

async function main() {
  // Linux + electron-builder generic: 1024 squircle.
  const linuxPng = await render(56, 1024);
  await fs.writeFile(path.join(BUILD, 'icon.png'), linuxPng);
  console.log(`→ build/icon.png (1024 squircle rx=56)`);

  // Windows ICO: rounded-square rx=46 across sizes.
  const winSizes = [16, 24, 32, 48, 64, 128, 256];
  const winPngs  = await Promise.all(winSizes.map(s => render(46, s)));
  const ico      = await pngToIco(winPngs);
  await fs.writeFile(path.join(BUILD, 'icon.ico'), ico);
  console.log(`→ build/icon.ico (${winSizes.join(', ')} rx=46)`);

  // macOS ICNS: feed a 1024 squircle PNG; png2icons multiresamples.
  const macPng = await render(56, 1024);
  const icns = png2icons.createICNS(macPng, png2icons.BILINEAR, 0);
  if (!icns) throw new Error('png2icons failed to build ICNS');
  await fs.writeFile(path.join(BUILD, 'icon.icns'), icns);
  console.log(`→ build/icon.icns (multi-size squircle rx=56)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

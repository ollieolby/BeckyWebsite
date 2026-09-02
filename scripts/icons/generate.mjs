// Build the icon set from the two source SVGs.
//
//   node scripts/icons/generate.mjs
//
// The site shipped only favicon.svg, so /favicon.ico and /apple-touch-icon.png
// were 404s: some browsers still ask for the .ico by name, and iOS ignores SVG
// favicons completely when adding a site to the Home Screen.
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const round = readFileSync('public/favicon.svg');
const square = readFileSync('public/icon-square.svg');

const png = (source, size) => sharp(source, { density: 384 }).resize(size, size).png().toBuffer();

// ICO is a small header followed by whole PNGs, so it can be assembled here
// rather than pulling in a dependency for one file.
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map(image => image.data)]);
}

const icoImages = [];
for (const size of [16, 32, 48]) icoImages.push({ size, data: await png(round, size) });
writeFileSync('public/favicon.ico', ico(icoImages));

for (const [path, source, size] of [
  ['public/apple-touch-icon.png', square, 180],
  ['public/icon-192.png', square, 192],
  ['public/icon-512.png', square, 512],
]) writeFileSync(path, await png(source, size));

console.log('Wrote favicon.ico (16/32/48), apple-touch-icon.png, icon-192.png, icon-512.png');

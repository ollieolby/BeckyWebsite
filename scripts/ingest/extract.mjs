// Pulling text and figures out of the family's source documents.
//
// Word files are read straight from the OOXML rather than through a converter:
// the instruction manual's photographs have no captions, so a figure is only
// identifiable by the paragraph it sits after, and that anchoring is lost by
// every converter that flattens the document to plain text.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { XMLParser } from './minixml.mjs';


// Word stores the body as a flat run of paragraphs. Walking them in order gives
// both the text and the position of each image relative to it.
export function readDocxParagraphs(unzipDir) {
  const xml = readFileSync(join(unzipDir, 'word/document.xml'), 'utf8');
  const rels = new Map();
  const relXml = readFileSync(join(unzipDir, 'word/_rels/document.xml.rels'), 'utf8');
  for (const m of relXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rels.set(m[1], m[2]);

  const parser = new XMLParser();
  const paragraphs = [];
  for (const raw of xml.split(/<w:p[ >]/).slice(1)) {
    const block = '<w:p ' + raw.split('</w:p>')[0];
    const text = [...block.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map(m => parser.decode(m[1])).join('').trim();
    // A paragraph mark carrying <w:b/> is how this author marks headings; the
    // document uses no heading styles at all.
    const bold = /<w:pPr>[\s\S]*?<w:rPr>[\s\S]*?<w:b\s*\/>/.test(block);
    const images = [...block.matchAll(/<a:blip[^>]*r:embed="([^"]+)"/g)].map(m => m[1])
      .concat([...block.matchAll(/<v:imagedata[^>]*r:id="([^"]+)"/g)].map(m => m[1]));
    paragraphs.push({ text, bold, images: images.map(id => 'word/' + rels.get(id)).filter(Boolean) });
  }
  return paragraphs;
}

export function unzip(file, into) {
  mkdirSync(into, { recursive: true });
  execFileSync('unzip', ['-o', '-q', file, '-d', into]);
  return into;
}

// Legacy .doc has no usable open format; macOS ships a converter.
export function readDocText(file) {
  return execFileSync('textutil', ['-convert', 'txt', '-stdout', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function readPdfText(file) {
  try {
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
}

export function pdfPageCount(file) {
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  return Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
}

// Render one PDF page as the image for a figure. Used for the electrical
// drawings, which are scans with no text layer at all.
export function renderPdfPage(file, page, outPrefix) {
  execFileSync('pdftoppm', ['-r', '150', '-png', '-f', String(page), '-l', String(page), file, outPrefix]);
  const padded = [`${outPrefix}-${page}.png`, `${outPrefix}-0${page}.png`, `${outPrefix}-00${page}.png`];
  const found = padded.find(existsSync);
  if (!found) throw new Error(`pdftoppm produced no page ${page} for ${file}`);
  return found;
}

// The manual's photographs are up to 5 MB each straight off a phone. Nobody
// needs that in a chat bubble, and the bucket caps at 20 MB.
//
// Format matters as much as pixel count here: re-saving a photograph as PNG
// at 1600 px still leaves it around 4 MB, which made the extracted figures
// larger in total than the documents they came from. Photographs go to JPEG;
// line drawings stay PNG, where flat colour compresses better and JPEG would
// put ringing around every label.
export function shrink(file, out, { maxPx = 1600, format = 'jpeg', quality = 82 } = {}) {
  const args = ['-Z', String(maxPx)];
  if (format === 'jpeg') args.push('-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality));
  else args.push('-s', 'format', 'png');
  try {
    execFileSync('sips', [...args, file, '--out', out], { stdio: 'ignore' });
    return out;
  } catch {
    writeFileSync(out, readFileSync(file));
    return out;
  }
}

export function imageSize(file) {
  try {
    const info = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
    return {
      width: Number(/pixelWidth:\s*(\d+)/.exec(info)?.[1]) || null,
      height: Number(/pixelHeight:\s*(\d+)/.exec(info)?.[1]) || null,
    };
  } catch {
    return { width: null, height: null };
  }
}

// Rebuild a .docx with its photographs downscaled.
//
// The instruction manual is 58 MB, all of it full-resolution phone photos, and
// Supabase caps uploads per project. Re-saving the images as JPEG at the same
// size used for the figures brings it under the limit while keeping the file a
// real Word document: still readable, still editable, and the two unfinished
// sections can still be completed in Word.
//
// The images are PNG, so switching to JPEG means renaming the parts and
// patching the two places that name them: the document relationships and the
// content-type defaults.
export function slimDocx(sourceFile, workDir, maxPx = 1600) {
  const dir = join(workDir, 'slim');
  execFileSync('rm', ['-rf', dir]);
  unzip(sourceFile, dir);

  const mediaDir = join(dir, 'word/media');
  const renamed = new Map();
  for (const name of existsSync(mediaDir) ? readdirSync(mediaDir) : []) {
    if (!/\.(png|jpe?g)$/i.test(name)) continue;   // leave EMF and friends alone
    const from = join(mediaDir, name);
    const to = join(mediaDir, name.replace(/\.[^.]+$/, '.jpeg'));
    shrink(from, to, { maxPx, format: 'jpeg' });
    if (to !== from) {
      execFileSync('rm', ['-f', from]);
      renamed.set(name, name.replace(/\.[^.]+$/, '.jpeg'));
    }
  }

  const relsPath = join(dir, 'word/_rels/document.xml.rels');
  let rels = readFileSync(relsPath, 'utf8');
  for (const [from, to] of renamed) rels = rels.split(`media/${from}`).join(`media/${to}`);
  writeFileSync(relsPath, rels);

  const typesPath = join(dir, '[Content_Types].xml');
  let types = readFileSync(typesPath, 'utf8');
  if (!/Extension="jpeg"/.test(types)) {
    types = types.replace('<Types ', '<Types ').replace(
      /(<Types[^>]*>)/,
      '$1<Default Extension="jpeg" ContentType="image/jpeg"/>',
    );
    writeFileSync(typesPath, types);
  }

  const out = join(workDir, 'slimmed.docx');
  execFileSync('rm', ['-f', out]);
  // -X drops the extra file attributes; the archive order does not matter for
  // OOXML the way it does for ODF/epub.
  execFileSync('zip', ['-r', '-q', '-X', out, '.'], { cwd: dir });
  return out;
}

// Ingest the family's source documents into Supabase and the OpenAI vector
// store, with each document's figures extracted, labelled and uploaded.
//
//   node scripts/ingest/run.mjs --dry-run     build and report, touch nothing
//   node scripts/ingest/run.mjs               do it
//   node scripts/ingest/run.mjs --only becky-manual
//
// Re-running is safe: a document is matched by its storage path, its figures
// are replaced wholesale, and its previous OpenAI file is removed from the
// vector store before the new one is attached.
import { createClient } from '@supabase/supabase-js';
import OpenAI, { toFile } from 'openai';
import { readFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { loadManifest, buildDocument } from './build.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
// Storage and the database need only the Supabase service key. Indexing needs
// OpenAI, which may not be to hand — so it is skippable, and the documents are
// left index_status 'pending' for a later run to pick up.
const skipIndex = args.includes('--skip-index');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

function loadEnv() {
  // The script runs outside Next, so .env.local is not loaded for us.
  for (const file of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { /* not present */ }
  }
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

loadEnv();
const manifest = loadManifest();
const sourceDir = manifest.source_dir.replace(/^~/, homedir());
const workDir = mkdtempSync(join(tmpdir(), 'becky-ingest-'));

const chosen = manifest.documents.filter(d => !only || d.key === only);
if (!chosen.length) fail(`No document with key "${only}".`);

console.log(`Reading from ${sourceDir}`);
const built = [];
for (const doc of chosen) {
  try {
    statSync(join(sourceDir, doc.file));
  } catch {
    fail(`Missing source file: ${join(sourceDir, doc.file)}`);
  }
  const result = buildDocument(doc, sourceDir, workDir);
  built.push(result);
  const withheld = result.figures.filter(f => !f.is_published).length;
  console.log(
    `\n${doc.key}  ${doc.file}` +
    `\n  markdown  ${result.markdown.length.toLocaleString()} chars` +
    `\n  source    ${result.imagesSeen} ${doc.kind === 'pdf' ? 'page(s)' : 'image(s)'}` +
    `\n  figures   ${result.figures.length} uploaded` +
    (withheld ? ` (${withheld} withheld from retrieval)` : '')
  );
  for (const warning of result.warnings) console.log(`  ! ${warning}`);
}

if (dryRun) {
  console.log(`\nDry run. Renditions written under ${workDir}/out`);
  for (const doc of built) {
    console.log(`\n--- ${doc.key} rendition, first 700 chars ---\n${doc.markdown.slice(0, 700)}`);
  }
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) fail('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-only key) before ingesting.');
// The Vercel project stores this as OPEN_AI_VECTOR_STORE_ID; lib/env.ts
// accepts both spellings, so this must too.
const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID || process.env.OPEN_AI_VECTOR_STORE_ID;
const canIndex = !skipIndex && Boolean(process.env.OPENAI_API_KEY && vectorStoreId);
if (!canIndex) {
  console.log(skipIndex
    ? '\n--skip-index: uploading to Supabase only. Ask Becky will not find these until they are indexed.'
    : '\nNo OPENAI_API_KEY / OPENAI_VECTOR_STORE_ID: uploading to Supabase only.'
    + '\nAsk Becky cannot search these documents until you set both and re-run.');
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const openai = canIndex ? new OpenAI() : null;

// documents.uploaded_by is required and must be a real profile.
const owner = process.env.INGEST_USER_EMAIL;
const { data: profile, error: profileError } = owner
  ? await supabase.from('profiles').select('id,email').eq('email', owner).maybeSingle()
  : await supabase.from('profiles').select('id,email').eq('role', 'admin').order('created_at').limit(1).maybeSingle();
if (profileError) fail(`Could not read profiles: ${profileError.message}`);
if (!profile) fail(owner ? `No profile for ${owner}.` : 'No admin profile found. Sign in once, promote yourself to admin, or set INGEST_USER_EMAIL.');
console.log(`\nIngesting as ${profile.email}`);

const { data: assets, error: assetError } = await supabase.from('assets').select('id,slug');
if (assetError) fail(`Could not read assets: ${assetError.message}`);
const assetId = slug => assets.find(a => a.slug === slug)?.id ?? null;

const failures = [];
for (const doc of built) {
  console.log(`\n→ ${doc.key}`);
  try {
    await ingestDocument(doc);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ ${message}`);
    failures.push({ key: doc.key, message });
  }
}

async function ingestDocument(doc) {
  const storagePath = `library/${doc.key}${doc.file.slice(doc.file.lastIndexOf('.'))}`;
  const bytes = readFileSync(doc.uploadFile ?? doc.sourceFile);

  const { error: uploadError } = await supabase.storage.from('manuals')
    .upload(storagePath, bytes, { contentType: doc.mime_type, upsert: true });
  if (uploadError) throw new Error(`storage upload: ${uploadError.message}`);
  const slimmed = doc.uploadFile && doc.uploadFile !== doc.sourceFile;
  console.log(`  stored   ${storagePath} (${(bytes.length / 1e6).toFixed(1)} MB${slimmed ? ', photos downscaled' : ''})`);

  // Store the Markdown rendition next to the original so indexing can happen
  // from the deployed site, with the OpenAI keys that live in Vercel, instead
  // of needing them on someone's laptop. /api/documents/[id]/index looks for
  // this exact path and prefers it over the original file.
  const renditionPath = `library/renditions/${doc.key}.md`;
  const { error: renditionError } = await supabase.storage.from('manuals')
    .upload(renditionPath, Buffer.from(doc.markdown, 'utf8'), { contentType: 'text/markdown', upsert: true });
  if (renditionError) throw new Error(`storing rendition: ${renditionError.message}`);
  console.log(`  rendition ${renditionPath} (${(doc.markdown.length / 1024).toFixed(0)} KB)`);

  const row = {
    title: doc.title,
    notes: doc.notes,
    summary: doc.summary ?? '',
    doc_kind: doc.doc_kind ?? 'manual',
    asset_id: assetId(doc.asset),
    storage_path: storagePath,
    mime_type: doc.mime_type,
    size_bytes: bytes.length,
    is_published: Boolean(doc.is_published),
    uploaded_by: profile.id,
    index_status: 'pending',
  };
  const { data: saved, error: saveError } = await supabase.from('documents')
    .upsert(row, { onConflict: 'storage_path' }).select('id,openai_file_id').single();
  if (saveError) throw new Error(`saving document row: ${saveError.message}`);

  // Figures: replace the whole set so a corrected manifest fully takes effect.
  const { error: clearError } = await supabase.from('document_figures').delete().eq('document_id', saved.id);
  if (clearError) throw new Error(`clearing figures: ${clearError.message}`);

  for (const figure of doc.figures) {
    const { error: figureUploadError } = await supabase.storage.from('figures')
      .upload(figure.storagePath, readFileSync(figure.localPath), { contentType: figure.mime_type, upsert: true });
    if (figureUploadError) throw new Error(`uploading figure ${figure.slug}: ${figureUploadError.message}`);
  }
  if (doc.figures.length) {
    const { error: figureRowError } = await supabase.from('document_figures').insert(
      doc.figures.map(figure => ({
        document_id: saved.id,
        asset_id: assetId(doc.asset),
        figure_no: figure.figure_no,
        slug: figure.slug,
        label: figure.label,
        caption: figure.caption,
        section: figure.section,
        keywords: figure.keywords,
        storage_path: figure.storagePath,
        mime_type: figure.mime_type,
        width: figure.width,
        height: figure.height,
        is_published: figure.is_published,
        priority: figure.priority,
        notes: figure.notes,
      }))
    );
    if (figureRowError) throw new Error(`saving figure rows: ${figureRowError.message}`);
    console.log(`  figures  ${doc.figures.length} uploaded`);
  }

  if (!canIndex) {
    console.log('  index    skipped (left pending)');
    return;
  }

  // Index the Markdown rendition, not the original: the original may be a
  // 58 MB pile of photographs, or a scan with no text at all, and neither
  // carries the figure labels the model needs to cite.
  if (saved.openai_file_id) {
    await openai.vectorStores.files.delete(saved.openai_file_id, { vector_store_id: vectorStoreId }).catch(() => {});
    await openai.files.delete(saved.openai_file_id).catch(() => {});
  }
  const uploaded = await openai.files.create({
    file: await toFile(Buffer.from(doc.markdown, 'utf8'), `${doc.key}.md`, { type: 'text/markdown' }),
    purpose: 'assistants',
  });
  await openai.vectorStores.files.create(vectorStoreId, {
    file_id: uploaded.id,
    attributes: { asset_id: doc.asset, title: doc.title, document_key: doc.key },
  });
  const { error: markError } = await supabase.from('documents')
    .update({ openai_file_id: uploaded.id, index_status: 'indexed' }).eq('id', saved.id);
  if (markError) throw new Error(`marking indexed: ${markError.message}`);
  console.log(`  indexed  ${uploaded.id}`);
}

const succeeded = built.filter(doc => !failures.some(failure => failure.key === doc.key));
console.log(`\n✓ Ingested ${succeeded.length}/${built.length} document(s), ${succeeded.reduce((n, d) => n + d.figures.length, 0)} figure(s).`);
if (!canIndex) {
  console.log('  Not indexed. Set OPENAI_API_KEY and OPENAI_VECTOR_STORE_ID, then re-run to make them searchable.');
}
if (failures.length) {
  console.log(`\n✗ ${failures.length} document(s) failed:`);
  for (const failure of failures) console.log(`  ${failure.key}: ${failure.message}`);
  process.exit(1);
}

// One rule for where a document's Markdown rendition lives.
//
// It has to be derived from something every document has, however it arrived:
// documents uploaded through the site are stored under the uploader's user id
// with a generated filename, while scripts/ingest writes to library/<key>.
// The row id is the only thing common to both, and it cannot collide.
export function renditionPathFor(documentId: string) {
  return `library/renditions/${documentId}.md`;
}

// The first six documents were ingested before that rule existed and are named
// after their manifest key. Checked as a fallback so they keep working without
// having to be re-uploaded.
export function legacyRenditionPathFor(storagePath: string) {
  const match = /^library\/([^/]+)\.[^./]+$/.exec(storagePath);
  return match ? `library/renditions/${match[1]}.md` : null;
}

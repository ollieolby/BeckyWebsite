'use client';

import { useMemo, useState } from 'react';

export type LibraryDoc = {
  id: string; title: string; summary: string; notes: string;
  mime_type: string; size_bytes: number; created_at: string;
  doc_kind: string; figures: number; general: boolean;
};

const KIND_LABELS: Record<string, string> = {
  manual: 'Manuals', specification: 'Specifications', certificate: 'Certificates',
  drawing: 'Drawings', reference: 'Reference', notes: 'Notes',
};
const KIND_ORDER = ['manual', 'drawing', 'certificate', 'specification', 'notes', 'reference'];

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function fileKind(mime: string) {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'Word';
  return 'Text';
}

// The library, grouped and searchable. It was a grid of cards whose heights
// were set by however much prose each document happened to carry; a list keyed
// on one summary line stays even however much is written about a document.
export default function Library({ documents, assetName }: { documents: LibraryDoc[]; assetName: string }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');

  const search = query.trim().toLowerCase();
  const kinds = useMemo(() => {
    const present = new Set(documents.map(doc => doc.doc_kind));
    return KIND_ORDER.filter(key => present.has(key));
  }, [documents]);

  const matches = useMemo(() => documents.filter(doc => {
    if (kind !== 'all' && doc.doc_kind !== kind) return false;
    if (!search) return true;
    return `${doc.title} ${doc.summary} ${doc.notes}`.toLowerCase().includes(search);
  }), [documents, kind, search]);

  const grouped = useMemo(() => {
    const byKind = new Map<string, LibraryDoc[]>();
    for (const doc of matches) {
      const list = byKind.get(doc.doc_kind) ?? [];
      list.push(doc);
      byKind.set(doc.doc_kind, list);
    }
    return KIND_ORDER.filter(key => byKind.has(key)).map(key => [key, byKind.get(key)!] as const);
  }, [matches]);

  return (
    <div className="library">
      <div className="library-controls">
        <input
          type="search" className="library-search" value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={`Search ${assetName}'s documents…`} aria-label={`Search ${assetName}'s documents`}
        />
        <div className="library-filters" role="group" aria-label="Filter by kind">
          <button type="button" className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>
            All <span>{documents.length}</span>
          </button>
          {kinds.map(key => (
            <button type="button" key={key} className={kind === key ? 'on' : ''} onClick={() => setKind(key)}>
              {KIND_LABELS[key]} <span>{documents.filter(doc => doc.doc_kind === key).length}</span>
            </button>
          ))}
        </div>
      </div>

      {!matches.length && (
        <p className="asset-empty">
          {documents.length ? `Nothing matches “${query}”.` : 'Nothing here yet.'}
        </p>
      )}

      {grouped.map(([key, items]) => (
        <section className="library-group" key={key}>
          <h3>{KIND_LABELS[key]}</h3>
          <ul>
            {items.map(doc => (
              <li key={doc.id}>
                <div className="library-doc">
                  <strong>{doc.title}{doc.general && <em> · shared</em>}</strong>
                  {doc.summary && <p>{doc.summary}</p>}
                  <small>
                    {fileKind(doc.mime_type)} · {fileSize(doc.size_bytes)}
                    {doc.figures > 0 && ` · ${doc.figures} figure${doc.figures === 1 ? '' : 's'}`}
                  </small>
                </div>
                <div className="library-actions">
                  <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer">Open ↗</a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

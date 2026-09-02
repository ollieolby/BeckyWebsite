'use client';

import { useEffect, useState } from 'react';

type Figure = {
  id: string; slug: string; figure_no: number; label: string; caption: string;
  keywords: string[]; section: string; uncertain: string; caption_source: string;
  document_title: string; image_url: string | null;
};

// Nothing the site captioned itself is ever sent to a reader until it has been
// through here. The image is shown at a usable size on purpose: the whole
// point is checking that the words match the picture.
export default function FigureReview() {
  const [figures, setFigures] = useState<Figure[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/figures')
      .then(response => response.json())
      .then(result => { if (!cancelled) setFigures(result.figures ?? []); })
      .catch(() => { if (!cancelled) setFigures([]); });
    return () => { cancelled = true; };
  }, []);

  async function save(figure: Figure, form: HTMLFormElement, publish: boolean) {
    setBusy(figure.id);
    const values = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch(`/api/figures/${figure.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, is_published: publish }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not save it.');
      if (publish) {
        setFigures(current => (current ?? []).filter(item => item.id !== figure.id));
        setMessage(`Approved "${values.label}". Ask Becky can send it now.`);
      } else {
        setMessage('Saved. Still held back until approved.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save it.');
    }
    setBusy(null);
  }

  async function discard(figure: Figure) {
    setBusy(figure.id);
    const response = await fetch(`/api/figures/${figure.id}`, { method: 'DELETE' });
    if (response.ok) {
      setFigures(current => (current ?? []).filter(item => item.id !== figure.id));
      setMessage('Figure removed.');
    } else setMessage('Could not remove it.');
    setBusy(null);
  }

  if (figures === null) return <div className="notice">Checking for figures to review…</div>;
  if (!figures.length) return null;

  return (
    <section className="content-manager figure-review">
      <div className="manager-heading">
        <div><p className="kicker">Needs a look</p><h2>{figures.length} figure(s) to check</h2></div>
        <p>
          These were described automatically from the picture. They are <strong>not</strong> shown to anyone until
          you approve them — a figure sent with a confident but wrong caption is worse than no figure at all.
        </p>
      </div>

      <div className="review-list">
        {figures.map(figure => (
          <article className="review-item" key={figure.id}>
            {figure.image_url
              /* A short-lived signed URL from private storage: next/image cannot
                 optimise it without a remote pattern, and the URL changes each
                 time the queue is loaded. */
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={figure.image_url} alt={figure.label} loading="lazy" />
              : <div className="review-noimage">Image unavailable</div>}
            <form onSubmit={event => { event.preventDefault(); save(figure, event.currentTarget, true); }}>
              <p className="review-origin">
                {figure.document_title}{figure.section ? ` · ${figure.section}` : ''} · figure {figure.figure_no}
                {figure.caption_source === 'pending' && <em> · not yet described</em>}
              </p>
              {figure.uncertain && <p className="review-uncertain"><strong>Unsure:</strong> {figure.uncertain}</p>}
              <label>Label<input name="label" required defaultValue={figure.label} /></label>
              <label>Caption<textarea name="caption" rows={4} defaultValue={figure.caption} /></label>
              <label>Search words<input name="keywords" defaultValue={figure.keywords.join(', ')} placeholder="comma separated" /></label>
              <div className="button-row">
                <button type="submit" disabled={busy === figure.id}>{busy === figure.id ? 'Saving…' : 'Approve'}</button>
                <button type="button" disabled={busy === figure.id}
                  onClick={event => save(figure, event.currentTarget.closest('form')!, false)}>Save, keep hidden</button>
                <button type="button" className="danger" disabled={busy === figure.id}
                  onClick={() => discard(figure)}>Not a figure</button>
              </div>
            </form>
          </article>
        ))}
      </div>
      <p className="save-status" role="status">{message}</p>
    </section>
  );
}

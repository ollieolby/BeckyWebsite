'use client';

import { useState } from 'react';

type Invite = {
  id: string; token: string; label: string; role: string;
  max_uses: number; uses: number; expires_at: string | null;
  revoked: boolean; created_at: string; last_used_at: string | null;
};

// Minting and withdrawing invite links. Accounts cannot be created any other
// way: open sign-up is off in Supabase Auth, and /api/join is the only route
// that can make one.
export default function InvitesPanel({ invites, origin }: { invites: Invite[]; origin: string }) {
  const [rows, setRows] = useState(invites);
  const [label, setLabel] = useState('');
  const [role, setRole] = useState('viewer');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresDays, setExpiresDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState('');

  const linkFor = (token: string) => `${origin}/join/${token}`;

  function statusOf(invite: Invite) {
    if (invite.revoked) return 'withdrawn';
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) return 'expired';
    if (invite.uses >= invite.max_uses) return 'used up';
    return 'active';
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label, role, max_uses: maxUses, expires_days: expiresDays }),
    });
    const result = await response.json();
    if (!response.ok) setMessage(result.error ?? 'Could not create the invite.');
    else {
      setRows([{ ...result, revoked: false, last_used_at: null }, ...rows]);
      setLabel('');
      setMessage('Link created. Copy it and send it to them.');
    }
    setBusy(false);
  }

  async function withdraw(id: string) {
    const response = await fetch(`/api/invites/${id}`, { method: 'PATCH' });
    if (response.ok) setRows(rows.map(row => row.id === id ? { ...row, revoked: true } : row));
    else setMessage('Could not withdraw that invite.');
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(token);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      setMessage('Could not copy — select the link and copy it by hand.');
    }
  }

  return (
    <div className="invites-panel">
      <h2>Invite links</h2>
      <p className="invites-intro">
        Anyone with a live link can create an account and read everything: the manuals, the notes, the
        photographs and the Spade Oak details. There is no other way in, so treat a link like a key.
      </p>

      <form onSubmit={create} className="invite-form">
        <label>Who is it for
          <input value={label} onChange={event => setLabel(event.target.value)} placeholder="Richard and Abigail" required />
        </label>
        <label>Access
          <select value={role} onChange={event => setRole(event.target.value)}>
            <option value="viewer">Viewer — read everything</option>
            <option value="editor">Editor — can also add and change</option>
          </select>
        </label>
        <label>Uses
          <input type="number" min={1} max={50} value={maxUses} onChange={event => setMaxUses(Number(event.target.value))} />
        </label>
        <label>Expires in (days, 0 = never)
          <input type="number" min={0} max={365} value={expiresDays} onChange={event => setExpiresDays(Number(event.target.value))} />
        </label>
        <button type="submit" disabled={busy || !label.trim()}>Create link</button>
      </form>

      {message && <p className="invite-message" role="status">{message}</p>}

      {rows.length === 0
        ? <p className="invite-empty">No invite links yet.</p>
        : <ul className="invite-list">
            {rows.map(invite => {
              const status = statusOf(invite);
              return (
                <li key={invite.id} className={status === 'active' ? '' : 'spent'}>
                  <div className="invite-head">
                    <strong>{invite.label || 'Unnamed'}</strong>
                    <span className={`invite-status is-${status.replace(' ', '-')}`}>{status}</span>
                    <small>{invite.role} · {invite.uses}/{invite.max_uses} used
                      {invite.expires_at ? ` · expires ${new Date(invite.expires_at).toLocaleDateString('en-GB')}` : ' · no expiry'}</small>
                  </div>
                  {status === 'active' && (
                    <div className="invite-actions">
                      <code>{linkFor(invite.token)}</code>
                      <button type="button" onClick={() => copy(invite.token)}>{copied === invite.token ? 'Copied' : 'Copy'}</button>
                      <button type="button" className="danger" onClick={() => withdraw(invite.id)}>Withdraw</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>}
    </div>
  );
}

'use client';
import { FormEvent,useState } from 'react';
type Asset={id:string;name:string}; type Note={id:string;title:string;body:string;asset_id:string|null;source:string};
export default function NotesPanel({assets,notes,canEdit}:{assets:Asset[];notes:Note[];canEdit:boolean}){
  const [status,setStatus]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>,url:string,method:'POST'|'PATCH'){
    event.preventDefault();setBusy(true);setStatus('Saving note…');const values=Object.fromEntries(new FormData(event.currentTarget));
    try{const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to save the note.');setStatus('Note saved to group memory. Refreshing…');setTimeout(()=>window.location.reload(),700)}catch(error){setStatus(error instanceof Error?error.message:'Unable to save the note.');setBusy(false)}
  }
  return <section className="content-manager notes-panel"><div className="manager-heading"><div><p className="kicker">Shared memory</p><h2>Family notes</h2></div><p>Short facts, decisions and useful knowledge that Ask Becky can retrieve immediately.</p></div>
    {canEdit&&<article className="admin-panel"><h3>Add a note</h3><form onSubmit={event=>submit(event,'/api/notes','POST')}><label>Title<input name="title" required placeholder="Winter water shut-off"/></label><label>For<select name="asset_id"><option value="">General</option>{assets.map(asset=><option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label><label>Note<textarea name="body" required rows={6} placeholder="Write down the useful detail, decision or conclusion…"/></label><button disabled={busy}>{busy?'Saving…':'Add to group memory'}</button></form></article>}
    <div className="manager-list">{notes.map(note=><details key={note.id}><summary><span>Note</span><strong>{note.title}</strong><small>{note.source==='chat'?'From chat':'Added manually'}</small><b>⌄</b></summary>{canEdit?<form onSubmit={event=>submit(event,`/api/notes/${note.id}`,'PATCH')}><label>Title<input name="title" required defaultValue={note.title}/></label><label>For<select name="asset_id" defaultValue={note.asset_id||''}><option value="">General</option>{assets.map(asset=><option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label><label>Note<textarea name="body" required rows={7} defaultValue={note.body}/></label><button disabled={busy}>Save changes</button></form>:<div className="note-body">{note.body}</div>}</details>)}{!notes.length&&<div className="notice">No family notes yet.</div>}</div><p className="save-status" role="status">{status}</p>
  </section>;
}

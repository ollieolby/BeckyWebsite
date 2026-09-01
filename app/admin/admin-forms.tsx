'use client';
import { FormEvent, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Asset={id:string;name:string;slug:string};
type Lookup={name?:string;latitude?:number;longitude?:number;url?:string};

// Browsers leave File.type empty for .md (and sometimes .txt), but the bucket
// only accepts these three types, so infer from the extension as a fallback.
const MANUAL_TYPES:Record<string,string>={pdf:'application/pdf',txt:'text/plain',md:'text/markdown'};

async function readJson(response:Response):Promise<Record<string,unknown>>{
  try{return await response.json()}catch{return{}}
}
function errorText(result:Record<string,unknown>,fallback:string){
  return typeof result.error==='string'&&result.error?result.error:fallback;
}

export default function AdminForms({assets,canEdit}:{assets:Asset[];canEdit:boolean}){
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [lookup,setLookup]=useState<Lookup>({});
  const [mapUrl,setMapUrl]=useState('');
  const [looking,setLooking]=useState(false);

  // Files go straight from the browser to Supabase Storage: routing them
  // through an API route hits Vercel's ~4.5 MB request body limit.
  async function uploadToBucket(bucket:string,file:File,fallbackType:string){
    const supabase=createSupabaseBrowserClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)throw new Error('Your session has expired. Sign in again, then retry.');
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'-');
    const path=`${user.id}/${crypto.randomUUID()}-${safeName}`;
    const {error}=await supabase.storage.from(bucket).upload(path,file,{contentType:file.type||fallbackType,upsert:false});
    if(error)throw new Error(`The file upload failed: ${error.message}`);
    return path;
  }
  function removeUpload(bucket:string,path:string){
    createSupabaseBrowserClient().storage.from(bucket).remove([path]).catch(()=>{});
  }

  async function submitManual(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const file=fields.get('file');
    if(!(file instanceof File)||!file.size)return setStatus('Choose a file to upload.');
    if(file.size>50*1024*1024)return setStatus('Files must be 50 MB or smaller.');
    const fallbackType=MANUAL_TYPES[file.name.split('.').pop()?.toLowerCase()??''];
    if(!fallbackType)return setStatus('Use a PDF, .txt, or .md file.');
    setBusy(true);
    let path='';
    try{
      setStatus('Uploading the file…');
      path=await uploadToBucket('manuals',file,fallbackType);
      setStatus('Saving the manual…');
      const response=await fetch('/api/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        title:fields.get('title'),notes:fields.get('notes'),asset_id:fields.get('asset_id')||null,
        storage_path:path,size_bytes:file.size,is_published:fields.get('is_published')==='on',
      })});
      const result=await readJson(response);
      if(!response.ok)throw new Error(errorText(result,'Unable to save the manual.'));
      setStatus('Sending the manual to Ask Becky…');
      const indexResponse=await fetch(`/api/documents/${result.id}/index`,{method:'POST'});
      if(indexResponse.ok)setStatus('Manual saved and sent to Ask Becky. Refreshing…');
      else setStatus(`Manual saved, but indexing did not start: ${errorText(await readJson(indexResponse),'unknown error')}. Retry it under “Manage existing content”. Refreshing…`);
      setTimeout(()=>window.location.reload(),1500);
    }catch(error){
      if(path)removeUpload('manuals',path);
      setStatus(error instanceof Error?error.message:'Upload failed. Check your connection and try again.');
      setBusy(false);
    }
  }

  async function submitPlace(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const image=fields.get('image');
    fields.delete('image');
    setBusy(true);
    let imagePath='';
    try{
      if(image instanceof File&&image.size){
        if(image.size>10*1024*1024)throw new Error('Place photos must be 10 MB or smaller.');
        setStatus('Uploading the photograph…');
        imagePath=await uploadToBucket('place-images',image,'image/jpeg');
        fields.set('image_path',imagePath);
      }
      setStatus('Saving the place…');
      const response=await fetch('/api/places',{method:'POST',body:fields});
      const result=await readJson(response);
      if(!response.ok)throw new Error(errorText(result,'Unable to save the place.'));
      setStatus('Place saved.');
    }catch(error){
      if(imagePath)removeUpload('place-images',imagePath);
      setStatus(error instanceof Error?error.message:'Unable to save the place. Check your connection and try again.');
    }finally{
      setBusy(false);
    }
  }

  async function submitProblem(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=event.currentTarget;
    const fields=new FormData(form);
    setBusy(true);
    try{
      setStatus('Logging the problem…');
      const response=await fetch('/api/troubleshooting',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        title:fields.get('title'),problem:fields.get('problem'),solution:fields.get('solution'),asset_id:fields.get('asset_id')||null,
      })});
      const result=await readJson(response);
      if(!response.ok)throw new Error(errorText(result,'Unable to log the problem.'));
      setStatus('Problem logged. Refreshing…');
      setTimeout(()=>window.location.reload(),900);
    }catch(error){
      setStatus(error instanceof Error?error.message:'Unable to log the problem. Check your connection and try again.');
      setBusy(false);
    }
  }

  async function resolveMap(){
    if(!mapUrl)return;
    setLooking(true);
    setStatus('Reading the Google Maps link…');
    try{
      const response=await fetch('/api/places/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:mapUrl})});
      const result=await readJson(response);
      setLookup(result as Lookup);
      setStatus(response.ok?'Place found. Check the details, then save it.':errorText(result,'Unable to read that link.'));
    }catch{
      setStatus('Unable to read that link. Check your connection and try again.');
    }finally{
      setLooking(false);
    }
  }

  if(!canEdit)return <div className="notice"><strong>You have view-only access.</strong><p>An administrator must promote your profile to editor before you can add content.</p></div>;
  return <><div className="admin-tabs">
    <article className="admin-panel"><h2>Upload a manual</h2><p>PDF, text, or Markdown; up to 50 MB.</p><form onSubmit={submitManual}>
      <label>Title<input name="title" required placeholder="Webasto heating manual"/></label>
      <label>For<select name="asset_id"><option value="">General</option>{assets.map(asset=><option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label>
      <label>Notes<textarea name="notes" rows={4} placeholder="What this covers, model number, useful pages, or anything the family should know"/></label>
      <label>Document<input name="file" type="file" accept=".pdf,.txt,.md" required/></label>
      <label><input name="is_published" type="checkbox" defaultChecked/> Publish for visitors</label><button disabled={busy}>{busy?'Working…':'Upload manual'}</button>
    </form></article>
    <article className="admin-panel"><h2>Save a place</h2><p>Paste a Google Maps sharing link. No paid Google API is used.</p>
      <label>Google Maps link<input type="url" value={mapUrl} onChange={event=>setMapUrl(event.target.value)} placeholder="https://maps.app.goo.gl/…"/></label><button type="button" onClick={resolveMap} disabled={!mapUrl||looking}>{looking?'Finding place…':'Find place'}</button>
      <form onSubmit={submitPlace}><input type="hidden" name="google_maps_url" value={lookup.url||mapUrl}/>
        <label>Name<input name="name" required key={lookup.name} defaultValue={lookup.name||''} placeholder="The Riverside Arms"/></label><label>Category<select name="category"><option value="mooring">Mooring</option><option value="pub">Pub</option><option value="cafe">Café</option><option value="shop">Shop</option><option value="fuel">Fuel</option><option value="other">Other</option></select></label>
        <div className="form-row"><label>Latitude<input name="latitude" type="number" step="any" required key={`lat-${lookup.latitude}`} defaultValue={lookup.latitude}/></label><label>Longitude<input name="longitude" type="number" step="any" required key={`lng-${lookup.longitude}`} defaultValue={lookup.longitude}/></label></div>
        <label>Our photograph (optional)<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/heic"/></label><label>Notes<textarea name="notes" rows={4}/></label><button disabled={busy}>{busy?'Working…':'Save place'}</button>
      </form>
    </article>
    <article className="admin-panel"><h2>Log a problem</h2><p>Something not working, or a fault you have just fixed? Write it down so nobody has to solve it twice. It also appears on the boat&rsquo;s page and Ask Becky checks it when diagnosing.</p><form onSubmit={submitProblem}>
      <label>What&rsquo;s the problem?<input name="title" required placeholder="Webasto heater cutting out"/></label>
      <label>For<select name="asset_id"><option value="">General</option>{assets.map(asset=><option value={asset.id} key={asset.id}>{asset.name}</option>)}</select></label>
      <label>What happened<textarea name="problem" required rows={4} placeholder="Symptoms, when it started, anything already tried"/></label>
      <label>The fix (leave blank if still open)<textarea name="solution" rows={3} placeholder="What solved it, so the next person can repeat it"/></label>
      <button disabled={busy}>{busy?'Working…':'Log problem'}</button>
    </form></article>
  </div><p className="save-status" role="status" aria-live="polite">{status}</p></>;
}

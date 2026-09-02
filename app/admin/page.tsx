import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AdminForms from './admin-forms';
import ContentManager from './content-manager';
import RagStatus from './rag-status';
import NotesPanel from './notes-panel';
import InvitesPanel from './invites-panel';
import FigureReview from './figure-review';

export const dynamic='force-dynamic';
export default async function AdminPage(){
  const supabase=await createSupabaseServerClient();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
  const[{data:profile},{data:assets},{data:places},{data:documents},{data:guides},{data:problems},{data:notes}]=await Promise.all([
    supabase.from('profiles').select('display_name,email,role').eq('id',user.id).single(),
    supabase.from('assets').select('id,name,slug').order('name'),
    supabase.from('places').select('*').order('updated_at',{ascending:false}),
    supabase.from('documents').select('id,title,notes,asset_id,index_status,is_published,process_status,process_message').order('created_at',{ascending:false}),
    supabase.from('guides').select('id,title,summary,body,asset_id,is_published').order('updated_at',{ascending:false}),
    supabase.from('troubleshooting').select('id,title,problem,solution,status,asset_id').order('updated_at',{ascending:false}),
    supabase.from('notes').select('id,title,body,asset_id,source,document_id,figure_slug').order('updated_at',{ascending:false}),
  ]);
  // Only editors can read this at all - the invites RLS policy returns nothing
  // to a viewer rather than erroring.
  const{data:figureRefs}=await supabase.from('document_figures').select('slug,label,document_id').order('document_id').order('figure_no');
  const{data:invites}=await supabase.from('invites').select('id,token,label,role,max_uses,uses,expires_at,revoked,created_at,last_used_at').order('created_at',{ascending:false});
  const host=(await headers()).get('host')??'';
  const origin=host?`https://${host}`:'';
  const canEdit=profile?.role==='editor'||profile?.role==='admin';
  return <main className="admin-page"><header><Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link><div><strong>{profile?.display_name||user.email}</strong><small>{profile?.role||'viewer'}</small></div></header><section><p className="kicker">Family knowledge base</p><h1>Add something useful</h1><p>Upload a manual, save a place, or write down the knowledge that normally lives in someone’s head.</p>{canEdit&&<RagStatus/>}{canEdit&&<FigureReview/>}<AdminForms assets={assets??[]} canEdit={canEdit}/><NotesPanel assets={assets??[]} notes={notes??[]} canEdit={canEdit} documents={documents??[]} figures={figureRefs??[]}/>{canEdit&&<InvitesPanel invites={invites??[]} origin={origin}/>}{canEdit&&<ContentManager assets={assets??[]} places={places??[]} documents={documents??[]} guides={guides??[]} problems={problems??[]}/>}</section></main>;
}

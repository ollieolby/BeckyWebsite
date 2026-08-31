import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AdminForms from './admin-forms';
import ContentManager from './content-manager';

export const dynamic='force-dynamic';
export default async function AdminPage(){
  const supabase=await createSupabaseServerClient();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
  const[{data:profile},{data:assets},{data:places},{data:documents},{data:guides}]=await Promise.all([
    supabase.from('profiles').select('display_name,email,role').eq('id',user.id).single(),
    supabase.from('assets').select('id,name,slug').order('name'),
    supabase.from('places').select('*').order('updated_at',{ascending:false}),
    supabase.from('documents').select('id,title,asset_id,index_status,is_published').order('created_at',{ascending:false}),
    supabase.from('guides').select('id,title,summary,body,asset_id,is_published').order('updated_at',{ascending:false}),
  ]);
  const canEdit=profile?.role==='editor'||profile?.role==='admin';
  return <main className="admin-page"><header><a className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></a><div><strong>{profile?.display_name||user.email}</strong><small>{profile?.role||'viewer'}</small></div></header><section><p className="kicker">Family knowledge base</p><h1>Add something useful</h1><p>Upload a manual, save a place, or write down the knowledge that normally lives in someone’s head.</p><AdminForms assets={assets??[]} canEdit={canEdit}/>{canEdit&&<ContentManager assets={assets??[]} places={places??[]} documents={documents??[]} guides={guides??[]}/>}</section></main>;
}

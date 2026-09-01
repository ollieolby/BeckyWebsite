import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export async function POST(request:Request){
  try{
    const {supabase,user}=await requireUser(); const body=await request.json();
    const title=String(body.title??'').trim(),content=String(body.body??'').trim();
    if(!title||!content)return NextResponse.json({error:'A title and note are required.'},{status:400});
    const {data,error}=await supabase.from('notes').insert({title,body:content,asset_id:body.asset_id||null,source:body.source==='chat'?'chat':'manual',created_by:user.id}).select().single();
    if(error)throw error; return NextResponse.json(data,{status:201});
  }catch(error){return apiError(error,'Unable to save the note.');}
}

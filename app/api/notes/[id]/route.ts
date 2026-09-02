import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {supabase}=await requireUser(); const {id}=await params; const body=await request.json();
    const title=String(body.title??'').trim(),content=String(body.body??'').trim();
    if(!title||!content)return NextResponse.json({error:'A title and note are required.'},{status:400});
    const {data,error}=await supabase.from('notes').update({title,body:content,asset_id:body.asset_id||null,document_id:body.document_id||null,figure_slug:String(body.figure_slug??'').trim()||null,updated_at:new Date().toISOString()}).eq('id',id).select().single();
    if(error)throw error; return NextResponse.json(data);
  }catch(error){return apiError(error,'Unable to update the note.');}
}

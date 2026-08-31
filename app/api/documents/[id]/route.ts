import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try {
    const {supabase}=await requireUser(); const {id}=await params; const body=await request.json();
    if(!body.title)return NextResponse.json({error:'A title is required.'},{status:400});
    const changes:Record<string,unknown>={title:String(body.title).trim(),asset_id:body.asset_id||null,is_published:Boolean(body.is_published)};
    if(body.notes!==undefined)changes.notes=String(body.notes).trim();
    const {data,error}=await supabase.from('documents').update(changes).eq('id',id).select().single();
    if(error)throw error; return NextResponse.json(data);
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to update manual.'},{status:500});
  }
}

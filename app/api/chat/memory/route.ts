import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export const runtime='nodejs'; export const maxDuration=60;

export async function POST(request:Request){
  try{
    const {supabase,user}=await requireUser();
    if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'Ask Becky has not been connected yet.'},{status:503});
    const body=await request.json(); const raw=Array.isArray(body.messages)?body.messages.slice(-20):[];
    const messages=raw.flatMap((item:unknown)=>{const value=item as {role?:unknown;content?:unknown};return (value.role==='user'||value.role==='assistant')&&typeof value.content==='string'?[{role:value.role,content:value.content.slice(0,8000)}]:[]});
    if(messages.length<2)return NextResponse.json({error:'Have a conversation with Becky before adding it to group memory.'},{status:400});
    if(messages.reduce((sum:number,item:{content:string})=>sum+item.content.length,0)>30000)return NextResponse.json({error:'This chat is too long to save in one note.'},{status:400});
    const response=await new OpenAI().responses.create({
      model:'gpt-5.4-nano',store:false,
      instructions:'Summarise this family boat conversation into durable shared memory. Keep only useful facts, decisions, measurements, fixes, preferences and conclusions. Omit greetings, repetition and generic assistant advice. Do not turn speculation into fact; label unresolved uncertainty. Write a short descriptive title and concise Markdown note.',
      input:messages.map((item:{role:'user'|'assistant';content:string})=>({role:item.role,content:item.content})),
      text:{format:{type:'json_schema',name:'group_memory',strict:true,schema:{type:'object',properties:{title:{type:'string'},body:{type:'string'}},required:['title','body'],additionalProperties:false}}},
    });
    const summary=JSON.parse(response.output_text) as {title?:string;body?:string};
    const title=String(summary.title??'').trim(),content=String(summary.body??'').trim();
    if(!title||!content)throw new Error('The chat summary was empty.');
    const {data,error}=await supabase.from('notes').insert({title,body:content,source:'chat',created_by:user.id}).select('id,title').single();
    if(error)throw error; return NextResponse.json(data,{status:201});
  }catch(error){return apiError(error,'Unable to add this chat to group memory.');}
}

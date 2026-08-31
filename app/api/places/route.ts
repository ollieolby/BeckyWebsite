import { NextResponse } from 'next/server';
import { createSupabaseServerClient, requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export async function GET(){try{const supabase=await createSupabaseServerClient();const{data,error}=await supabase.from('places').select('*').order('name');if(error)throw error;return NextResponse.json(data)}catch(error){return apiError(error,'Unable to load places.')}}

// Photographs are uploaded from the browser straight to Supabase Storage
// (Vercel functions reject bodies over ~4.5 MB), so the form only sends the
// resulting image_path, verified here before it is attached to the place.
export async function POST(request:Request){try{const{supabase,user}=await requireUser();const form=await request.formData();const latitude=Number(form.get('latitude')),longitude=Number(form.get('longitude'));const name=String(form.get('name')??'').trim();const category=String(form.get('category')??'');if(!name||!category||!Number.isFinite(latitude)||!Number.isFinite(longitude))return NextResponse.json({error:'Name, category and valid coordinates are required.'},{status:400});
let imagePath:null|string=null;const provided=String(form.get('image_path')??'');
if(provided){
  if(!provided.startsWith(`${user.id}/`))return NextResponse.json({error:'That photograph was not uploaded by your account.'},{status:403});
  const{data:object,error:infoError}=await supabase.storage.from('place-images').info(provided);
  if(infoError||!object)return NextResponse.json({error:'The uploaded photograph could not be found in storage. Try again.'},{status:400});
  imagePath=provided;
}
const{data,error}=await supabase.from('places').insert({name,category,latitude,longitude,notes:String(form.get('notes')??''),website_url:String(form.get('website_url')??'')||null,google_maps_url:String(form.get('google_maps_url')??'')||null,image_path:imagePath,is_published:true,created_by:user.id}).select().single();
if(error){if(imagePath)await supabase.storage.from('place-images').remove([imagePath]).catch(()=>{});throw error}
return NextResponse.json(data,{status:201})}catch(error){return apiError(error,'Unable to save the place.')}}

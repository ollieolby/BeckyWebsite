import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{const{supabase}=await requireUser();const{id}=await params;const body=await request.json();const latitude=Number(body.latitude),longitude=Number(body.longitude);if(!body.name||!Number.isFinite(latitude)||!Number.isFinite(longitude))return NextResponse.json({error:'Name and valid coordinates are required.'},{status:400});const{data,error}=await supabase.from('places').update({name:String(body.name).trim(),category:body.category,latitude,longitude,notes:String(body.notes??''),google_maps_url:body.google_maps_url||null,is_published:Boolean(body.is_published),updated_at:new Date().toISOString()}).eq('id',id).select().single();if(error)throw error;return NextResponse.json(data)}catch(error){return apiError(error,'Unable to update the place.')}}

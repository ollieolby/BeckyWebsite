'use client';
import { useEffect, useState } from 'react';

type Status={connected:boolean;message?:string;name?:string;status?:string;files?:{completed:number;failed:number;in_progress:number;total:number}};
export default function RagStatus(){const[status,setStatus]=useState<Status|null>(null);useEffect(()=>{fetch('/api/rag/status').then(r=>r.json()).then(setStatus).catch(()=>setStatus({connected:false,message:'Unable to check the connection.'}))},[]);return <div className="notice"><strong>Ask Becky: {status===null?'Checking…':status.connected?'Connected':'Not connected'}</strong>{status?.connected?<p>{status.name} · {status.files?.completed??0} manual(s) ready{status.files?.in_progress?` · ${status.files.in_progress} processing`:''}{status.files?.failed?` · ${status.files.failed} failed`:''}</p>:status?.message?<p>{status.message}</p>:null}</div>}

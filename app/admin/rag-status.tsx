'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Status={connected:boolean;message?:string;name?:string;status?:string;files?:{completed:number;failed:number;in_progress:number;total:number}};

export default function RagStatus(){
  const [status,setStatus]=useState<Status|null>(null);
  const router=useRouter();
  useEffect(()=>{
    let cancelled=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let wasProcessing=false;
    async function check(){
      try{
        const response=await fetch('/api/rag/status');
        const next:Status=await response.json();
        if(cancelled)return;
        setStatus(next);
        const processing=(next.files?.in_progress??0)>0;
        // The status endpoint also reconciles pending documents, so once
        // processing finishes, re-render the server components to update the
        // "Ready for AI" labels in the manage list.
        if(wasProcessing&&!processing)router.refresh();
        wasProcessing=processing;
        if(processing)timer=setTimeout(check,6000);
      }catch{
        if(!cancelled)setStatus({connected:false,message:'Unable to check the connection.'});
      }
    }
    check();
    return()=>{cancelled=true;if(timer)clearTimeout(timer)};
  },[router]);
  return <div className="notice"><strong>Ask Becky: {status===null?'Checking…':status.connected?'Connected':'Not connected'}</strong>{status?.connected?<p>{status.name} · {status.files?.completed??0} manual(s) ready{status.files?.in_progress?` · ${status.files.in_progress} processing`:''}{status.files?.failed?` · ${status.files.failed} failed`:''}</p>:status?.message?<p>{status.message}</p>:null}</div>;
}

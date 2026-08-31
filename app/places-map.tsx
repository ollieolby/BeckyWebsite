'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';

type Place = { id:string; name:string; category:string; latitude:number; longitude:number; notes:string; google_maps_url:string|null };
const colors:Record<string,string>={mooring:'#3d7e8a',pub:'#b55a3c',cafe:'#b18452',shop:'#71845e',fuel:'#725f87',other:'#687672'};
const BECKY_HOME:[number,number]=[-0.733883,51.574538];

export default function PlacesMap(){
  const container=useRef<HTMLDivElement>(null);const[message,setMessage]=useState('Loading our places…');
  useEffect(()=>{if(!container.current)return;let map:maplibregl.Map|undefined;let cancelled=false;
    async function start(){
      const response=await fetch('/api/places');
      if(cancelled)return;
      if(!response.ok){setMessage('The map could not be loaded just now.');return}
      const places:Place[]=await response.json();
      map=new maplibregl.Map({container:container.current!,center:BECKY_HOME,zoom:14,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]}});
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
      const homePopup=document.createElement('div');homePopup.className='place-popup';const homeLabel=document.createElement('small');homeLabel.textContent='Home mooring';const homeTitle=document.createElement('strong');homeTitle.textContent='Becky';homePopup.append(homeLabel,homeTitle);
      new maplibregl.Marker({color:'#173e39',scale:1.15}).setLngLat(BECKY_HOME).setPopup(new maplibregl.Popup({offset:24}).setDOMContent(homePopup)).addTo(map);
      places.forEach(place=>{
        const popup=document.createElement('div');popup.className='place-popup';
        const category=document.createElement('small');category.textContent=place.category;
        const title=document.createElement('strong');title.textContent=place.name;
        popup.append(category,title);
        if(place.notes){const notes=document.createElement('p');notes.textContent=place.notes;popup.append(notes)}
        if(place.google_maps_url){const link=document.createElement('a');link.href=place.google_maps_url;link.target='_blank';link.rel='noreferrer';link.textContent='Open in Google Maps ↗';popup.append(link)}
        new maplibregl.Marker({color:colors[place.category]||colors.other}).setLngLat([place.longitude,place.latitude]).setPopup(new maplibregl.Popup({offset:24}).setDOMContent(popup)).addTo(map!);
      });
      if(places.length)setMessage(`${places.length} saved ${places.length===1?'place':'places'} · centred on Becky`);else setMessage('Centred on Becky · no other places saved yet.');
    }
    start().catch(()=>setMessage('The map could not be loaded just now.'));
    return()=>{cancelled=true;map?.remove()};
  },[]);
  return <div className="map-shell"><div ref={container} className="map-canvas" aria-label="Map of saved family places"/><div className="map-message">{message}</div></div>;
}

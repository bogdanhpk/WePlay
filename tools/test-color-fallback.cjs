'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
function app({corrected=false,unrelated=false}={}){
 const kp=unrelated?'999123':'958500',calls=[],store=new Map();
 const badPath=corrected?'/new-encode/episode-1/master.m3u8':'/10_05_26/10/05/13/BATCH/ASSET.mp4/master.m3u8';
 const seasons=[1,2].map(season=>({season,episodes:[1,2].map(episode=>({episode:String(episode),hls:'https://video.fixture.invalid'+badPath,audio:{names:['Пифагор','LostFilm']}}))}));
 const c={URL,URLSearchParams,AbortController,Event,CustomEvent,Date,Promise,setTimeout,clearTimeout,Response,console,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:{getElementById:()=>({addEventListener:()=>{}})},addEventListener:()=>{},dispatchEvent:()=>{},DOMParser:class{parseFromString(){throw Error('No other fixture catalogs')}},fetch:async raw=>{const u=new URL(raw);calls.push(u.href);
  if(u.host==='embed.fixture.invalid')return new Response('var data={seasons:'+JSON.stringify(seasons)+'};');
  if(u.host==='plapi.cdnvideohub.com'){
   if(u.pathname.endsWith('/playlist')){assert.equal(u.searchParams.get('id'),'958500');return Response.json({isSerial:true,items:[{season:1,episode:1,vkId:'good11',voiceType:'Неизвестный'},{season:1,episode:2,vkId:'good12',voiceType:'Неизвестный'},{season:2,episode:1,vkId:'good21',voiceType:'Неизвестный'},{season:2,episode:2,vkId:'good22',voiceType:'Неизвестный'}]});}
   return Response.json({sources:{hlsUrl:'https://good.fixture.invalid/'+u.pathname.split('/').pop()+'.m3u8'}});
  }throw Error('Fixture source unavailable');
 }};c.window=c;vm.createContext(c);for(const f of ['network.js','catalog-union.js','seasons.js','audio-tracks.js','native-player.js','catalog.js'])vm.runInContext(fs.readFileSync(path.join(source,f),'utf8'),c);
 const item={id:'sb-958500',title:unrelated?'Другой сериал':'Охотник за разумом',_source:'sb',_detail:true,_kind:'series',_kindVerified:'series',xfields:{year:'2017',kinopoisk_id:kp,film:'https://embed.fixture.invalid/mindhunter'}};c.WePlayCatalog.remember(item);return{c,item,calls};
}
(async()=>{
 const a=app(),p=await a.c.WePlayCatalog.player(a.item,null,null,{sourceId:a.item.id,season:2,episode:2,position:180000});
 assert.equal(p.versionId,'lat-kp-958500');assert.equal(p.payload.episodes.length,4);await p.loadSources();
 assert(p.payload.episodes.every(e=>e.variants.every(v=>v._sources.every(row=>row.resolved.transport==='plain'))));
 const e=p.payload.episodes.find(e=>e.season===2&&e.episode===2),stream=await p.resolveEpisode(e,0);assert.equal(stream.transport,'plain');assert.ok(stream.url.endsWith('good22.m3u8'));
 assert(a.c.WePlayCatalog.find(a.item.id),'saved catalog identity survives');
 await assert.rejects(a.c.WePlayCatalog.player(a.item,a.item.id),/цвет/);
 const b=app({corrected:true}),fixed=await b.c.WePlayCatalog.player(b.item);assert.equal(fixed.versionId,b.item.id);assert(fixed.payload.episodes[0].variants.some(v=>v.label==='LostFilm'));
 const d=app({unrelated:true}),other=await d.c.WePlayCatalog.player(d.item);assert.equal(other.versionId,d.item.id);assert(!d.calls.some(x=>x.includes('plapi.cdnvideohub.com')));
 const grouped=await a.c.WePlayCatalog.seasons(a.item);assert.deepEqual(Array.from(grouped,x=>[x.number,x.count]),[[1,2],[2,2]]);
 console.log(JSON.stringify({result:'PASS',checks:['a cold saved Mindhunter card discovers the verified alternate','the known corrupted encode is excluded from playback, audio routes and seasons','resume matches the exact season and episode','saved catalog identity is preserved','a replacement encode from the original provider remains eligible','other titles and sources remain unchanged']}));
})().catch(e=>{console.error(e);process.exitCode=1});

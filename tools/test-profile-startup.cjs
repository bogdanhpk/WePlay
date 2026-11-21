const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
function fixture(broken=false){
 let release;const held=new Promise(resolve=>release=resolve),events=[],calls=[];
 const first={id:'pub-100',title:'The Odyssey',_source:'pub',_kind:'movie',_kindVerified:'movie',_kindVerifiedAt:Date.now(),_detail:true,_video:{publisher:'fixture',titleId:'6385370',aggregator:'kp'},xfields:{year:'2026',kinopoisk_id:'6385370',film:'https://plapi.cdnvideohub.com/api/v1/player/sv/playlist'}};
 const alternate={id:'200',title:'The Odyssey',_source:'primary',_kind:'movie',_kindVerified:'movie',_kindVerifiedAt:Date.now(),_detail:true,xfields:{year:'2026',kinopoisk_id:'6385370',film:'https://fixture.invalid/alternate'}};
 const c={URL,URLSearchParams,AbortController,Event,CustomEvent,Date,Promise,setTimeout,clearTimeout,console,WEPLAY_SETTINGS:{apiToken:'fixture'},localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({addEventListener:()=>{}})},addEventListener:()=>{},dispatchEvent:e=>events.push(e),fetch:async(raw,init)=>{
  calls.push(raw);const u=new URL(raw);
  if(u.hostname==='plapi.cdnvideohub.com')return{ok:true,json:async()=>({isSerial:false,items:broken?[]:[{vkId:'first',voiceStudio:'Studio A'}]})};
  if(u.hostname==='fixture.invalid')return{ok:true,text:async()=>`var opts={hls:"https://fixture.invalid/master.m3u8",audio:{"names":["Studio B"]}};`};
  if(u.hostname==='lord.kim'){
   if(!c.WePlayNetwork.isPlayback())await new Promise((resolve,reject)=>{held.then(resolve);init.signal.addEventListener('abort',()=>reject(Object.assign(Error('paused'),{name:'AbortError'})));});
   return{ok:true,json:async()=>({success:true,data:{items:[alternate]}})};
  }throw Error('Offline fixture catalog');
 }};c.window=c;vm.createContext(c);
 for(const file of ['network.js','catalog-union.js','seasons.js','audio-tracks.js','native-player.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),c);
 vm.runInContext(fs.readFileSync(process.env.WEPLAY_CATALOG_FILE||path.join(source,'catalog.js'),'utf8'),c);c.WePlayCatalog.remember(first);return{c,first,alternate,release,events,calls};
}
async function bounded(task){let timer;try{return await Promise.race([task,new Promise((resolve,reject)=>timer=setTimeout(()=>reject(Error('A usable profile/playback waited for background discovery')),500))]);}finally{clearTimeout(timer);}}
(async()=>{
 const a=fixture(),profile=await bounded(a.c.WePlayCatalog.api({action:'news',do:'get',id:a.first.id}));assert.equal(profile.data.id,a.first.id);assert.ok(profile.data.xfields.film);assert.equal(a.c.WePlayCatalog.versions(profile.data).length,1);
 const p=await a.c.WePlayCatalog.player(profile.data),e=p.payload.episodes[0];assert.equal(e.variants.length,1);a.release();await p.loadSources();assert.equal(e.variants.length,2);assert.equal(e.variants[1].label,'Studio B');assert.equal(a.c.WePlayCatalog.versions(profile.data).length,2);assert.ok(a.events.some(e=>e.type==='weplay:catalog-detail'));
 const b=fixture(true),fast=await bounded(b.c.WePlayCatalog.api({action:'news',do:'get',id:b.first.id}));await new Promise(resolve=>setTimeout(resolve,0));b.c.WePlayNetwork.setPlayback(true);
 try{const fallback=await bounded(b.c.WePlayCatalog.player(fast.data));assert.equal(fallback.versionId,b.alternate.id);assert.equal(fallback.payload.episodes[0].variants[0].label,'Studio B');assert.equal(b.c.WePlayNetwork.snapshot().backgroundActive,0);}finally{b.release();b.c.WePlayNetwork.setPlayback(false);}
 console.log(JSON.stringify({result:'PASS',checks:['usable profile does not await slow source discovery','all sources and voices still arrive after the profile renders','failed initial source discovers a working fallback with playback priority','foreground playback never joins paused background enrichment']}));
})().catch(e=>{console.error(e);process.exit(1);});

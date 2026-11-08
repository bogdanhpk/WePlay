const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
const replies=new Map(),calls=[];
const c={URL,URLSearchParams,AbortController,Event,CustomEvent,Date,Promise,setTimeout,clearTimeout,console,localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({addEventListener:()=>{}})},addEventListener:()=>{},dispatchEvent:()=>{},fetch:async url=>{calls.push(url);if(!replies.has(url))throw Error('Unavailable fixture');const value=replies.get(url);return{ok:true,json:async()=>value,text:async()=>value};}};
c.window=c;vm.createContext(c);
for(const file of ['network.js','catalog-union.js','seasons.js','native-player.js','catalog.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),c);
const catalog=c.WePlayCatalog,normal=value=>JSON.parse(JSON.stringify(value));
let sequence=0;
function item(source,title,serial=false){const id=source==='primary'?String(++sequence):source+'-'+(++sequence);return{id,title,_source:source,_kind:serial?'series':'movie',_detail:true,xfields:{year:'2026',original_title:title,postproduction:'Неверная озвучка из описания',film:'https://fixture.invalid/'+id}};}
function html(names,order){return'var data={hls:"https://fixture.invalid/master.m3u8",audio:'+JSON.stringify({names,order:order||[]})+'};';}
function video(record,rows){record._video={publisher:'fixture',titleId:String(record.id),aggregator:'kp'};const url='https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=fixture&id='+encodeURIComponent(record.id)+'&aggr=kp';replies.set(url,{isSerial:record._kind==='series',items:rows});return url;}
(async()=>{
 const first=item('pub','All tracks'),second=item('vc','All tracks'),third=item('sb','All tracks'),offline=item('lat','All tracks');
 video(first,[{vkId:'shared',voiceStudio:'Общая'},{vkId:'only-a',voiceStudio:'Студия A'}]);
 video(second,[{vkId:'shared',voiceStudio:'Общая'},{vkId:'only-b',voiceStudio:'Студия B'},{vkId:'other-a',voiceStudio:'Студия A'}]);
 replies.set(third.xfields.film+'?host=sb.lordfilm5.pro',html(['Оригинал','Дубляж']));
 for(const record of [first,second,third,offline])catalog.remember(record);
 const media=c.WePlayCatalogUnion.combine([first,second,third,offline])[0],resolved=await catalog.player(media);
 assert.equal(calls.length,1,'first source starts without waiting for other providers');
 const e=resolved.payload.episodes[0];assert.equal(e.variants.length,2);
 let updates=0;await resolved.loadSources(()=>updates++);
 assert.equal(e.variants.length,6);assert.equal(e.variants.filter(v=>v.label==='Общая').length,1,'same stream is deduplicated');
 const duplicates=e.variants.filter(v=>v.label==='Студия A');assert.equal(duplicates.length,2);assert.notEqual(duplicates[0].caption,duplicates[1].caption);assert.notEqual(duplicates[0].preferenceKey,duplicates[1].preferenceKey);
 const legacyIndex=e.variants.findIndex(v=>v.label==='Дубляж'),legacy=await resolved.resolveEpisode(e,legacyIndex);
 assert.equal(legacy.format,undefined,'legacy URLs retain automatic HLS/MP4 detection');assert.equal(legacy.audioTrack,1);assert.equal(legacy.versionId,third.id);assert.equal(legacy.transport,'');assert.ok(legacy.url.endsWith('master.m3u8'));
 replies.set('https://plapi.cdnvideohub.com/api/v1/player/sv/video/only-b',{sources:{hlsUrl:'https://fixture.invalid/b.m3u8'}});
 const b=await resolved.resolveEpisode(e,e.variants.findIndex(v=>v.label==='Студия B'));assert.equal(b.versionId,second.id);assert.equal(b.transport,'plain');assert.ok(updates>=2);
 const seriesA=item('pub','Exact episode',true),seriesB=item('vc','Exact episode',true);
 video(seriesA,[{vkId:'a1',voiceStudio:'A1',season:1,episode:1},{vkId:'a2',voiceStudio:'A2',season:1,episode:2}]);
 video(seriesB,[{vkId:'b2',voiceStudio:'B2',season:1,episode:2},{vkId:'b3',voiceStudio:'B3',season:2,episode:1}]);catalog.remember(seriesA);catalog.remember(seriesB);
 const serial=c.WePlayCatalogUnion.combine([seriesA,seriesB])[0],p=await catalog.player(serial,null,null,{sourceId:seriesA.id,season:1,episode:2});await p.loadSources();
 assert.equal(p.payload.episodes.length,2);assert.deepEqual(normal(p.payload.episodes[0].variants.map(v=>v.label)),['A1']);assert.deepEqual(normal(p.payload.episodes[1].variants.map(v=>v.label)),['A2','B2']);
 const held=item('pub','Playback priority');video(held,[{vkId:'priority',voiceStudio:'Priority'}]);catalog.remember(held);
 c.WePlayNetwork.setPlayback(true);const background=catalog.voices(held);await new Promise(resolve=>setTimeout(resolve,0));
 let timeout;try{const playing=await Promise.race([catalog.player(held),new Promise((resolve,reject)=>{timeout=setTimeout(()=>reject(Error('Playback waited for a suspended profile request')),2000);})]);assert.equal(playing.payload.episodes[0].variants[0].label,'Priority');assert.equal(c.WePlayNetwork.snapshot().backgroundActive,0);}finally{clearTimeout(timeout);c.WePlayNetwork.setPlayback(false);}await background;
 console.log(JSON.stringify({result:'PASS',checks:['first-source startup is independent of other providers','all sources enrich the same stable episode objects','identical video IDs deduplicate; distinct recordings retain source labels','legacy HLS keeps transport and exact audio-track index','API tracks resolve through their owning source','offline sources do not cancel healthy sources','series merge only matching season and episode','playback never joins a suspended profile voice request']}));
})().catch(e=>{console.error(e);process.exit(1);});

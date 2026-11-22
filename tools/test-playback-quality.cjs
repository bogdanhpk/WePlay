const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
function app({offline=false,otherVoice=false,slow=false}={}){
 const calls=[],store=new Map(),ladder=sizes=>'#EXTM3U\n'+sizes.map(([w,h],i)=>'#EXT-X-STREAM-INF:BANDWIDTH='+(1000000+i*1000000)+',RESOLUTION='+w+'x'+h+'\nlevel'+i+'.m3u8').join('\n');
 const c={URL,URLSearchParams,AbortController,Event,CustomEvent:class{constructor(type,data){this.type=type;this.detail=data.detail;}},TextDecoder,Response,Date,Promise,setTimeout,clearTimeout,console,btoa:s=>Buffer.from(s).toString('base64'),WEPLAY_SETTINGS:{apiToken:''},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:{getElementById:()=>({addEventListener:()=>{}})},DOMParser:class{parseFromString(){throw Error('No fixture catalog discovery');}},addEventListener:()=>{},dispatchEvent:()=>{},fetch:async(raw,init)=>{
  const u=new URL(raw);calls.push(u.href);
  if(u.hostname==='embed.fixture.invalid')return new Response('var opts={hls:"https://low.fixture.invalid/master.m3u8",audio:{"names":["Дубляж","Оригинал"],"languages":["ru","en"]}};');
  if(u.hostname==='low.fixture.invalid')return new Response(ladder([[648,270],[1272,530]]));
  if(u.hostname==='high.fixture.invalid'){if(offline)throw Error('Unavailable rendition');if(slow)return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('Slow quality probe aborted')),{once:true}));return new Response(ladder([[640,266],[1280,532],[1920,800],[3840,1600]]));}
  if(u.hostname==='plapi.cdnvideohub.com'){
   if(u.pathname.endsWith('/playlist'))return Response.json({isSerial:false,items:[{vkId:'high',voiceType:otherVoice?'Многоголосый':'Дубляж',voiceStudio:otherVoice?'SDI Media':''}]});
   if(offline)throw Error('Video unavailable');return Response.json({sources:{hlsUrl:'https://high.fixture.invalid/master.m3u8'}});
  }
  throw Error('Unavailable fixture catalog');
 }};c.window=c;vm.createContext(c);
 for(const file of ['network.js','catalog-union.js','seasons.js','audio-tracks.js','quality.js','native-player.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),c);
 c.WePlayWebCatalog={cleanTitle:s=>s};vm.runInContext(fs.readFileSync(path.join(source,'catalog.js'),'utf8'),c);
 const low={id:'sb-1',title:'Матрица',_source:'sb',_kind:'movie',_detail:true,_url:'https://sb.lordfilm5.pro/1-matrix.html',xfields:{year:'1999',kinopoisk_id:'301',film:'https://embed.fixture.invalid/movie/301'}},high={id:'pub-2',title:'Матрица',_source:'pub',_kind:'movie',_detail:true,_url:'https://lordfilms.pub/2-matrix.html',_video:{titleId:'301',publisher:'2070',aggregator:'kp'},xfields:{year:'1999',kinopoisk_id:'301',film:'https://plapi.cdnvideohub.com/api/v1/player/sv/playlist'}};
 const item=c.WePlayCatalog.dedupe([low,high])[0];c.WePlayCatalog.remember(item);return{c,calls,item};
}
(async()=>{
 const checks=[],a=app(),p=await a.c.WePlayCatalog.player(a.item),e=p.payload.episodes[0];a.c.WePlayNetwork.setPlayback(true);
 assert.equal(p.versionId,'sb-1');
 const high=await p.resolveEpisode(e,0,{quality:1080});assert.equal(high.versionId,'pub-2');assert.equal(high.audioTrack,undefined);assert.ok(high.voiceKey.includes('dub'));
 checks.push('saved Full HD preference chooses the same dub from a better source instead of retaining the first 720p stream');
 const qualities=await p.loadQualities(e,0);assert.deepEqual(Array.from(qualities,x=>x.height),[360,720,1080,2160]);
 const dub=e.variants.filter(x=>!x._duplicateOf&&x.label==='Дубляж');assert.equal(dub.length,1);assert.equal(dub[0]._sources.length,2);
 checks.push('the quality menu combines verified renditions while the dub remains one audio choice');
 const before=a.calls.filter(x=>x.includes('.fixture.invalid/')&&!x.includes('embed')).length;
 for(const quality of [2160,720,1080,0]){const stream=await p.resolveEpisode(e,0,{quality,bestQuality:quality===0});assert.equal(stream.voiceKey,high.voiceKey);assert.equal(stream.versionId,'pub-2');}
 assert.equal(a.calls.filter(x=>x.includes('.fixture.invalid/')&&!x.includes('embed')).length,before);
 checks.push('4K, Full HD, HD and Auto use cached manifest checks without downloading video segments');
 const retry=await p.resolveEpisode(e,0,{quality:1080,retry:true,failedStreamKey:high.streamKey});assert.equal(retry.versionId,'sb-1');
 checks.push('playback failure still tries another route for the same dub');
 const b=app(),auto=await b.c.WePlayCatalog.player(b.item);assert.equal((await auto.resolveEpisode(auto.payload.episodes[0],0,{quality:0})).versionId,'pub-2');
 checks.push('Auto moves away from a known source limited to 720p when the same dub has a better rendition');
 const d=app({offline:true}),fallback=await d.c.WePlayCatalog.player(d.item);assert.equal((await fallback.resolveEpisode(fallback.payload.episodes[0],0,{quality:2160})).versionId,'sb-1');assert.deepEqual(Array.from(await fallback.loadQualities(fallback.payload.episodes[0],0),x=>x.height),[360,720]);
 checks.push('unavailable higher-quality sources cannot stop playback or add fictitious resolutions');
 const f=app({otherVoice:true}),different=await f.c.WePlayCatalog.player(f.item);assert.equal((await different.resolveEpisode(different.payload.episodes[0],0,{quality:2160})).versionId,'sb-1');assert.deepEqual(Array.from(await different.loadQualities(different.payload.episodes[0],0),x=>x.height),[360,720]);
 checks.push('a higher-quality different studio or original-language track is never substituted');
 const g=app({slow:true}),slowPlay=await g.c.WePlayCatalog.player(g.item),started=Date.now();assert.equal((await slowPlay.resolveEpisode(slowPlay.payload.episodes[0],0,{quality:1080})).versionId,'sb-1');assert.ok(Date.now()-started<2500);
 checks.push('a slow quality probe cannot hold startup past its two-second alternate-source budget');
 const Q=a.c.WePlayQuality;assert.deepEqual(Array.from(Q.manifest('#EXTM3U\n#EXTINF:10,\nsegment.ts')),[]);assert.deepEqual(Array.from(Q.manifest('not a playlist')),[]);
 assert.equal(Q.wireURL('https://a.invalid/master.m3u8','plain'),'https://a.invalid/master.m3u8');assert.ok(Q.wireURL('https://a.invalid/master.m3u8','','1780000000000').includes('/x-en-x/'));assert.equal(Q.wireURL('https://a.invalid/x-en-x/already','','1780000000000'),'https://a.invalid/x-en-x/already');
 checks.push('provider encoding is shared with playback; segment playlists and non-HLS responses do not invent quality');
 console.log(JSON.stringify({result:'PASS',checks}));
})().catch(e=>{console.error(e);process.exitCode=1});

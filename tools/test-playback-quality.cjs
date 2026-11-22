const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
function app({offline=false,otherVoice=false,slow=false,lowFullHD=false,firstSlow=false,cartoon=false,platform='tizen',directMP4=false}={}){
 const calls=[],store=new Map(),ladder=sizes=>'#EXTM3U\n'+sizes.map(([w,h],i)=>'#EXT-X-STREAM-INF:BANDWIDTH='+(1000000+i*1000000)+',RESOLUTION='+w+'x'+h+'\nlevel'+i+'.m3u8').join('\n');
 const c={URL,URLSearchParams,AbortController,Event,CustomEvent:class{constructor(type,data){this.type=type;this.detail=data.detail;}},TextDecoder,Response,Date,Promise,setTimeout,clearTimeout,console,btoa:s=>Buffer.from(s).toString('base64'),WEPLAY_SETTINGS:{apiToken:''},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:{getElementById:()=>({addEventListener:()=>{}})},DOMParser:class{parseFromString(){throw Error('No fixture catalog discovery');}},addEventListener:()=>{},dispatchEvent:()=>{},fetch:async(raw,init)=>{
  const u=new URL(raw);calls.push(u.href);
  if(u.hostname==='embed.fixture.invalid')return new Response('var opts={hls:"https://low.fixture.invalid/master.m3u8",audio:{"names":["Дубляж","Оригинал"],"languages":["ru","en"]}};');
  if(u.hostname==='low.fixture.invalid'){if(firstSlow)return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('First metadata probe aborted')),{once:true}));return new Response(ladder(lowFullHD?[[640,266],[1280,532],[1920,800]]:[[648,270],[1272,530]]));}
  if(u.hostname==='direct.fixture.invalid'){const atom=(type,...parts)=>{const body=Buffer.concat(parts),head=Buffer.alloc(8);head.writeUInt32BE(body.length+8);head.write(type,4);return Buffer.concat([head,body]);},tkhd=Buffer.alloc(84),handler=Buffer.alloc(12);tkhd.writeUInt32BE((u.pathname.includes('actual4k')?3840:2560)*65536,76);tkhd.writeUInt32BE((u.pathname.includes('actual4k')?1600:1066)*65536,80);handler.write('vide',8);return new Response(atom('moov',atom('trak',atom('tkhd',tkhd),atom('mdia',atom('hdlr',handler)))),{status:206});}
  if(u.hostname==='high.fixture.invalid'){if(offline)throw Error('Unavailable rendition');if(slow)return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('Slow quality probe aborted')),{once:true}));return new Response(ladder([[640,266],[1280,532],[1920,800],directMP4?[2560,1066]:[3840,1600]]));}
  if(u.hostname==='plapi.cdnvideohub.com'){
   if(u.pathname.endsWith('/playlist'))return Response.json({isSerial:false,items:[{vkId:'high',voiceType:otherVoice?'Многоголосый':'Дубляж',voiceStudio:otherVoice?'SDI Media':''}]});
   if(offline)throw Error('Video unavailable');return Response.json({sources:{hlsUrl:'https://high.fixture.invalid/master.m3u8',...(directMP4?{mpeg4kUrl:'https://direct.fixture.invalid/actual2k',mpeg2kUrl:'https://direct.fixture.invalid/actual4k'}:{})}});
  }
  throw Error('Unavailable fixture catalog');
 }};c.window=c;c.WePlayTV={name:platform};vm.createContext(c);
 for(const file of ['network.js','catalog-union.js','seasons.js','audio-tracks.js','quality.js','native-player.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),c);
 c.WePlayWebCatalog={cleanTitle:s=>s};vm.runInContext(fs.readFileSync(path.join(source,'catalog.js'),'utf8'),c);
 const low={id:'sb-1',title:cartoon?'Холодное сердце':'Матрица',_source:'sb',_kind:'movie',_detail:true,_url:'https://sb.lordfilm5.pro/1-matrix.html',xfields:{year:'1999',kinopoisk_id:'301',film:'https://embed.fixture.invalid/movie/301'}},high={id:'pub-2',title:cartoon?'Холодное сердце':'Матрица',_source:'pub',_kind:'movie',_detail:true,_url:'https://lordfilms.pub/2-matrix.html',_video:{titleId:'301',publisher:'2070',aggregator:'kp'},xfields:{year:'1999',kinopoisk_id:'301',film:'https://plapi.cdnvideohub.com/api/v1/player/sv/playlist'}};
 const item=c.WePlayCatalog.dedupe([low,high])[0];c.WePlayCatalog.remember(item);return{c,calls,item,setOnline:()=>{offline=false;}};
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
 d.setOnline();assert.equal((await fallback.loadQualities(fallback.payload.episodes[0],0)).at(-1).height,2160);checks.push('a recovered source is rechecked immediately after a failed quality probe');
 const f=app({otherVoice:true}),different=await f.c.WePlayCatalog.player(f.item);assert.equal((await different.resolveEpisode(different.payload.episodes[0],0,{quality:2160})).versionId,'sb-1');assert.deepEqual(Array.from(await different.loadQualities(different.payload.episodes[0],0),x=>x.height),[360,720]);
 checks.push('a higher-quality different studio or original-language track is never substituted');
 const g=app({slow:true}),slowPlay=await g.c.WePlayCatalog.player(g.item),started=Date.now();assert.equal((await slowPlay.resolveEpisode(slowPlay.payload.episodes[0],0,{quality:1080})).versionId,'sb-1');assert.ok(Date.now()-started<2500);
 checks.push('a slow quality probe cannot hold startup past its two-second alternate-source budget');
 const Q=a.c.WePlayQuality;assert.deepEqual(Array.from(Q.manifest('#EXTM3U\n#EXTINF:10,\nsegment.ts')),[]);assert.deepEqual(Array.from(Q.manifest('not a playlist')),[]);
 assert.equal(Q.wireURL('https://a.invalid/master.m3u8','plain'),'https://a.invalid/master.m3u8');assert.ok(Q.wireURL('https://a.invalid/master.m3u8','','1780000000000').includes('/x-en-x/'));assert.equal(Q.wireURL('https://a.invalid/x-en-x/already','','1780000000000'),'https://a.invalid/x-en-x/already');
 checks.push('provider encoding is shared with playback; segment playlists and non-HLS responses do not invent quality');
 for(const platform of ['android','tizen','webos'])for(const cartoon of [false,true]){
  const sample=app({lowFullHD:true,cartoon,platform}),play=await sample.c.WePlayCatalog.player(sample.item),episode=play.payload.episodes[0];
  assert.equal((await play.resolveEpisode(episode,0,{quality:0})).versionId,'pub-2',platform+' Auto must search beyond the first Full HD source');
  const updates=[];await play.loadQualities(episode,0,levels=>updates.push(Array.from(levels,x=>x.height)));assert.equal(updates.at(-1).at(-1),2160);assert.ok(updates.length>=2);
  const pinned=await sample.c.WePlayCatalog.player(sample.item,'pub-2');assert.equal(pinned.loadSources,undefined);assert.equal((await pinned.loadQualities(pinned.payload.episodes[0],0)).at(-1).height,2160);
 }
 checks.push('movies and cartoons on Android, Tizen and webOS find 4K above an initial Full HD route; partial quality results arrive incrementally');
 checks.push('a pinned single source still exposes all verified resolutions');
 const w=app({lowFullHD:true});await w.c.WePlayCatalog.voices(w.item);for(let n=0;n<30&&(w.c.WePlayNetwork.snapshot().backgroundActive||w.c.WePlayNetwork.snapshot().backgroundWaiting);n++)await new Promise(r=>setTimeout(r,5));const requestsBefore=w.calls.filter(x=>x.includes('.fixture.invalid/')&&!x.includes('embed')).length,wp=await w.c.WePlayCatalog.player(w.item);assert.equal((await wp.resolveEpisode(wp.payload.episodes[0],0,{quality:0})).versionId,'pub-2');assert.equal(w.calls.filter(x=>x.includes('.fixture.invalid/')&&!x.includes('embed')).length,requestsBefore);checks.push('profile metadata warms a shared quality cache without downloading it again at playback');
 const h=app({firstSlow:true}),firstSlow=await h.c.WePlayCatalog.player(h.item),at=Date.now();assert.equal((await firstSlow.resolveEpisode(firstSlow.payload.episodes[0],0,{quality:0})).versionId,'pub-2');assert.ok(Date.now()-at<2500);
 const m=app({lowFullHD:true,directMP4:true}),mp=await m.c.WePlayCatalog.player(m.item),me=mp.payload.episodes[0],ms=await mp.resolveEpisode(me,0,{quality:0});assert.equal(ms.format,'mp4');assert.ok(ms.url.endsWith('/actual4k'));assert.equal(ms.verifiedQuality,2160);assert.deepEqual(Array.from(await mp.loadQualities(me,0),x=>x.height),[360,720,1080,1440,2160]);assert.equal((await mp.resolveEpisode(me,0,{quality:1080})).format,'hls');
 checks.push('direct MP4 4K is selected above an HLS 1440p ladder even when provider 2K and 4K field names are swapped');
 checks.push('a slow first manifest shares the startup budget and cannot hide a faster 4K alternative');
 console.log(JSON.stringify({result:'PASS',checks}));
})().catch(e=>{console.error(e);process.exitCode=1});

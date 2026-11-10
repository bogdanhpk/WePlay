const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
const origins={primary:'https://lord.kim',sb:'https://sb.lordfilm5.pro',pub:'https://lordfilms.pub',lat:'https://lordfilm26-kino11.lat',vc:'https://lordfilm.vc'};
const records=new Map(),failed=new Set();let sequence=1000;
function record(provider,kind,title,kp){const number=String(++sequence),id=provider==='primary'?number:provider+'-'+number;const r={id,title,_source:provider,_kind:kind,_url:origins[provider]+(provider==='lat'?'/'+number:'/'+number+'-fixture.html'),_detail:true,xfields:{year:'2026',kinopoisk_id:String(kp),original_title:title,janre:kind==='series'?'мультсериал':'мультфильм',film:'https://fixture.invalid/embed/movie/'+kp,image:'https://fixture.invalid/cover.jpg'}};records.set(id,r);return r;}
function app(store=new Map()){
 const calls=[],node=(text,attrs={})=>({textContent:text,getAttribute:key=>attrs[key]||null,cloneNode(){return this;},querySelectorAll:()=>[]});
 function documentFor(r){const frame=node('',{src:r.xfields.film});return{body:node(''),record:r,querySelector:s=>s==='h1'?node(r.title):null,querySelectorAll:s=>s.includes('iframe')?[frame]:[]};}
 const c={URL,URLSearchParams,AbortController,Event,Date,Promise,setTimeout,clearTimeout,console,WEPLAY_SETTINGS:{apiToken:'fixture'},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:{getElementById:()=>({addEventListener:()=>{}})},DOMParser:class{parseFromString(body){return documentFor(records.get(JSON.parse(body).id));}},addEventListener:()=>{},dispatchEvent:()=>{},fetch:async raw=>{
  calls.push(raw);const u=new URL(raw),provider=Object.keys(origins).find(p=>new URL(origins[p]).hostname===u.hostname);
  if(failed.has(provider))throw Error('Offline fixture source');
  if(u.hostname==='fixture.invalid')return{ok:true,text:async()=>`var opts={hls:"https://fixture.invalid/master.m3u8",audio:{"names":["Дубляж"]}};`};
  if(u.hostname==='plapi.cdnvideohub.com')return{ok:true,json:async()=>({isSerial:false,items:[{vkId:'expanded',voiceStudio:'Дубляж'}]})};
  let r;if(provider==='primary')r=records.get(u.searchParams.get('id'));else{const n=(u.pathname.match(/^\/(\d+)/)||[])[1]||u.searchParams.get('newsid');r=records.get(provider+'-'+n);}
  if(!r)throw Error('Unknown fixture page');return{ok:true,json:async()=>({success:true,data:r}),text:async()=>JSON.stringify({id:r.id})};
 }};c.window=c;vm.createContext(c);
 for(const file of ['network.js','catalog-union.js','seasons.js','audio-tracks.js','native-player.js','progress.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),c);
 c.WePlayWebCatalog={breadcrumbKind:()=>'',originalTitle:()=>'',cleanTitle:s=>s,detail:async(known,s,h)=>{const doc=await h.documentAt(known._url,s);return{...doc.record,_url:known._url};}};
 vm.runInContext(fs.readFileSync(path.join(source,'catalog.js'),'utf8'),c);return{c,store,calls,U:c.WePlayCatalogUnion,p:c.WePlayProgress,catalog:c.WePlayCatalog};
}
(async()=>{
 const checks=[];let coldCases=0;
 for(const kind of ['movie','series'])for(const provider of Object.keys(origins)){
  const r=record(provider,kind,'Cold '+provider+' '+kind,++sequence),a=app();a.catalog.remember(r);a.p.update(r,{position:120000,duration:600000,sourceId:r.id,season:kind==='series'?2:null,episode:kind==='series'?3:null});
  const b=app(a.store),saved=b.p.list()[0];b.catalog.remember(saved.item);const full=await b.catalog.info(saved.item);
  assert.equal(full.id,r.id);assert.equal(full._source,provider);assert.ok(full.xfields.film);assert.equal(saved.position,120000);if(kind==='series'){assert.equal(saved.season,2);assert.equal(saved.episode,3);}coldCases++;
 }
 checks.push('movies and series restore after a cold start in all five active catalogs');
 const a=app(),rich=record('lat','movie','Preserve full source',++sequence);rich._video={publisher:'2070',titleId:'123',aggregator:'kp'};a.catalog.dedupe([rich]);
 for(const thin of [{id:rich.id,title:rich.title,xfields:{}},{id:rich.id,title:'',_source:'primary',_url:'',_video:null,_detail:false,xfields:{film:''}},{...rich,_alternatives:[],xfields:{year:'2026'}}])a.catalog.remember(thin);
 const calls=a.calls.length,kept=await a.catalog.info(rich);assert.equal(a.calls.length,calls);assert.equal(kept._url,rich._url);assert.equal(kept._source,'lat');assert.equal(kept._video.titleId,'123');assert.equal(kept.xfields.film,rich.xfields.film);
 checks.push('sparse search, favorite and history cards cannot erase complete catalog records or change their source');
 const variants=Object.keys(origins).map(p=>record(p,'movie','Multi-source film',555555)),b=app(),combined=b.catalog.dedupe(variants)[0];b.catalog.remember(combined);b.p.update(combined,{position:125000,duration:600000,sourceId:variants[1].id});
 const raw=b.store.get('lord.watch-progress.v1'),saved=JSON.parse(raw).records[0];assert.equal(saved.item._alternatives.length,5);assert.ok(!raw.includes('fixture.invalid/embed'));assert.ok(!raw.includes('_video'));assert.ok(!raw.includes('"film":'));
 const partial=app(new Map(b.store)),minimal={id:saved.item.id,title:saved.item.title,_kind:'movie',xfields:{year:'2026',kinopoisk_id:'555555'}};partial.catalog.remember(minimal);partial.p.update(minimal,{position:126000,duration:600000});assert.equal(app(partial.store).p.list()[0].item._alternatives.length,5,'updating before all sources register retains older locators');
 const cold=app(b.store),restored=cold.p.list()[0];cold.catalog.remember(restored.item);assert.equal(cold.catalog.versions(restored.item).length,5);failed.add('primary');failed.add('sb');const playback=await cold.catalog.player(restored.item,null,null,restored);assert.equal(playback.source,'pub');failed.clear();
 cold.p.update({id:restored.item.id,title:restored.item.title,_kind:'movie',xfields:{year:'2026',kinopoisk_id:'555555'}},{position:130000,duration:600000,sourceId:variants[2].id});assert.equal(app(cold.store).p.list()[0].item._alternatives.length,5);
 checks.push('all source locators survive history serialization, reload, unavailable preferred sources and later progress updates');
 const stale=record('vc','movie','Stale empty profile',++sequence),staleApp=app();staleApp.catalog.remember({...stale,xfields:{year:'2026'}});const renewed=await staleApp.catalog.info(stale);assert.ok(renewed.xfields.film);assert.ok(staleApp.calls.length);
 checks.push('a previously loaded profile without a player is revalidated');
 const expanded=app(),expandedItem={id:'lat-kp-493208',title:'Expanded title',_source:'primary',_kind:'movie',xfields:{year:'2013'}};expanded.catalog.remember(expandedItem);const route=await expanded.catalog.info(expandedItem);assert.equal(route._source,'lat');assert.equal(route._video.titleId,'493208');assert.equal(route.xfields.kinopoisk_id,'493208');
 checks.push('expanded search records recover their exact API identity from the stable ID');
 const split=app(),film=record('pub','movie','Corrected identity',++sequence),other={...record('vc','movie','Corrected identity',sequence),xfields:{year:'2026'}};delete film.xfields.kinopoisk_id;const old=split.U.combine([film,other])[0];assert.equal(old._alternatives.length,2);split.U.combine([{id:other.id,title:other.title,_kind:'series',_kindVerified:'series',xfields:{year:'2026'}}]);assert.deepEqual(Array.from(split.U.locators(old),r=>r.id),[film.id]);
 checks.push('old saved groups cannot revive a source separated by verified media-type correction');
 for(const url of ['https://lordfilms.pub/1-fixture.html?token=PRIVATE_AUTH_MARKER','https://user:PRIVATE_AUTH_MARKER@lordfilms.pub/1-fixture.html','https://private.invalid/PRIVATE_AUTH_MARKER','http://127.0.0.1/PRIVATE_AUTH_MARKER']){
  const d=app(),item={id:'pub-1',title:'Safe public locator',_source:'pub',_kind:'movie',_url:url,xfields:{year:'2026',film:'https://secret.invalid/PRIVATE_AUTH_MARKER'}};d.p.update(item,{position:1000,duration:10000});assert.ok(!d.store.get('lord.watch-progress.v1').includes('PRIVATE_AUTH_MARKER'));
 }
 checks.push('only public catalog pages are stored; media URLs, URL credentials and private hosts are omitted');
 console.log(JSON.stringify({result:'PASS',coldCases,checks}));
})().catch(e=>{console.error(e);process.exit(1);});

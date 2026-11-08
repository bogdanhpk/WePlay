const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
const replies=new Map(),calls=[];
const c={URL,URLSearchParams,AbortController,Event,Date,Promise,setTimeout,clearTimeout,console,localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({addEventListener:()=>{}})},addEventListener:()=>{},dispatchEvent:()=>{},fetch:async url=>{calls.push(url);if(!replies.has(url))throw Error('Unavailable fixture');const value=replies.get(url);return{ok:true,json:async()=>value,text:async()=>value};}};
c.window=c;vm.createContext(c);
for(const file of ['catalog-union.js','seasons.js','native-player.js','catalog.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),c);
const catalog=c.WePlayCatalog,normal=value=>JSON.parse(JSON.stringify(value));
let sequence=0;
function item(source,title,serial=false){const id=source==='primary'?String(++sequence):source+'-'+(++sequence);return{id,title,_source:source,_kind:serial?'series':'movie',_detail:true,xfields:{year:'2026',original_title:title,postproduction:'Неверная озвучка из описания',film:'https://fixture.invalid/'+id}};}
function html(names,order){return'var data={hls:"https://fixture.invalid/master.m3u8",audio:'+JSON.stringify({names,order:order||[]})+'};';}
function video(record,rows){record._video={publisher:'fixture',titleId:String(record.id),aggregator:'kp'};const url='https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=fixture&id='+encodeURIComponent(record.id)+'&aggr=kp';replies.set(url,{isSerial:record._kind==='series',items:rows});return url;}
(async()=>{
 const checks=[];
 for(const provider of ['primary','sb','lat']){
  const record=item(provider,'Legacy '+provider);replies.set(record.xfields.film+'?host='+({primary:'lord.kim',sb:'sb.lordfilm5.pro',lat:'lordfilm26-kino11.lat'}[provider]),html(['Первый', 'delete',' Второй ','первый'],[3,1,0,4]));catalog.remember(record);
  const voices=await catalog.voices(record);assert.deepEqual(normal(voices.labels),['Второй','Первый'],provider+' uses player labels and ordering');assert.equal(voices.source,provider);checks.push(provider+' iframe player data');
 }
 for(const provider of ['pub','vc']){
  const record=item(provider,'API '+provider);video(record,[{vkId:'a',voiceStudio:'MovieDalen',voiceType:'Дубляж'},{vkId:'b',voiceStudio:'CVH Production',voiceType:'Многоголосый'},{vkId:'c',voiceType:'Авторская'}]);catalog.remember(record);
  assert.deepEqual(normal((await catalog.voices(record)).labels),['MovieDalen','CVH Production','Авторская']);checks.push(provider+' actual studio names');
 }
 const failed=item('sb','Same movie'),fallback=item('pub','Same movie');video(fallback,[{vkId:'x',voiceStudio:'Реальная студия'}]);catalog.remember(failed);catalog.remember(fallback);
 const combined=c.WePlayCatalogUnion.combine([failed,fallback])[0],available=await catalog.voices(combined);assert.equal(available.versionId,fallback.id);assert.deepEqual(normal(available.labels),['Реальная студия']);checks.push('unavailable first source falls back exactly as playback');
 const first=item('vc','Series',true),second=item('pub','Series',true);video(first,[{vkId:'first',voiceStudio:'Первый источник',season:1,episode:1}]);video(second,[{vkId:'s2',voiceStudio:'Озвучка серии 2',season:1,episode:2},{vkId:'s1',voiceStudio:'Озвучка серии 1',season:1,episode:1}]);catalog.remember(first);catalog.remember(second);
 const serial=c.WePlayCatalogUnion.combine([first,second])[0],continued=await catalog.voices(serial,{sourceId:second.id,season:1,episode:2});assert.equal(continued.versionId,second.id);assert.equal(continued.episode,2);assert.deepEqual(normal(continued.labels),['Озвучка серии 2']);checks.push('continue watching selects the saved source and episode');
 const unknown=item('lat','Unknown labels');replies.set(unknown.xfields.film+'?host=lordfilm26-kino11.lat',html([]));catalog.remember(unknown);assert.deepEqual(normal((await catalog.voices(unknown)).labels),[]);checks.push('missing player names never reuse catalog descriptions');
 const expanded={id:'lat-kp-493208',title:'Expanded',_source:'lat',_kind:'movie',xfields:{year:'2013',kinopoisk_id:'493208'}};catalog.remember(expanded);replies.set('https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=2070&id=493208&aggr=kp',{isSerial:false,items:[{vkId:'expanded',voiceStudio:'Проверенная озвучка'}]});assert.deepEqual(normal((await catalog.voices(expanded)).labels),['Проверенная озвучка']);checks.push('expanded catalog records use the same verified playlist');
 assert.ok(calls.length<30);console.log(JSON.stringify({result:'PASS',checks,requests:calls.length}));
})().catch(error=>{console.error(error);process.exit(1);});

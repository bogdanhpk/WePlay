const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app')),calls=[];
const node=(text,attrs={})=>({textContent:text,getAttribute:key=>attrs[key]||null,cloneNode(){return this;},querySelectorAll:()=>[]});
const frame=node('',{src:'https://fixture.invalid/embed/movie/91235'});
const doc={body:node(''),querySelector:selector=>selector==='h1'?node('История игрушек 5'):null,querySelectorAll:selector=>selector.includes('iframe')?[frame]:[]};
const c={URL,URLSearchParams,AbortController,Event,Date,Promise,setTimeout,clearTimeout,console,localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>({addEventListener:()=>{}})},DOMParser:class{parseFromString(){return doc;}},addEventListener:()=>{},dispatchEvent:()=>{},fetch:async raw=>{calls.push(raw);return{ok:true,text:async()=>'<html>catalog</html>'};}};
c.window=c;vm.createContext(c);
for(const file of ['network.js','catalog-union.js','seasons.js','audio-tracks.js','native-player.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),c);
c.WePlayWebCatalog={breadcrumbKind:()=>'',originalTitle:()=>'',cleanTitle:s=>s,detail:async(known,s,h)=>{await h.documentAt(known._url,s);return{...known,_detail:true,xfields:{...known.xfields,film:'https://fixture.invalid/embed/movie/91235'}};}};
vm.runInContext(fs.readFileSync(process.env.WEPLAY_CATALOG_FILE||path.join(source,'catalog.js'),'utf8'),c);
const catalog=c.WePlayCatalog,checks=[];
(async()=>{
 for(const [provider,base] of [['lat','https://lordfilm26-kino11.lat'],['sb','https://sb.lordfilm5.pro'],['pub','https://lordfilms.pub'],['vc','https://lordfilm.vc']]){
  const record={id:provider+'-1397',title:'История игрушек 5',_source:provider,_kind:'movie',xfields:{year:'2026'}};
  catalog.remember(record);const full=await catalog.info(record,true);
  const expected=base+(provider==='lat'?'/1397':'/index.php?newsid=1397');
  assert.ok(calls.includes(expected),provider+' recovers the exact public page');assert.equal(full._url,expected);assert.ok(full.xfields.film,provider+' recovers playback');
 }
 checks.push('cold local history restores public pages for every web catalog');
 const rich={id:'lat-2000',title:'History card',_source:'lat',_kind:'movie',_url:'https://lordfilm26-kino11.lat/2000',_detail:true,_video:{publisher:'2070',titleId:'123',aggregator:'kp'},xfields:{year:'2026',film:'https://fixture.invalid/embed/movie/123'}};
 catalog.remember(rich);catalog.remember({id:rich.id,title:rich.title,_source:'lat',_kind:'movie',xfields:{year:'2026',image:'https://fixture.invalid/image.jpg'}});
 const before=calls.length,kept=await catalog.info(rich);assert.equal(calls.length,before);assert.equal(kept._url,rich._url);assert.equal(kept._video.titleId,'123');assert.equal(kept.xfields.film,rich.xfields.film);
 checks.push('rendering a compact continue-watching card preserves loaded source and player metadata');
 const invalid={id:'lat-../1397',title:'Invalid',_source:'lat',xfields:{}};catalog.remember(invalid);await assert.rejects(catalog.info(invalid,true));assert.equal(calls.length,before);
 checks.push('invalid source IDs cannot construct a request');
 console.log(JSON.stringify({result:'PASS',checks,requests:calls.length}));
})().catch(e=>{console.error(e);process.exit(1);});

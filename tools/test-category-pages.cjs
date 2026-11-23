'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
const movie=(id,title)=>({id,title,_kind:'movie',xfields:{year:'2026'}});
function catalog(routes,token='fixture'){
 const calls=[],saved=new Map(),c={URL,URLSearchParams,AbortController,Event,Date,Promise,setTimeout,clearTimeout,console,WEPLAY_SETTINGS:{apiToken:token},localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},dispatchEvent:()=>{},addEventListener:()=>{}};
 c.window=c;vm.createContext(c);
 vm.runInContext(fs.readFileSync(path.join(source,'catalog-union.js'),'utf8'),c);
 c.DOMParser=class{parseFromString(text){const data=JSON.parse(text);return{...data,body:{textContent:'Ничего не найдено'},querySelector:()=>null,querySelectorAll:selector=>selector==='a[href]'?Array.from({length:data.pages||1},(_,at)=>({getAttribute:()=>'/page/'+(at+1)+'/'})):[]};}};
 c.WePlayNetwork={request:async raw=>{const url=new URL(raw),provider=url.hostname==='lord.kim'?'primary':url.hostname.includes('.lat')?'lat':'empty',page=Number(url.searchParams.get('page'))||Number(url.pathname.match(/\/page\/(\d+)/)?.[1])||1;calls.push({provider,page});const data=await routes(provider,page);if(provider==='primary')return{success:true,data:{items:data.rows,pagination:{page,pages:data.pages||1},partial:data.partial,retryPage:data.retry}};return JSON.stringify(data);}};
 c.WePlayWebCatalog={cleanTitle:value=>value,listing:async doc=>{const rows=doc.rows||[];rows._partial=!!doc.partial;rows._retry=!!doc.retry;return rows;}};
 vm.runInContext(fs.readFileSync(path.join(source,'catalog.js'),'utf8'),c);
 return{api:(page,limit=2,preview=false)=>c.WePlayCatalog.api({action:'news',do:'list',category:106,page,limit},preview),calls,c};
}
async function mediaCards(){
 let clock=0;const c={window:{},URL,Promise,Date:{now:()=>clock}};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(source,'catalog-web.js'),'utf8'),c);
 const provider={id:'lat',base:'https://fixture.invalid/'},links=[1,2,3].map(id=>({getAttribute:()=>'/'+id}));
 const root={querySelector:()=>null},known=new Map([1,3].map(id=>['lat-'+id,{...movie('lat-'+id,'Card '+id),_detail:true}]));let fail=true;
 const fact={textContent:'Год выхода: 2026',firstElementChild:{textContent:'Год выхода'}};
 const detailDoc={querySelector:()=>null,querySelectorAll:selector=>selector==='script[type="application/ld+json"]'?[{textContent:JSON.stringify({'@type':'Movie',name:'Card 2'})}]:[]};
 const h={current:()=>true,pageURL:raw=>new URL(raw,provider.base).href,lookup:id=>known.get(id),remember:item=>known.set(item.id,item),url:(raw,base)=>new URL(raw,base).href,imageURL:()=>'',backdropURL:()=>[],get:()=>'',text:node=>node&&node.textContent||'',list:(doc,selector)=>doc===root?links:selector==='.facts-list li'?[fact]:[],documentAt:async()=>{if(fail)throw Error('One card failed');return detailDoc;}};
 const partial=await c.window.WePlayWebCatalog.listing(root,provider,{category:106},h);assert.deepEqual(Array.from(partial,row=>row.title),['Card 1','Card 3']);assert.equal(partial._partial,true);assert.equal(partial._retry,true);
 fail=false;const complete=await c.window.WePlayWebCatalog.listing(root,provider,{category:106},h);assert.deepEqual(Array.from(complete,row=>row.title),['Card 1','Card 2','Card 3']);assert.equal(complete._partial,false);assert.equal(known.get('lat-2').xfields.year,'2026');
 known.clear();fail=true;await assert.rejects(c.window.WePlayWebCatalog.listing(root,provider,{category:106},h));
 let slowCalls=0;h.documentAt=async()=>{slowCalls++;clock+=7000;throw Error('Timeout');};await assert.rejects(c.window.WePlayWebCatalog.listing(root,provider,{category:106},h));assert.equal(slowCalls,1,'A slow source cannot start a new timeout for every remaining card');
}
async function main(){
 await mediaCards();
 let failed=false;
 const recovered=catalog((provider,page)=>{
  if(provider==='empty')return{rows:[]};
  if(provider==='lat'){if(!failed){failed=true;throw Error('temporary disconnect');}return{rows:[movie('lat-10','Recovered source')],pages:1};}
  return{rows:[movie(page,'Primary '+page)],pages:2};
 });
 const one=await recovered.api(1);assert.equal(one.data.items.length,2);assert.equal(one.data.partial,true);assert.equal(one.data.pagination.pages,2);
 const two=await recovered.api(2);assert.ok(two.data.items.some(item=>item.title==='Recovered source'));assert.equal(two.data.partial,false);assert.equal(two.data.pagination.pages,2);assert.deepEqual(recovered.calls.filter(c=>c.provider==='lat').map(c=>c.page),[1,1]);
 let restored=false;
 const retry=catalog(provider=>{if(provider==='lat'){if(!restored)throw Error('offline');return{rows:[movie('lat-20','After retry')]};}return{rows:[]};},'');
 await assert.rejects(retry.api(1));restored=true;assert.equal((await retry.api(1)).data.items[0].title,'After retry');assert.ok(!retry.calls.some(c=>c.provider==='primary'),'An unconfigured API does not keep the feed open forever');
 let partial=true;
 const incomplete=catalog((provider,page)=>{if(provider!=='lat')return{rows:[]};if(page===2)return{rows:[movie('lat-3','Third')],pages:2};const rows=[movie('lat-1','First')];if(!partial)rows.push(movie('lat-2','Recovered card'));return{rows,pages:2,partial,retry:partial};},'');
 const first=await incomplete.api(1,1);assert.equal(first.data.partial,true,'Filtering must preserve the incomplete-page flag');partial=false;
 const all=Array.from(first.data.items);for(let page=2;page<7;page++){const j=await incomplete.api(page,1);all.push(...j.data.items);if(j.data.pagination.pages===page)break;}
 assert.deepEqual(all.map(item=>item.title).sort(),['First','Recovered card','Third']);assert.equal(new Set(all.map(item=>item.id)).size,3);assert.deepEqual(incomplete.calls.filter(c=>c.provider==='lat').map(c=>c.page),[1,1,2]);
 const stubborn=catalog((provider,page)=>provider==='lat'?{rows:[movie('lat-'+page,'Page '+page)],pages:2,partial:true,retry:true}:{rows:[]},'');let last;
 for(let page=1;page<8;page++){last=await stubborn.api(page,1);if(last.data.pagination.pages===page)break;}
 assert.ok(last.data.pagination.pages<8,'A permanently broken card cannot trap later pages');assert.ok(stubborn.calls.some(c=>c.provider==='lat'&&c.page===2));assert.equal(stubborn.calls.filter(c=>c.provider==='lat').length,4,'Each incomplete page gets one recovery pass');
 const mixed=catalog((provider,page)=>provider==='primary'?{rows:[movie(page,'Same page '+page)],pages:3}:{rows:[]});const seen=[];for(let page=1;page<=3;page++)seen.push(...(await mixed.api(page,1)).data.items);assert.equal(new Set(seen.map(item=>item.id)).size,3);assert.equal((await mixed.api(2,1)).data.items[0].title,'Same page 2');
 const large=catalog((provider,page)=>provider==='primary'?{rows:Array.from({length:5},(_,at)=>{const id=(page-1)*5+at+1;return movie(id,'Long catalog '+id);}),pages:30}:{rows:[]});const complete=[];
 for(let page=1;page<=30;page++){const j=await large.api(page,60);complete.push(...j.data.items);if(j.data.pagination.pages===page)break;}
 assert.equal(complete.length,150,'All thirty source pages remain reachable beyond the first sixty cards');assert.equal(new Set(complete.map(row=>row.id)).size,150);
 console.log(JSON.stringify({result:'PASS',checks:['transient source failure resumes at its original page','manual retry works without an app restart','empty public API settings do not create phantom pages','partial flags survive category filtering','failed cards receive a bounded recovery pass without duplicates','later pages remain reachable after a permanently bad card','cached pages and independent cursors remain stable']}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

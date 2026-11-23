'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
const year=new Date().getFullYear(),movie=(id,age,kind='movie')=>({id,title:id,_kind:kind,xfields:{year:String(year-age)}}),calls=[],saved={};
const rows=[movie('current',0),movie('previous',1),movie('older',2),movie('future',-1),movie('series',0,'series')];
const catalog={snapshot:()=>({mode:'auto',active:'pub'}),dedupe:items=>[...new Map(items.map(x=>[x.id,x])).values()],remember:()=>{},api:params=>{calls.push(params);return Promise.resolve({data:{items:params.page===1?rows:params.page===2?[movie('previous',1),movie('second-page',1)]:[],pagination:{page:params.page,pages:2},sources:['pub','lat']}});}};
const context={window:{WePlayCatalog:catalog},WePlayCatalogUnion:{fields:item=>item.xfields,kind:item=>item._kind,canonical:id=>id},localStorage:{getItem:key=>saved[key]||null,setItem:(key,value)=>saved[key]=value},Date,Promise,Number,JSON,Math,Error};
vm.runInNewContext(fs.readFileSync(path.join(source,'catalog-releases.js'),'utf8'),context);
(async()=>{
 const list=category=>catalog.api({action:'news',do:'list',category,page:1,limit:2}),next=category=>catalog.api({action:'news',do:'list',category,page:2,limit:2});
 const cartoons=await list('new-cartoons');assert.deepEqual(Array.from(cartoons.data.items,x=>x.id),['current','previous']);assert.equal(cartoons.data.pagination.pages,2);
 const more=await next('new-cartoons');assert.deepEqual(Array.from(more.data.items,x=>x.id),['second-page']);assert.equal(more.data.pagination.pages,2);
 assert.ok(!more.data.items.some(x=>['older','future','series'].includes(x.id)));
 const films=await list('new-films');assert.deepEqual(Array.from(films.data.items,x=>x.id),['current']);
 const serials=await list('new-series');assert.deepEqual(Array.from(serials.data.items,x=>x.id),['series']);
 assert.equal(catalog.releasePeriod('new-cartoons'),'Премьеры '+(year-1)+'–'+year+' годов');assert.equal(catalog.releasePeriod('new-films'),'Премьеры '+year+' года');
 const before=calls.length;await list('new-cartoons');assert.equal(calls.length,before);assert.ok(saved['lord.releases.v2']);
 const yearCalls=[],yearRows={106:[{id:'film2026',_kind:'movie',xfields:{year:'2026'}},{id:'old',_kind:'movie',xfields:{year:'2025'}}],13:[{id:'series2026',_kind:'series',xfields:{year:'2026'}}],109:[{id:'cartoon2026',_kind:'movie',xfields:{year:'2026'}},{id:'film2026',_kind:'movie',xfields:{year:'2026'}}],36:[{id:'animated2026',_kind:'series',xfields:{year:'2026'}}]};
 const yearCatalog={snapshot:catalog.snapshot,dedupe:catalog.dedupe,remember:()=>{},api:params=>{yearCalls.push(params);return Promise.resolve({data:{items:params.page===1?yearRows[params.category]:[{id:'extra2026',_kind:'movie',xfields:{year:'2026'}}],pagination:{page:params.page,pages:params.category===106?2:1},sources:['pub']}});}};
 const yearContext={...context,window:{WePlayCatalog:yearCatalog},Date:class extends Date{getFullYear(){return 2027;}}};vm.runInNewContext(fs.readFileSync(path.join(source,'catalog-releases.js'),'utf8'),yearContext);
 assert.equal(yearCatalog.yearCollections()[0].name,'2026 год');assert.equal(yearCatalog.releaseSections().length,3);assert.equal(yearCatalog.isReleaseCategory('year-2026'),false);
 const yearItems=[];for(let page=1;page<=3;page++){const j=await yearCatalog.api({action:'news',do:'list',category:'year-2026',page,limit:2});yearItems.push(...j.data.items);if(page===3)assert.equal(j.data.pagination.pages,3);}
 assert.deepEqual(yearItems.map(x=>x.id),['film2026','series2026','cartoon2026','animated2026','extra2026']);assert.ok(yearItems.every(x=>x.xfields.year==='2026'));assert.equal(yearCatalog.releasePeriod('year-2026'),'Премьеры 2026 года');assert.deepEqual(yearCalls.map(x=>[x.category,x.page]),[[106,1],[13,1],[109,1],[36,1],[106,2]]);
 let failedOnce=false;const recoveringCatalog={snapshot:catalog.snapshot,dedupe:catalog.dedupe,remember:()=>{},api:async params=>{if(params.category===13&&!failedOnce){failedOnce=true;throw Error('Temporary series outage');}return{data:{items:[{id:'category-'+params.category,_kind:params.category===13?'series':'movie',xfields:{year:'2026'}}],pagination:{page:params.page,pages:1},sources:['pub']}};}};
 const recoveringContext={...context,window:{WePlayCatalog:recoveringCatalog},localStorage:{getItem:()=>null,setItem:()=>{}}};vm.runInNewContext(fs.readFileSync(path.join(source,'catalog-releases.js'),'utf8'),recoveringContext);
 const recovered=[];for(let page=1;page<=5;page++){const j=await recoveringCatalog.api({action:'news',do:'list',category:'year-2026',page,limit:2});recovered.push(...j.data.items);if(j.data.pagination.pages===page)break;}
 assert.ok(recovered.some(item=>item.id==='category-13'),'A failed category must recover without reopening the year collection');assert.equal(new Set(recovered.map(item=>item.id)).size,4);
 console.log(JSON.stringify({result:'PASS',checks:['cartoons include current and previous year','older and future titles excluded','movie and series types remain distinct','pagination retains and deduplicates remaining cartoons','other release sections keep current year','period label matches selected tab','updated cache does not reuse narrow old lists','2026 collection includes movies, series, cartoons and animated series without duplicates','each media category keeps its own pagination cursor','2026 collection remains fixed in 2027 and does not add a home release section','temporary category failure does not remove its movies or series from the collection']}));
})().catch(e=>{console.error(e);process.exitCode=1;});

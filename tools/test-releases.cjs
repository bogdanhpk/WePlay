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
 console.log(JSON.stringify({result:'PASS',checks:['cartoons include current and previous year','older and future titles excluded','movie and series types remain distinct','pagination retains and deduplicates remaining cartoons','other release sections keep current year','period label matches selected tab','updated cache does not reuse narrow old lists']}));
})().catch(e=>{console.error(e);process.exitCode=1;});

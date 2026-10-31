const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
function app(backend={}){const c={window:{},Date,Promise,setTimeout,clearTimeout,AbortController,console};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(source,'catalog-union.js'),'utf8'),c);c.WePlayCatalogUnion=c.window.WePlayCatalogUnion;const union=c.WePlayCatalogUnion;c.WePlayCatalog={dedupe:union.combine,searchSources:()=>['primary','sb'],searchKnown:()=>[],searchDetails:()=>Promise.resolve(),...backend};vm.runInContext(fs.readFileSync(path.join(source,'search.js'),'utf8'),c);return{search:c.window.WePlaySearch,c};}
const item=(id,title,year='2002',kind='movie',original='')=>({id,title,_kind:kind,xfields:{year,original_title:original,kp_rating:'7'}});
const data=[item(3,'Три икса: Мировое господство','2017','movie','xXx: Return of Xander Cage'),item(2,'Три икса 2: Новый уровень','2005','movie','xXx: State of the Union'),item(4,'Три богатыря','2004'),{...item(5,'Секретный агент','2017'),full_story:'Три икса отправились в миссию'},item(1,'Три икса','2002','movie','xXx')];
let {search:s}=app();assert.equal(s.rank(data,'три икса')[0].id,1);assert.deepEqual(Array.from(s.rank(data,'три икса'),i=>i.id).sort(),[1,2,3]);assert.equal(s.rank(data,'  ТРИ   ИКСА!!! ')[0].id,1);assert.equal(s.rank(data,'xxx')[0].id,1);assert.deepEqual(Array.from(s.rank(data,'три икса 2'),i=>i.id),[2]);assert.deepEqual(Array.from(s.rank(data,'три икса 2002'),i=>i.id),[1]);assert.equal(s.rank(data,'nhb brcf')[0].id,1);
const titles=[item(20,'Интерстеллар','2014','movie','Interstellar'),item(21,'Аркейн','2021','series','Arcane'),item(22,'Ёлки','2010'),item(23,'Оно','2017'),item(24,'Она','2013'),item(25,'1917','2019'),item(26,'Бегущий по лезвию 2049','2017'),item(27,'Чудо-женщина: 1984','2020'),item(28,'Рик и Морти','2013','series','Rick and Morty'),item(29,'Амели','2001','movie','Amélie')];
for(const [q,id] of [['интерстелар',20],['аркеин',21],['Interstellar',20],['Елки',22],['Оно',23],['1917',25],['Бегущий по лезвию 2049',26],['Чудо женщина 1984',27],['морти рик',28],['Rick and Morty',28],['Amelie',29]])assert.equal(s.rank(titles,q)[0]?.id,id,q);
assert.equal(s.rank([titles[4]],'Оно').length,0,'no fuzzy short words');assert.equal(s.rank(data,'три икса 3').length,0,'no fuzzy numbers');assert.equal(s.rank(titles,'совсем нет такого запроса zxy').length,0);assert.equal(s.rank([item(71,'Чудо женщина','1984'),item(72,'Чудо женщина 1984','2020')],'Чудо женщина 1984')[0].xfields.year,'2020');assert.equal(s.parse('1917').year,null);assert.equal(s.parse('Бегущий 2049').year,null);assert.ok(s.plan('аркеин',titles).includes('Аркейн'));assert.ok(s.plan('три икса',[]).includes('икса'));assert.equal(s.clean('a'.repeat(200)).length,160);
const duplicate={...item('sb-100','Три икса'),_source:'sb'};assert.equal(s.rank([...data,duplicate],'три икса').filter(i=>s.normal(i.title)==='три икса').length,1);assert.equal(s.rank([item(40,'Оно','1990','series'),item(41,'Оно','2017')],'Оно').length,2,'keep remake and series separate');
(async()=>{
 let calls=[],updates=[];const a=app({searchRequest:(source,q,page,opts)=>{calls.push({source,q,page,opts});return new Promise((resolve,reject)=>{const t=setTimeout(()=>source==='sb'?reject(Error('offline')):resolve({data:{items:data,pagination:{pages:1}}}),source==='sb'?40:5);opts.signal?.addEventListener('abort',()=>{clearTimeout(t);reject(Object.assign(Error('cancelled'),{name:'AbortError'}));});});}}).search;
 const result=await a.search('три икса',{onUpdate:r=>updates.push(r)});assert.equal(result.items[0].id,1);assert.ok(result.partial);assert.ok(updates.some(u=>u.items.length&&u.pending));assert.equal(calls.length,2);assert.ok(calls.every(c=>c.opts.deadline>Date.now()-5000));
 const controller=new AbortController(),p=a.search('новый запрос',{signal:controller.signal});controller.abort();await assert.rejects(p,e=>e.name==='AbortError');
 let failures=0;const b=app({searchRequest:()=>{failures++;return Promise.reject(Error('offline'));}}).search;const offline=await b.search('три икса');assert.equal(failures,2);assert.equal(offline.sources.length,0);assert.equal(offline.items.length,0);assert.ok(offline.partial);
 let requests=0;const cached=app({searchRequest:()=>{requests++;return Promise.resolve({data:{items:data,pagination:{pages:1}}});}}).search;await cached.search('три икса');await cached.search('ТРИ ИКСА');assert.equal(requests,2,'case normalized complete cache');await cached.search('три икса',{force:true});assert.equal(requests,4,'explicit retry bypasses cache');
 const hiddenTitle=item(88,'Три икса');let aliasCalls=0;const aliases=app({searchRequest:()=>Promise.resolve({data:{items:[hiddenTitle],pagination:{pages:1}}}),searchDetails:(items,opts)=>{if(opts.aliases){aliasCalls++;items.forEach(i=>i.xfields.original_title='xXx');}return Promise.resolve();}}).search;const aliasResult=await aliases.search('xxx');assert.equal(aliasResult.items[0].id,88);assert.ok(aliasCalls>0,'retrieve original title omitted by provider listing');
 let pages=[];const paged=app({searchRequest:(source,q,page)=>{pages.push(page);return Promise.resolve({data:{items:page===1?[data[0]]:[data[4]],pagination:{pages:2}}});}}).search;const second=await paged.search('три икса');assert.equal(second.items[0].id,1);assert.ok(pages.includes(2));

 const sources=['primary','sb','pub','lat','vc'];
 const sourceItem=(source,id,title,year='2002')=>({...item(source+'-'+id,title,year),_source:source});
 const independently=[];
 const mixed=app({searchSources:()=>sources,searchRequest:(source,q,page)=>{
  independently.push({source,q,page});const candidate=source==='primary'||q==='икса'?[sourceItem(source,1,'Три икса')]:[];
  return new Promise(resolve=>setTimeout(()=>resolve({data:{items:candidate,pagination:{pages:1}}}),source==='primary'?1:5));
 }}).search;
 const allMatches=await mixed.search('три икса');
 assert.equal(allMatches.items.length,1);assert.equal(new Set(allMatches.items[0]._alternatives.map(i=>i._source)).size,5,'merge all five source records');
 for(const source of sources.slice(1))assert.ok(independently.some(c=>c.source===source&&c.q==='икса'),'fast exact match must not stop '+source+' variants');
 assert.equal(independently.filter(c=>c.source==='primary').length,1,'exact source does not repeat query variants');
 const paginationCalls=[];
 const eachPage=app({searchSources:()=>sources,searchRequest:(source,q,page)=>{
  paginationCalls.push({source,page});const rows=page===1?Array.from({length:25},(_,i)=>sourceItem(source,100+i,'Три икса '+(i+1))):[sourceItem(source,1,'Три икса')];
  return Promise.resolve({data:{items:rows,pagination:{pages:2}}});
 }}).search;
 const fairPages=await eachPage.search('три икса');
 assert.equal(fairPages.items[0].title,'Три икса');assert.equal(new Set(fairPages.items[0]._alternatives.map(i=>i._source)).size,5);
 for(const source of sources)assert.ok(paginationCalls.some(c=>c.source===source&&c.page===2),'next page must include '+source+' despite 24+ global results');
 assert.equal(paginationCalls.length,10,'one bounded first and second page per source');
 const isolatedFailures=[];
 const healthyAfterFailure=app({searchSources:()=>sources,searchRequest:(source,q,page)=>{
  isolatedFailures.push({source,q});if(source==='sb')return Promise.reject(Error('offline'));
  return Promise.resolve({data:{items:source==='primary'||q==='икса'?[sourceItem(source,1,'Три икса')]:[],pagination:{pages:1}}});
 }}).search;
 const partialAll=await healthyAfterFailure.search('три икса');assert.ok(partialAll.partial);assert.equal(partialAll.sources.length,4);
 assert.equal(isolatedFailures.filter(c=>c.source==='sb').length,1,'failed source does not block or loop');
 assert.ok(isolatedFailures.some(c=>c.source==='vc'&&c.q==='икса'),'healthy source continues after another fails');
 console.log(JSON.stringify({result:'PASS',checks:['exact titles precede sequels; description-only matches excluded','case, spacing, punctuation, ё and Latin accents normalized','original titles, keyboard layout and bounded typo tolerance','part numbers, explicit years, 1917 and titles containing 1984/2049','source deduplication preserves remakes and media types','progressive source results, isolated failures and cancellation','bounded requests, page two, normalized cache and forced retry','all five sources finish query variants independently; exact results merge','every source gets pagination despite 24+ global results','one offline source does not cancel healthy-source variants']}));
})().catch(e=>{console.error(e);process.exit(1);});

const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
function app(backend={}){const c={window:{},Date,Promise,AbortController};vm.createContext(c);for(const file of ['catalog-union.js','collections-index.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),c);Object.assign(c,c.window);c.WePlayTMDB={nextPart:()=>Promise.resolve(null)};c.WePlayCatalog={searchKnown:()=>[],...backend.catalog};c.WePlaySearch={search:()=>Promise.resolve({items:[]}),...backend.search};vm.runInContext(fs.readFileSync(path.join(source,'next-media.js'),'utf8'),c);return c.window.WePlayNextMedia;}
const movie=(id,title,year,tmdb)=>({id,title,_kind:'movie',xfields:{year:String(year),...(tmdb?{tmdb_id:String(tmdb)}:{})}});
const matrix=movie('a','Матрица',1999),reloaded=movie('b','Матрица: Перезагрузка',2003),revolutions=movie('c','Матрица: Революция',2003);
(async()=>{
 const p=app();assert.equal(p.indexed(matrix).next.id,'604');assert.equal(p.indexed(reloaded).next.id,'605');assert.equal(p.indexed(revolutions).next.id,'624860');assert.equal(p.indexed(movie('last','Матрица: Воскрешение',2021,'624860')).next,null);assert.equal(p.indexed(movie('wrong','Матрица',2020)).known,false);assert.equal(p.indexed({...matrix,_kind:'series'}).known,false);
 assert.equal(p.matches(movie('wrong','Другой фильм',2003,'605'),p.indexed(matrix).next),false,'conflicting TMDB ID does not match same release year');
 let calls=[];const resolver=app({search:{search:(q)=>{calls.push(q);return Promise.resolve({items:[movie('fake','Матрица: Перезагрузка',2004),{...reloaded,_kind:'series'},reloaded]});}}});
 const found=await resolver.resolve(matrix);assert.equal(found.item.id,'b');assert.equal(found.kind,'movie');assert.equal(calls[0],'Матрица: Перезагрузка 2003');
 const cached=app({catalog:{searchKnown:()=>[reloaded]},search:{search:()=>{throw Error('Unnecessary network');}}});assert.equal((await cached.resolve(matrix)).item.id,'b');
 const unavailable=app();assert.equal(await unavailable.resolve(matrix),null,'do not jump over unavailable next part');assert.equal(await unavailable.resolve({...matrix,_kind:'series'}),null);
 const controller=new AbortController();controller.abort();await assert.rejects(async()=>p.resolve(matrix,{signal:controller.signal}),e=>e.name==='AbortError');
 console.log(JSON.stringify({result:'PASS',checks:['Matrix franchise release order and final part','strict movie/year/TMDB identity excludes remakes and series','next movie resolved through catalog search; cached candidates reused','missing next part does not skip to third film','cancelled request cannot select a movie']}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

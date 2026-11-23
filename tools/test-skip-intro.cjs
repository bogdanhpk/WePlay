'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'),'skip-intro.js'),'utf8'),item={xfields:{imdb_id:'tt5290382'}},episode={season:1,episode:2},duration=3600000;
function env(reply){const calls=[],c={URL,Promise,Map,Date,Number,AbortController,setTimeout,clearTimeout,WePlayCatalogUnion:{identifiers:item=>({imdb:item?.xfields?.imdb_id})},WePlayNetwork:{request:async(url,init,options)=>{calls.push({url,init,options});assert.equal(options.media,true);assert.equal(init.credentials,'omit');assert.equal(options.maxBytes,32768);return JSON.stringify(await reply(new URL(url),options));}}};c.window=c;vm.createContext(c);vm.runInContext(source,c);return{api:c.WePlayIntro,calls,c};}
const data={imdb_id:'tt5290382',season:1,episode:2},intro={start_ms:210000,end_ms:300000,match:'exact',adjusted:false,offset_ms:0,confidence:.9};
(async()=>{
 const a=env(()=>({...data,segments:{intro}})),range=await a.api.lookup(item,episode,duration);assert.equal(range.end,300000);assert.equal(range.source,'SkipDB');await a.api.lookup(item,episode,duration);assert.equal(a.calls.length,1);await a.api.lookup(item,episode,duration+20000);assert.equal(a.calls.length,2,'different stream durations cannot reuse marks');
 const shifted=env(()=>({...data,segments:{intro:{...intro,match:'shifted',adjusted:true,offset_ms:-13000}}}));assert(await shifted.api.lookup(item,episode,duration));
 for(const patch of [{match:'out-of-range'},{confidence:.2},{confidence:undefined},{offset_ms:-20000},{end_ms:3595000},{start_ms:-1},{start_ms:0,end_ms:500},{start_ms:NaN}]){
  const b=env(()=>({...data,segments:{intro:{...intro,...patch}}}));assert.equal(await b.api.lookup(item,episode,duration),null,JSON.stringify(patch));assert.equal(b.calls.length,1,'a known mismatched cut must not fall back to generic marks');
 }
 const fallback=env(url=>({...data,...(url.host==='api.skipdb.tv'?{segments:{intro:null}}:{media_type:'tv',intro:{start_sec:210,end_sec:300,confidence:.9}})}));assert.equal((await fallback.api.lookup(item,episode,duration)).source,'IntroDB');assert.equal(fallback.calls.length,2);
 for(const patch of [{no_intro:true},{season:2},{imdb_id:'tt0000000'},{is_movie:true},{intro:{start_ms:10000,end_ms:50000}}]){
  const b=env(url=>({...data,...(url.host==='api.skipdb.tv'?{segments:{intro:null}}:{intro:{...intro},...patch})}));assert.equal(await b.api.lookup(item,episode,duration),null);
 }
 const b=env(()=>{throw Error('offline')});assert.equal(await b.api.lookup(item,episode,duration),null);const abort=new AbortController();abort.abort();assert.equal(await b.api.lookup(item,episode,duration,abort.signal),null);assert.equal(await b.api.lookup(item,{season:0,episode:1},duration),null);assert.equal(await b.api.lookup({},episode,duration),null);
 assert.equal(a.api.valid(a.api.read({introStartMs:0,introEndMs:90000}),duration),true);assert.equal(a.api.read({intro_start_seconds:12,intro_end_seconds:70}).end,70000);assert.equal(a.api.read({introRange:{start:12000,end:70000}}).end,70000);assert.equal(a.api.valid(a.api.read({intro:[0,90]}),duration),false);
 const c=env(()=>({...data,segments:{intro}}));c.c.WePlayTMDB={available:()=>true,indexed:()=>({imdbId:'tt5290382'})};assert.equal((await c.api.lookup({},episode,duration)).end,300000);
 console.log(JSON.stringify({result:'PASS',checks:['exact episode identity and duration-specific cache','duration-matched and conservative shifted marks','no timestamps guessed for a different cut or missing data','IntroDB fallback, confidence and confirmed absence','bounded optional playback metadata; offline and cancellation','explicit milliseconds/seconds; malformed markers rejected','IMDb identity from shared artwork metadata']}));
})().catch(e=>{console.error(e);process.exitCode=1});

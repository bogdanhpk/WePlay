'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),calls=[],cancelled=[],responses=new Map();
const c={AbortController,TextDecoder,Uint8Array,Promise,Set,setTimeout,clearTimeout,CustomEvent,dispatchEvent:()=>{},WePlayUpdateCore:{},fetch:async(url,init)=>{
 calls.push(url);const value=responses.get(url);
 if(value==='slow')return new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>{cancelled.push(url);reject(Object.assign(new Error('aborted'),{name:'AbortError'}));});});
 if(value==='body')return{ok:true,headers:new Headers(),text:()=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>{cancelled.push(url);reject(Error('body cancelled'));}))};
 return{ok:true,headers:new Headers({'content-length':String(value?.length||0)}),text:async()=>value||'ok',json:async()=>({ok:true}),arrayBuffer:async()=>new TextEncoder().encode(value||'ok').buffer};
}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'),'network.js'),'utf8'),c);
(async()=>{
 const n=c.WePlayNetwork;
 responses.set('cover','slow');responses.set('metadata','body');
 const cover=n.request('cover',{}, {timeout:500}),metadata=n.request('metadata',{}, {timeout:500});await wait(10);n.setPlayback(true);await wait(10);
 assert.deepEqual(cancelled.sort(),['cover','metadata']);assert.equal(n.snapshot().backgroundActive,0);
 const queued=n.request('queued',{}, {timeout:20}),controller=new AbortController(),removed=n.request('removed',{}, {signal:controller.signal}).catch(e=>e.name);controller.abort();
 await wait(60);assert.equal(calls.length,2,'paused time must not consume request timeouts');assert.equal(await removed,'AbortError');
 assert.equal(await n.request('video',{}, {media:true}),'ok');assert.equal(calls.filter(x=>x==='video').length,1);
 const during=calls.length;await wait(20);assert.equal(calls.length,during,'no background requests during playback');
 responses.set('cover','cover ready');responses.set('metadata','metadata ready');n.setPlayback(false);assert.deepEqual(await Promise.all([cover,metadata,queued]),['cover ready','metadata ready','ok']);
 assert.equal(calls.filter(x=>x==='cover').length,2,'interrupted work restarts exactly once');assert.equal(calls.includes('removed'),false);assert.equal(n.snapshot().backgroundActive,0);
 responses.set('large','123456');await assert.rejects(c.WePlayUpdateCore.request('large',3,100),/size limit/);
 let foregroundAborted=false,complete;const media=n.run(signal=>new Promise(resolve=>{complete=resolve;signal.addEventListener('abort',()=>foregroundAborted=true);}),{media:true});await wait(0);n.setPlayback(true);await wait(0);assert.equal(foregroundAborted,false);complete('played');assert.equal(await media,'played');n.setPlayback(false);
 console.log(JSON.stringify({result:'PASS',checks:['active requests and response bodies abort','queued time does not expire timeouts','media bypasses the pause','background resumes without duplicates','cancelled jobs stay cancelled','installed-shell updates respect size limits']}));
})().catch(e=>{console.error(e);process.exit(1);});

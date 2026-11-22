'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(process.env.WEPLAY_APP_SOURCE||path.join(__dirname,'../app'));
function atom(type,...parts){const body=Buffer.concat(parts),head=Buffer.alloc(8);head.writeUInt32BE(body.length+8);head.write(type,4);return Buffer.concat([head,body]);}
function track(type,width,height,codedWidth=width,codedHeight=height){const tkhd=Buffer.alloc(84);tkhd.writeUInt32BE(width*65536,76);tkhd.writeUInt32BE(height*65536,80);const handler=Buffer.alloc(12);handler.write(type,8);const visual=Buffer.alloc(78);visual.writeUInt16BE(codedWidth,24);visual.writeUInt16BE(codedHeight,26);const count=Buffer.alloc(8);count.writeUInt32BE(1,4);return atom('trak',atom('tkhd',tkhd),atom('mdia',atom('hdlr',handler),atom('minf',atom('stbl',atom('stsd',count,atom('avc1',visual))))));}
function movie(width,height,tail=false){const ftyp=atom('ftyp',Buffer.alloc(16)),moov=atom('moov',track('soun',640,480),track('vide',width,height));if(!tail)return Buffer.concat([ftyp,moov]);const mdat=Buffer.alloc(1024*1024);mdat.writeUInt32BE(mdat.length);mdat.write('mdat',4);return Buffer.concat([ftyp,mdat,moov]);}
const bodies=new Map(),calls=[],store=new Map(),context={URL,AbortController,CustomEvent,TextDecoder,Response,Uint8Array,Date,Promise,setTimeout,clearTimeout,btoa:s=>Buffer.from(s).toString('base64'),localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},dispatchEvent:()=>{},fetch:async(raw,init)=>{
 calls.push({url:raw,range:init.headers&&init.headers.Range});const body=bodies.get(raw);if(body===undefined)throw Error('offline');
 if(typeof body==='string')return new Response(body);
 const range=/bytes=(\d+)-(\d+)/.exec(init.headers?.Range||'');assert(range,'metadata must use a bounded Range');const from=Number(range[1]),to=Math.min(Number(range[2]),body.length-1);if(from>to)return new Response('',{status:416});const bytes=body.subarray(from,to+1);assert(bytes.length<=262144);
 return new Response(bytes,{status:206,headers:{'content-range':`bytes ${from}-${to}/${body.length}`,'content-length':String(bytes.length)}});
}};context.window=context;vm.createContext(context);for(const file of ['network.js','quality.js'])vm.runInContext(fs.readFileSync(path.join(source,file),'utf8'),context);
(async()=>{
 const Q=context.WePlayQuality,plain={transport:'plain'};
 assert.equal(Q.height({width:3840,height:1388}),2160);assert.equal(Q.height({width:2560,height:900}),1440);assert.equal(Q.height({width:3840,height:1080}),1080);
 assert.equal(Q.mp4Dimensions(new Uint8Array(atom('moov',track('vide',640,360,3840,1600)))).width,3840);assert.equal(Q.mp4Dimensions(new Uint8Array(movie(3840,1600))).width,3840);assert.equal(Q.mp4Dimensions(new Uint8Array(movie(3840,1600))).height,1600);assert.equal(Q.mp4Dimensions(new Uint8Array(Buffer.from('not video'))),null);
 bodies.set('https://fixture.invalid/main.m3u8','#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x800\n1080.m3u8');bodies.set('https://fixture.invalid/4k',movie(3840,1600,true));
 let found=await Q.probe({...plain,url:'https://fixture.invalid/main.m3u8',format:'hls',renditions:[{url:'https://fixture.invalid/4k',format:'mp4',hint:2160}]});
 assert.deepEqual(Array.from(found,x=>x.height),[1080,2160]);assert.equal(found[1].url,'https://fixture.invalid/4k');assert.equal(found[1].format,'mp4');assert(calls.some(x=>x.range?.startsWith('bytes=1048600-')));assert(!calls.some(x=>/1080.m3u8$/.test(x.url)));
 bodies.set('https://fixture.invalid/fake4k',movie(1280,720));found=await Q.probe({...plain,url:'https://fixture.invalid/fake4k',format:'mp4'});assert.deepEqual(Array.from(found,x=>x.height),[720]);
 bodies.set('https://fixture.invalid/complete.m3u8','#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=3840x1600\n2160.m3u8');const before=calls.length;
 found=await Q.probe({...plain,url:'https://fixture.invalid/complete.m3u8',renditions:[{url:'https://fixture.invalid/never-fetch',format:'mp4',hint:2160}]});assert.equal(found[0].height,2160);assert.equal(calls.length,before+1);
 await assert.rejects(Q.probe({...plain,url:'https://fixture.invalid/offline.m3u8'}));
 console.log(JSON.stringify({result:'PASS',checks:['MP4 video track dimensions exclude audio tracks','tail moov is located with bounded metadata ranges','HLS and direct MP4 variants combine without segment downloads','a 4K URL label cannot turn a 720p file into 4K','verified HLS resolutions skip redundant MP4 probes','failed metadata requests remain retryable']}));
})().catch(e=>{console.error(e);process.exitCode=1;});

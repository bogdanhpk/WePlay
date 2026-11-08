#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const args=process.argv.slice(2),option=(name,fallback)=>{const at=args.indexOf('--'+name);return at<0?fallback:args[at+1];};
const root=path.resolve(option('source',path.join(__dirname,'../app'))),tokenFile=option('token-file','');
let token=process.env.WEPLAY_TMDB_READ_TOKEN||'';
if(tokenFile){const raw=fs.readFileSync(tokenFile,'utf8').trim();try{token=JSON.parse(raw).readToken||'';}catch{token=raw;}}
if(!token)throw Error('Set WEPLAY_TMDB_READ_TOKEN or pass --token-file. Credentials are never written to the index.');
const c={window:{}};for(const file of ['tmdb.js','tmdb-index.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),c);
const index=c.window.WEPLAY_TMDB_INDEX;let next=0,succeeded=0,withRussian=0,failures=0;
async function worker(){
 for(let at;(at=next++)<index.entries.length;){const entry=index.entries[at],type=entry.kind==='series'?'tv':'movie';try{
  const response=await fetch('https://api.themoviedb.org/3/'+type+'/'+entry.art.tmdbId+'/images?include_image_language=ru,en,null',{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();if(String(data.id)!==String(entry.art.tmdbId))throw Error('Identity mismatch');
  const candidates=c.window.WePlayTMDB.titleLogoCandidates(data.logos);entry.art.titleLogoCandidates=candidates;entry.art.titleLogos=candidates.slice(0,3).map(logo=>logo.url);if(candidates.some(logo=>logo.language==='ru'))withRussian++;succeeded++;
 }catch(error){failures++;console.error(JSON.stringify({type,id:entry.art.tmdbId,error:error.message}));}}
}
(async()=>{await Promise.all([worker(),worker(),worker()]);if(failures||!succeeded)throw Error('Index was not written: some TMDB records could not be verified.');index.titleLogoPolicy='ru-first-v1';index.logosUpdatedAt=new Date().toISOString();fs.writeFileSync(path.join(root,'tmdb-index.js'),'window.WEPLAY_TMDB_INDEX = '+JSON.stringify(index)+';\n');console.log(JSON.stringify({result:'PASS',succeeded,withRussian,failures,privateCredentialsExcluded:true}));})().catch(error=>{console.error(error.message);process.exit(1);});

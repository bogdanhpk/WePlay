#!/usr/bin/env node
/* Build immutable, signed update artifacts using only Node's standard library. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const args=process.argv.slice(2);function opt(name,fallback){const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];}
const root=path.resolve(opt('source','app')),out=path.resolve(opt('out','updates')),version=opt('version',''),keyPath=opt('key',process.env.WEPLAY_OTA_SIGNING_KEY),checkOnly=args.includes('--check');
if(!/^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(version))throw Error('Specify --version MAJOR.MINOR.PATCH');
const n=version.split('.').map(Number),sequence=n[0]*100000000+n[1]*10000+n[2];
const original=fs.readFileSync(path.join(root,'app.html'),'utf8'),body=original.match(/<body[^>]*>([\s\S]*?)<\/body>/i);if(!body)throw Error('Missing app.html body');
const scripts=[...original.matchAll(/<script\s+src="([^"]+)"[^>]*><\/script>/g)].map(m=>m[1]).filter(v=>v!=='settings.js'&&!v.startsWith('$WEBAPIS/'));
const styles=[...original.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(m=>m[1]);
const html=body[1].replace(/\s*<script\b[^>]*>[\s\S]*?<\/script>/gi,'').trim();
const names=[...scripts,...styles];for(const dir of ['assets','fonts']){const walk=d=>{for(const e of fs.readdirSync(path.join(root,d),{withFileTypes:true})){const name=d+'/'+e.name;if(e.isDirectory())walk(name);else if(/\.(?:png|jpg|jpeg|webp|svg|ttf|woff2?)$/.test(name))names.push(name);}};walk(dir);}
const blocked=/settings\.js|update-config\.js|update-core\.js|updater\.js|(?:^|\/)(?:\.env|credentials)|\.(?:pem|p12|pfx|key|wgt|xml)$/i;
const files={};for(const name of new Set(names)){if(blocked.test(name)||name.includes('..')||path.isAbsolute(name))throw Error('Private or native file excluded: '+name);const b=fs.readFileSync(path.join(root,name)),encoding=/\.(?:js|css|svg)$/.test(name)?'utf8':'base64';files[name]={encoding,content:b.toString(encoding==='utf8'?'utf8':'base64')};}
const bundle={schema:1,version,sequence,html,styles,scripts,files},bodyText=JSON.stringify(bundle),bytes=Buffer.from(bodyText);if(bytes.length>6*1024*1024)throw Error('Update exceeds 6 MiB');
const payload={path:'releases/'+version+'/bundle.json',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
if(checkOnly){console.log(JSON.stringify({result:'PASS',version,files:Object.keys(files).length,bytes:bytes.length,privateFilesExcluded:true}));process.exit(0);}
if(!keyPath)throw Error('Specify --key private-key.pem or WEPLAY_OTA_SIGNING_KEY');
const key=crypto.createPrivateKey(fs.readFileSync(keyPath)),configText=fs.readFileSync(path.join(root,'update-config.js'),'utf8'),publicKey=crypto.createPublicKey(key).export({format:'jwk'}),config=JSON.parse(configText.slice(configText.indexOf('{'),configText.lastIndexOf('}')+1));
if(publicKey.x!==config.publicKey.x||publicKey.y!==config.publicKey.y)throw Error('Signing key does not match installed public key');
if(sequence<=config.bundledSequence)throw Error('OTA version must be newer than bundled version');
const manifest={schema:1,app:'LordKim001.LordTV',channel:'stable',version,sequence,minShell:1,createdAt:new Date().toISOString(),payload},signed=JSON.stringify(manifest),signature=crypto.sign('sha256',Buffer.from(signed),{key,dsaEncoding:'ieee-p1363'}).toString('base64'),envelope=JSON.stringify({signed,signature},null,2)+'\n';
const releaseDir=path.join(out,'releases',version);fs.mkdirSync(releaseDir,{recursive:true});const releaseFile=path.join(releaseDir,'bundle.json');if(fs.existsSync(releaseFile)&&!fs.readFileSync(releaseFile).equals(bytes))throw Error('Release already exists: publish a new version');
fs.writeFileSync(releaseFile,bytes);fs.writeFileSync(path.join(releaseDir,'manifest.json'),envelope);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'stable.json.tmp'),envelope);fs.renameSync(path.join(out,'stable.json.tmp'),path.join(out,'stable.json'));
console.log(JSON.stringify({result:'PASS',version,files:Object.keys(files).length,bytes:bytes.length,sha256:payload.sha256,privateFilesExcluded:true}));

#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.resolve(process.argv[2]||path.join(root,fs.existsSync(path.join(root,'../app/app.html'))?'../app':'../WePlay-Tizen'));
const version=Object.fromEntries(fs.readFileSync(path.join(root,'version.properties'),'utf8').trim().split(/\r?\n/).filter(Boolean).map(line=>line.split('=')));
const target=path.join(root,'app/src/main/assets/weplay');
if(!fs.existsSync(path.join(source,'app.html'))){
  if(!process.argv[2]&&fs.existsSync(path.join(target,'index.html'))){console.log('Using the bundled WePlay interface.');process.exit(0);}
  throw new Error('WePlay app.html was not found. Pass the Tizen app source directory.');
}
let html=fs.readFileSync(path.join(source,'app.html'),'utf8');
html=html.replace(/\s*<script src="\$WEBAPIS[^>]+><\/script>/,'')
  .replace('width=1920, initial-scale=1','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
  .replace('Samsung Tizen','Android TV').replace('weplay-icon.png','weplay-icon-orange.png')
  .replace('<script src="settings.js"></script>','<script src="android.js"></script>\n  <script src="settings.js"></script>');
fs.mkdirSync(target,{recursive:true});
const files=new Set(Array.from(html.matchAll(/(?:src|href)="([^"$]+\.(?:js|css|png))"/g),m=>m[1]).filter(p=>p!=='android.js'&&p!=='settings.js'));
for(const dir of ['assets','fonts','vendor']){
  function walk(rel){for(const entry of fs.readdirSync(path.join(source,rel),{withFileTypes:true})){const item=rel+'/'+entry.name;if(entry.isDirectory())walk(item);else files.add(item);}}
  walk(dir);
}
for(const file of files){
  const destination=path.join(target,file);fs.mkdirSync(path.dirname(destination),{recursive:true});
  let bytes=fs.readFileSync(path.join(source,file));
  if(file==='app.js'){
    const before="try{tizen.application.getCurrentApplication().exit();}catch(ignore){toast('Вы уже на главной');}";
    if(!bytes.toString().includes(before))throw new Error('Review Android exit adapter: source changed');
    bytes=Buffer.from(bytes.toString().replace(before,'WePlayAndroid.exit();'));
  }
  if(file==='catalog.js'){
    bytes=Buffer.from(bytes.toString().replace('function original(params,options){',"function original(params,options){\n    if(!WEPLAY_SETTINGS.apiToken)return Promise.reject(new Error('Каталог без ключа: используются другие источники.'));"));
  }
  if(file==='updates-ui.js')bytes=fs.readFileSync(path.join(root,'platform/android-updates.js'));
  if(file==='updates.css')bytes=Buffer.concat([bytes,Buffer.from('\n'),fs.readFileSync(path.join(root,'platform/android-updates.css'))]);
  fs.writeFileSync(destination,bytes);
}
fs.copyFileSync(path.join(root,'platform/android.js'),path.join(target,'android.js'));
fs.writeFileSync(path.join(target,'settings.js'),"window.WEPLAY_SETTINGS = { apiToken: '', tmdbReadToken: '' };\n");
fs.writeFileSync(path.join(target,'index.html'),html);
fs.cpSync(path.join(root,'licenses'),path.join(target,'licenses'),{recursive:true});
fs.copyFileSync(path.join(source,'weplay-icon-orange.png'),path.join(root,'app/src/main/res/drawable/weplay_icon.png'));
const manifest={platform:'android-tv',version:version.versionName,interfaceVersion:version.interfaceVersion,files:[]};
for(const file of [...files,'settings.js','android.js','index.html',...fs.readdirSync(path.join(root,'licenses')).map(name=>'licenses/'+name)].sort()){
  const bytes=fs.readFileSync(path.join(target,file));manifest.files.push({path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
fs.writeFileSync(path.join(root,'web-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({files:manifest.files.length,settings:'empty; no personal credentials',interface:manifest.interfaceVersion}));

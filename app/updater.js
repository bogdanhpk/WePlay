/* Boot downloaded UI in the widget itself, keeping native APIs and local viewing history. */
(function(){
  'use strict';
  var C=window.WEPLAY_UPDATE_CONFIG,V=window.WePlayUpdateCore,DB='weplay.updates.v1',STORE='state';
  var state={active:null,previous:null,pending:null,trial:null,blocked:[],highest:C.bundledSequence},database=null,assets={},booting=false,bootFailed=false,readyCalled=false,confirmed=false,currentVersion=C.bundledVersion,currentSource='bundled',bootSequence=null,checking=null,lastCheck=0,timer=null,watchdog=null;
  function recordSequence(record){try{return JSON.parse(record.envelope.signed).sequence;}catch(ignore){return 0;}}
  function fresh(){return{active:null,previous:null,pending:null,trial:null,blocked:[],highest:C.bundledSequence};}
  function open(){return new Promise(function(resolve,reject){var finished=false,deadline=setTimeout(function(){if(!finished){finished=true;reject(new Error('Update storage timed out'));}},1800),request=indexedDB.open(DB,1);request.onupgradeneeded=function(){if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};request.onerror=function(){if(finished)return;finished=true;clearTimeout(deadline);reject(new Error('Update storage unavailable'));};request.onblocked=request.onerror;request.onsuccess=function(){if(finished){request.result.close();return;}finished=true;clearTimeout(deadline);database=request.result;database.onversionchange=function(){database.close();database=null;};resolve(database);};});}
  function read(){return open().then(function(db){return new Promise(function(resolve,reject){var t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).get('current');r.onsuccess=function(){var value=r.result;state=value&&Array.isArray(value.blocked)?value:fresh();state.highest=Math.max(C.bundledSequence,Number(state.highest)||0);resolve(state);};r.onerror=function(){reject(new Error('Update cache unavailable'));};});});}
  function save(next){return new Promise(function(resolve,reject){if(!database)return reject(new Error('Update storage unavailable'));var t;try{t=database.transaction(STORE,'readwrite');t.objectStore(STORE).put(next,'current');}catch(error){reject(error);return;}t.oncomplete=function(){state=next;resolve(next);};t.onerror=t.onabort=function(){reject(new Error('Update could not be saved'));};});}
  function safeFlag(value){try{if(value)sessionStorage.setItem('lord.updates.safeBoot','1');else sessionStorage.removeItem('lord.updates.safeBoot');}catch(ignore){}}
  function isSafe(){try{return sessionStorage.getItem('lord.updates.safeBoot')==='1';}catch(ignore){return false;}}
  function rejected(sequence){var blocked=state.blocked.slice();if(sequence&&blocked.indexOf(sequence)<0)blocked.push(sequence);return blocked.slice(-24);}
  function startupFailure(){
    if(bootFailed||confirmed)return;bootFailed=true;clearTimeout(watchdog);
    if(currentSource!=='remote'){showFailure();return;}
    safeFlag(true);var next=Object.assign({},state,{active:state.previous,previous:null,pending:null,trial:null,blocked:rejected(bootSequence)});
    save(next).catch(function(){}).then(function(){location.reload();});
  }
  function showFailure(){var box=document.getElementById('weplay-startup');if(!box)return;box.textContent='Не удалось открыть WePlay';var b=document.createElement('button');b.textContent='Повторить';b.onclick=function(){location.reload();};box.appendChild(b);b.focus();}
  function mime(name){return /\.svg$/.test(name)?'image/svg+xml':/\.png$/.test(name)?'image/png':/\.webp$/.test(name)?'image/webp':/\.jpe?g$/.test(name)?'image/jpeg':/\.ttf$/.test(name)?'font/ttf':/\.woff2?$/.test(name)?'font/woff2':'application/octet-stream';}
  function asset(name){return assets[name]||name;}
  function styles(bundle){
    Object.keys(bundle.files).forEach(function(name){if(/\.(?:js|css)$/.test(name))return;var f=bundle.files[name],bytes=f.encoding==='base64'?V.base64(f.content):V.bytes(f.content);assets[name]=URL.createObjectURL(new Blob([bytes],{type:mime(name)}));});
    bundle.styles.forEach(function(name){var css=bundle.files[name].content.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g,function(all,quote,path){return assets[path]? 'url("'+assets[path]+'")':all;}),style=document.createElement('style');style.textContent=css;style.setAttribute('data-weplay-update','true');document.head.appendChild(style);});
    document.querySelectorAll('link[data-weplay-bundled]').forEach(function(link){link.disabled=true;});
  }
  function mount(html){var doc=new DOMParser().parseFromString(html,'text/html');Array.prototype.slice.call(doc.body.children).forEach(function(node){var copy=document.importNode(node,true);copy.querySelectorAll('[src]').forEach(function(n){var raw=n.getAttribute('src');if(assets[raw])n.setAttribute('src',assets[raw]);});document.body.appendChild(copy);});}
  function script(url){return new Promise(function(resolve,reject){var n=document.createElement('script');n.onload=function(){n.onload=n.onerror=null;resolve();};n.onerror=function(){reject(new Error('Application module unavailable'));};n.src=url;document.body.appendChild(n);});}
  function run(list,bundle){return list.reduce(function(chain,name){return chain.then(function(){if(bootFailed)throw new Error('Application failed');if(!bundle)return script(name);var uri=URL.createObjectURL(new Blob([bundle.files[name].content],{type:'application/javascript'}));return script(uri).finally(function(){URL.revokeObjectURL(uri);});});},Promise.resolve());}
  function boot(selected){
    currentSource=selected?'remote':'bundled';currentVersion=selected?selected.manifest.version:C.bundledVersion;bootSequence=selected?selected.manifest.sequence:null;booting=true;
    var template=document.getElementById('weplay-bundled-ui'),html=selected?selected.bundle.html:template.innerHTML,scripts=selected?selected.bundle.scripts:window.WEPLAY_BUNDLED_SCRIPTS;
    if(selected)styles(selected.bundle);mount(html);watchdog=setTimeout(startupFailure,15000);return run(scripts,selected&&selected.bundle).catch(startupFailure);
  }
  function select(attempt){
    var trial=state.trial;if(trial){state=Object.assign({},state,{active:state.previous,previous:null,pending:null,trial:null,blocked:rejected(trial)});}
    var candidate=state.pending&&recordSequence(state.pending)>C.bundledSequence?state.pending:state.active&&recordSequence(state.active)>C.bundledSequence?state.active:null;
    if(isSafe()){safeFlag(false);candidate=state.active&&recordSequence(state.active)>C.bundledSequence?state.active:null;}
    if(!candidate)return save(Object.assign({},state,{trial:null})).catch(function(){}).then(function(){return null;});
    return V.release(candidate,C).then(function(value){if(state.blocked.indexOf(value.manifest.sequence)>=0)throw new Error('Blocked update');var next=Object.assign({},state,{previous:candidate===state.pending?state.active:state.previous,active:candidate,pending:null,trial:value.manifest.sequence});return save(next).then(function(){return value;});}).catch(function(){var n=recordSequence(candidate),next=Object.assign({},state,{active:candidate===state.active?state.previous:state.active,previous:null,pending:null,trial:null,blocked:rejected(n)});return save(next).catch(function(){}).then(function(){return attempt<2?select(attempt+1):null;});});
  }
  function ready(){
    if(readyCalled||bootFailed)return;readyCalled=true;
    setTimeout(function(){if(bootFailed)return;var nav=document.querySelector('#navigation button'),content=document.getElementById('content');if(!nav||!content||!content.children.length){startupFailure();return;}
      clearTimeout(watchdog);var next=Object.assign({},state,{trial:null});save(next).catch(function(){}).then(function(){if(bootFailed)return;confirmed=true;booting=false;safeFlag(false);var box=document.getElementById('weplay-startup');if(box)box.remove();schedule(5000);});
    },1800);
  }
  function busy(){return document.hidden||window.WePlayNativePlayer&&WePlayNativePlayer.active||document.body.classList.contains('playback-open');}
  function schedule(ms){clearTimeout(timer);timer=setTimeout(function(){if(busy()){schedule(60000);return;}check().finally(function(){schedule(3600000);});},ms);}
  function check(){
    if(checking)return checking;if(!confirmed||busy())return Promise.resolve({state:'deferred'});lastCheck=Date.now();
    checking=V.request(C.manifestURL,V.MAX_MANIFEST,6000).then(function(body){var envelope=JSON.parse(body);return V.verify(envelope,C).then(function(m){var highest=Math.max(state.highest||0,C.bundledSequence,recordSequence(state.active),recordSequence(state.pending));if(m.sequence<=highest||state.blocked.indexOf(m.sequence)>=0)return{state:'current'};return V.request(V.url(C.manifestURL,m),V.MAX_BUNDLE,20000).then(function(payload){var record={envelope:envelope,body:payload};return V.release(record,C).then(function(){var next=Object.assign({},state,{pending:record,previous:null,highest:m.sequence});return save(next).then(function(){window.dispatchEvent(new CustomEvent('weplay:update-ready',{detail:{version:m.version}}));return{state:'ready',version:m.version};});});});});}).catch(function(){return{state:'unavailable'};}).finally(function(){checking=null;});return checking;
  }
  window.WePlayRuntime={asset:asset,ready:ready,check:check,applyUpdate:function(){if(!confirmed||busy())return Promise.resolve({state:'deferred'});if(!state.pending)return Promise.resolve({state:'missing'});location.reload();return Promise.resolve({state:'restarting'});},snapshot:function(){return{shell:C.shell,packageVersion:C.bundledVersion,version:currentVersion,source:currentSource,confirmed:confirmed,pendingVersion:state.pending?JSON.parse(state.pending.envelope.signed).version:null,checking:!!checking,lastCheck:lastCheck};}};
  window.addEventListener('error',function(event){if(booting&&event.message)startupFailure();});
  window.addEventListener('unhandledrejection',function(){if(booting)startupFailure();});
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&confirmed&&Date.now()-lastCheck>900000)schedule(5000);});
  read().then(function(){return select(0);}).catch(function(){return null;}).then(boot).catch(function(){showFailure();});
}());

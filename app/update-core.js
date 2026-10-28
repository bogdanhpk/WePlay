/* Immutable update verifier. Only signed releases may execute in the widget origin. */
(function(){
  'use strict';
  var MAX_BUNDLE=6*1024*1024,MAX_MANIFEST=32768,APP='LordKim001.LordTV';
  function fail(message){throw new Error(message);}
  function plain(value){return value&&typeof value==='object'&&!Array.isArray(value);}
  function version(value){return typeof value==='string'&&/^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(value);}
  function sequence(v){if(!version(v))return fail('Invalid version');var n=v.split('.').map(Number);return n[0]*100000000+n[1]*10000+n[2];}
  function path(value){return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,180}$/.test(value)&&value.split('/').every(function(p){return p&&p!=='.'&&p!=='..';});}
  function allowedFile(name){return path(name)&&(/^[a-z0-9-]+\.(?:js|css)$/.test(name)&&! /^(?:settings|update-config|update-core|updater)\.js$/.test(name)||name==='vendor/hls.min.js'||/^(?:assets|fonts)\/[a-zA-Z0-9_./-]+\.(?:png|jpg|jpeg|webp|svg|ttf|woff2?)$/.test(name));}
  function base64(value){if(typeof value!=='string'||value.length>MAX_BUNDLE*2||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))return fail('Invalid binary data');var raw=atob(value),out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
  function text(value){return new TextEncoder().encode(value);}
  function hex(bytes){return Array.prototype.map.call(new Uint8Array(bytes),function(v){return ('0'+v.toString(16)).slice(-2);}).join('');}
  function digest(bytes){return crypto.subtle.digest('SHA-256',bytes).then(hex);}
  function verify(envelope,config){
    return Promise.resolve().then(function(){
      if(!plain(envelope)||typeof envelope.signed!=='string'||text(envelope.signed).length>MAX_MANIFEST)return fail('Invalid update manifest');
      var signature=base64(envelope.signature);if(signature.length!==64||!window.crypto||!crypto.subtle)return fail('Update verifier unavailable');
      return crypto.subtle.importKey('jwk',config.publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']).then(function(key){return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signature,text(envelope.signed));});
    }).then(function(valid){
      if(!valid)return fail('Update signature rejected');var m=JSON.parse(envelope.signed);
      if(!plain(m)||m.schema!==1||m.app!==APP||m.channel!==config.channel||!version(m.version)||m.sequence!==sequence(m.version)||!Number.isSafeInteger(m.sequence)||m.sequence<config.bundledSequence||(!Number.isInteger(m.minShell)||m.minShell<1||m.minShell>config.shell))return fail('Incompatible update');
      if(!plain(m.payload)||!path(m.payload.path)||!/^releases\//.test(m.payload.path)||! /^[a-f0-9]{64}$/.test(m.payload.sha256)||!Number.isInteger(m.payload.bytes)||m.payload.bytes<1||m.payload.bytes>MAX_BUNDLE)return fail('Invalid update payload');
      return m;
    });
  }
  function validateBundle(bundle,m){
    if(!plain(bundle)||bundle.schema!==1||bundle.version!==m.version||bundle.sequence!==m.sequence||typeof bundle.html!=='string'||bundle.html.length>120000||!plain(bundle.files)||!Array.isArray(bundle.scripts)||!Array.isArray(bundle.styles))return fail('Invalid update bundle');
    var names=Object.keys(bundle.files);if(!names.length||names.length>100)return fail('Invalid update file count');
    names.forEach(function(name){var f=bundle.files[name];if(!allowedFile(name)||!plain(f)||! /^(?:utf8|base64)$/.test(f.encoding)||typeof f.content!=='string')return fail('Invalid update file');if(/\.(?:js|css|svg)$/.test(name)&&f.encoding!=='utf8')return fail('Invalid text file');if(f.encoding==='base64')base64(f.content);});
    function list(values,extension){var seen={};if(!values.length||values.length>40)return fail('Invalid update entrypoints');values.forEach(function(name){if(!allowedFile(name)||!name.endsWith(extension)||!bundle.files[name]||seen[name])return fail('Missing update entrypoint');seen[name]=true;});}
    list(bundle.scripts,'.js');list(bundle.styles,'.css');if(bundle.scripts[bundle.scripts.length-1]!=='app.js'||bundle.scripts.indexOf('native-player.js')<0)return fail('Incomplete application');
    var doc=new DOMParser().parseFromString(bundle.html,'text/html');if(doc.querySelector('script,iframe,object,embed,base,link,style')||!doc.getElementById('stage')||!doc.getElementById('content')||!doc.getElementById('player'))return fail('Invalid application layout');
    return bundle;
  }
  function release(record,config){
    if(!record||typeof record.body!=='string')return Promise.reject(new Error('Missing cached update'));
    return verify(record.envelope,config).then(function(m){var bytes=text(record.body);if(bytes.length!==m.payload.bytes)return fail('Incomplete update');return digest(bytes).then(function(hash){if(hash!==m.payload.sha256)return fail('Update checksum rejected');return{manifest:m,bundle:validateBundle(JSON.parse(record.body),m),record:record};});});
  }
  function url(manifestURL,m){var base=new URL(manifestURL),u=new URL(m.payload.path,base);if(base.protocol!=='https:'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname.slice(0,base.pathname.lastIndexOf('/')+1)))return fail('Update URL rejected');return u.href;}
  function request(url,maxBytes,timeout){
    var abort=new AbortController(),timer=setTimeout(function(){abort.abort();},timeout);
    return fetch(url,{credentials:'omit',cache:'no-store',signal:abort.signal}).then(function(r){if(!r.ok||r.headers.get('content-length')&&Number(r.headers.get('content-length'))>maxBytes)return fail('Update download unavailable');return r.arrayBuffer();}).then(function(buffer){if(buffer.byteLength>maxBytes)return fail('Update download too large');return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}).finally(function(){clearTimeout(timer);});
  }
  window.WePlayUpdateCore={verify:verify,release:release,validateBundle:validateBundle,url:url,request:request,digest:digest,bytes:text,base64:base64,sequence:sequence,allowedFile:allowedFile,MAX_BUNDLE:MAX_BUNDLE,MAX_MANIFEST:MAX_MANIFEST};
}());

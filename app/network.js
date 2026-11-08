/* Background work yields the connection to playback, including already running requests. */
(function(){
  'use strict';
  var playback=false,jobs=new Set(),wake=null;
  function aborted(){return Object.assign(new Error('Request cancelled'),{name:'AbortError'});}
  function settle(job,error,value){
    if(job.done)return;job.done=true;jobs.delete(job);
    if(job.signal)job.signal.removeEventListener('abort',job.cancel);
    if(error)job.reject(error);else job.resolve(value);
  }
  function start(job){
    if(job.done||job.controller||playback&&!job.media)return;
    var controller=new AbortController();job.controller=controller;job.interrupted=false;
    Promise.resolve().then(function(){if(controller.signal.aborted)throw aborted();return job.task(controller.signal);}).then(function(value){finish(null,value);},finish);
    function finish(error,value){
      job.controller=null;
      if(job.done)return;
      if(job.interrupted){if(!playback)drain();return;}
      settle(job,error,value);
    }
  }
  function drain(){
    if(wake!==null)return;
    wake=setTimeout(function(){wake=null;jobs.forEach(start);},0);
  }
  function run(task,options){
    options=options||{};
    return new Promise(function(resolve,reject){
      var job={task:task,media:!!options.media,signal:options.signal,resolve:resolve,reject:reject,controller:null,done:false,interrupted:false};
      job.cancel=function(){if(job.controller)job.controller.abort();settle(job,aborted());};
      if(job.signal&&job.signal.aborted){reject(aborted());return;}
      if(job.signal)job.signal.addEventListener('abort',job.cancel);
      jobs.add(job);start(job);
    });
  }
  function read(response,max,controller){
    if(Number(response.headers.get('content-length'))>max){controller.abort();throw new Error('Response exceeds size limit');}
    if(!response.body||!response.body.getReader)return response.arrayBuffer().then(function(bytes){if(bytes.byteLength>max)throw new Error('Response exceeds size limit');return new TextDecoder().decode(bytes);});
    var reader=response.body.getReader(),chunks=[],length=0;
    function next(){return reader.read().then(function(result){
      if(result.done){var bytes=new Uint8Array(length),at=0;chunks.forEach(function(chunk){bytes.set(chunk,at);at+=chunk.length;});return new TextDecoder().decode(bytes);}
      length+=result.value.length;if(length>max){controller.abort();reader.cancel().catch(function(){});throw new Error('Response exceeds size limit');}
      chunks.push(result.value);return next();
    });}return next();
  }
  function request(url,init,options){
    options=options||{};init=init||{};
    return run(function(signal){
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},options.timeout||8000);
      function cancel(){controller.abort();}signal.addEventListener('abort',cancel);
      return fetch(url,Object.assign({},init,{signal:controller.signal})).then(function(response){
        if(!response.ok){var error=new Error('Request unavailable');error.status=response.status;error.retryAfter=Number(response.headers.get('Retry-After'));throw error;}
        if(options.read)return options.read(response);
        if(options.maxBytes)return read(response,options.maxBytes,controller);
        return options.json?response.json():response.text();
      }).finally(function(){clearTimeout(timer);signal.removeEventListener('abort',cancel);});
    },{media:options.media,signal:options.signal||init.signal});
  }
  function setPlayback(value){
    value=!!value;if(playback===value)return;playback=value;
    if(playback)jobs.forEach(function(job){if(!job.media&&job.controller){job.interrupted=true;job.controller.abort();}});
    else drain();
    window.dispatchEvent(new CustomEvent('weplay:playback',{detail:playback}));
  }
  window.WePlayNetwork={run:run,request:request,setPlayback:setPlayback,isPlayback:function(){return playback;},snapshot:function(){var active=0,waiting=0; jobs.forEach(function(job){if(!job.media){if(job.controller)active++;else waiting++;}});return{playback:playback,backgroundActive:active,backgroundWaiting:waiting};}};
  // Installed Tizen/LG shells also use this policy without requiring a shell reinstall.
  if(window.WePlayUpdateCore)WePlayUpdateCore.request=function(url,max,timeout){return request(url,{credentials:'omit',cache:'no-store'},{maxBytes:max,timeout:timeout});};
}());

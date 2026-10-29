(function(){
  'use strict';
  var origin=location.origin,originalFetch=window.fetch.bind(window),open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
  function transport(raw,credentials){
    var url=new URL(raw,location.href);if(url.origin===origin)return url.href;
    if(url.protocol!=='https:')throw new TypeError('Only HTTPS resources are supported');
    return origin+'/network?url='+encodeURIComponent(url.href)+'&credentials='+encodeURIComponent(credentials||'omit');
  }
  window.fetch=function(input,options){
    options=options||{};var raw=typeof input==='string'||input instanceof URL?String(input):input.url;
    var request=input instanceof Request?input:null,method=String(options.method||request&&request.method||'GET').toUpperCase();
    var url=new URL(raw,location.href);if(url.origin===origin)return originalFetch(input,options);
    if(method!=='GET'&&method!=='HEAD')return Promise.reject(new TypeError('Unsupported request method'));
    var settings=Object.assign({},options,{method:method,credentials:'omit',headers:options.headers||(request?request.headers:undefined),signal:options.signal||(request?request.signal:undefined)});
    return originalFetch(transport(raw,options.credentials||request&&request.credentials),settings).then(function(response){
      var finalURL=response.headers.get('X-WePlay-Final-URL')||raw;
      Object.defineProperty(response,'url',{value:finalURL});return response;
    });
  };
  XMLHttpRequest.prototype.open=function(method,url){
    this._weplayRequest={method:method,url:String(url),args:Array.prototype.slice.call(arguments)};
    // Open now so setRequestHeader and responseType keep their native semantics.
    var args=Array.prototype.slice.call(arguments);args[1]=transport(url,'omit');return open.apply(this,args);
  };
  XMLHttpRequest.prototype.send=function(body){
    // HLS requests omit credentials; catalog sessions use fetch with explicit include.
    return send.call(this,body);
  };
  window.WePlayAndroid={
    key:function(type,code,repeat){
      var target=document.activeElement||document,keys={13:'Enter',27:'Escape',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown'};
      var event=new KeyboardEvent(type,{key:keys[code]||'Unidentified',keyCode:code,which:code,bubbles:true,cancelable:true,repeat:!!repeat});
      // Older TV WebViews omit legacy keyCode from synthetic events.
      if(event.keyCode!==code)Object.defineProperty(event,'keyCode',{value:code});
      if(event.which!==code)Object.defineProperty(event,'which',{value:code});
      target.dispatchEvent(event);
    },
    pause:function(){
      if(window.WePlayNativePlayer&&WePlayNativePlayer.active)WePlayNativePlayer.key(19);
    },
    exit:function(){location.href=origin+'/exit';}
  };
}());

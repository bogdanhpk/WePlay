(function(){
  'use strict';
  var origin=location.origin,originalFetch=window.fetch.bind(window),open=XMLHttpRequest.prototype.open;
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
    // Open now so setRequestHeader and responseType keep their native semantics.
    var args=Array.prototype.slice.call(arguments);args[1]=transport(url,'omit');return open.apply(this,args);
  };
  window.WePlayAndroid={
    mediaURL:function(url){return transport(url,'omit');},
    key:function(type,code,repeat){window.WePlayTV&&WePlayTV.key(type,code,repeat);},
    cancelKey:function(code){
      if(code===13&&window.WePlayContinue)WePlayContinue.cancelPress();
      if(window.WePlayNativePlayer)WePlayNativePlayer.releaseSeekKey(code,true);
    },
    foreground:function(visible){window.WePlayTV&&WePlayTV.setForeground(visible);},
    exit:function(){location.href=origin+'/exit';}
  };
}());

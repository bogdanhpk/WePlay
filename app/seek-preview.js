/* On-demand seek frames. Provider configuration is parsed as data, never executed. */
(function(){
  'use strict';
  function number(value,fallback,min,max){value=Number(value);return isFinite(value)&&value>=min&&value<=max?value:fallback;}
  function safeURL(raw,base){
    if(typeof raw!=='string'||raw.length>8192)return '';
    try{var u=new URL(raw.replace(/\$\{spriteNum\}/g,'WEPLAYSPRITENUMBER'),base);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href.replace(/WEPLAYSPRITENUMBER/g,'${spriteNum}'):'';}catch(ignore){return '';}
  }
  function source(value,defaults,base){
    value=Object.assign({},defaults||{},value||{});
    if(value.type==='video'){var video=safeURL(value.url,base);return video?{type:'video',url:video}:null;}
    var src=safeURL(value.src,base);if(!src)return null;
    return{type:'sprite',src:src,interval:number(value.interval,5,.1,3600),width:Math.floor(number(value.width,160,16,2048)),height:Math.floor(number(value.height,90,16,2048)),spriteSize:Math.floor(number(value.spriteSize,100,1,10000)),rowSize:Math.floor(number(value.rowSize,10,1,100)),firstNum:Math.floor(number(value.firstNum,1,0,100000)),pad:Math.floor(number(value.pad,1,1,8))};
  }
  function read(html){
    if(typeof html!=='string')return null;
    var match=/\bpreview\s*:\s*\{/.exec(html);if(!match)return null;
    var begin=html.indexOf('{',match.index),quote='',escape=false,depth=0,end=begin;
    for(;end<html.length&&end-begin<16384;end++){var c=html[end];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)break;}
    var block=html.slice(begin,end+1),raw=/\bsrc\s*:\s*("(?:\\.|[^"\\])*")/.exec(block),value={};if(!raw)return null;
    try{value.src=JSON.parse(raw[1]);}catch(ignore){return null;}
    ['interval','width','height','spriteSize','rowSize','firstNum','pad'].forEach(function(key){var m=new RegExp('\\b'+key+'\\s*:\\s*(\\d+(?:\\.\\d+)?)').exec(block);if(m)value[key]=Number(m[1]);});return value;
  }
  function frame(spec,seconds){
    if(!spec||spec.type!=='sprite'||!isFinite(seconds)||seconds<0)return null;
    var index=Math.floor(seconds/spec.interval),sheet=Math.floor(index/spec.spriteSize),cell=index%spec.spriteSize;
    if(sheet&&spec.src.indexOf('${spriteNum}')<0)return null;
    var num=String(sheet+spec.firstNum).padStart(spec.pad,'0');
    return{url:spec.src.replace(/\$\{spriteNum\}/g,num),x:cell%spec.rowSize*spec.width,y:Math.floor(cell/spec.rowSize)*spec.height,width:spec.width,height:spec.height,index:index,time:index*spec.interval};
  }
  function create(root,host){
    var spec=null,active=false,disposed=false,target=0,key='',timer=null,deadline=null,image=null,imageURL='',cache=[],movie=null,ready=false,broken=false,sequence=0,rendered=null,failure='';
    var canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;canvas.className='native-preview-canvas';canvas.hidden=true;host.appendChild(canvas);
    function state(value){ready=value;root.classList.toggle('preview-ready',value);root.setAttribute('data-preview-state',value?'ready':spec&&!broken?'loading':'unavailable');}
    function clearVideo(){if(!movie)return;movie.onloadedmetadata=movie.onloadeddata=movie.onseeked=movie.onerror=null;movie.pause();movie.removeAttribute('src');movie.load();movie.remove();movie=null;}
    function cancelImage(){if(image){image.onload=image.onerror=null;image.removeAttribute('src');image=null;}imageURL='';}
    function stop(){clearTimeout(timer);clearTimeout(deadline);timer=deadline=null;cancelImage();clearVideo();canvas.hidden=true;state(false);}
    function unavailable(reason){if(disposed)return;failure=typeof reason==='string'?reason:'unavailable';broken=true;stop();root.classList.remove('has-preview');host.hidden=true;root.setAttribute('data-preview-state','unavailable');}
    function sprite(){
      var next=frame(spec,target);if(!next){unavailable();return;}
      var retained=cache.filter(function(c){return c.url===next.url;})[0];
      if(retained){draw(retained.image);return;}
      if(imageURL===next.url)return;
      cancelImage();imageURL=next.url;var current=image=new Image(),generation=sequence;
      deadline=setTimeout(unavailable,4000);
      current.onload=function(){
        if(disposed||!active||generation!==sequence||image!==current)return;
        clearTimeout(deadline);deadline=null;image=null;imageURL='';
        if(!current.naturalWidth||!current.naturalHeight||current.naturalWidth*current.naturalHeight>16000000){unavailable();return;}
        cache.push({url:next.url,image:current});while(cache.length>2)cache.shift();if(frame(spec,target).url===next.url)draw(current);else sprite();
      };
      current.onerror=function(){if(image===current)unavailable();};
      current.src=WePlayTV.mediaURL(next.url);
    }
    function draw(picture){
      var next=frame(spec,target);if(!next||next.x+next.width>picture.naturalWidth||next.y+next.height>picture.naturalHeight){unavailable();return;}
      try{var context=canvas.getContext('2d');context.fillStyle='#000';context.fillRect(0,0,320,180);var scale=Math.min(320/next.width,180/next.height),w=next.width*scale,h=next.height*scale;context.drawImage(picture,next.x,next.y,next.width,next.height,(320-w)/2,(180-h)/2,w,h);canvas.hidden=false;rendered=next.time;state(true);}catch(ignore){unavailable();}
    }
    function videoFrame(){
      if(!movie){
        var generation=sequence,current=movie=document.createElement('video');current.className='native-preview-video';current.muted=true;current.defaultMuted=true;current.playsInline=true;current.preload='metadata';current.setAttribute('muted','');current.setAttribute('playsinline','');current.setAttribute('aria-hidden','true');current.tabIndex=-1;host.appendChild(current);
        function live(){return !disposed&&active&&generation===sequence&&current===movie;}
        current.onloadedmetadata=function(){if(live())seekVideo();};
        current.onloadeddata=current.onseeked=function(){if(!live())return;if(!current.seeking&&current.readyState>=2&&Math.abs(current.currentTime-Math.min(target,isFinite(current.duration)?Math.max(0,current.duration-.1):target))<.35){clearTimeout(deadline);deadline=null;rendered=current.currentTime;state(true);}};
        // Keep MP4 range seeking in the OS media loader. WebView resource responses
        // can be read by fetch while still failing the media demuxer on Android TV.
        current.onerror=function(){if(live())unavailable('video-error-'+(current.error&&current.error.code||0));};current.src=spec.url;
      }
      clearTimeout(deadline);deadline=setTimeout(function(){unavailable('video-timeout');},7000);seekVideo();
    }
    function seekVideo(){if(!movie||movie.readyState<1)return;try{var end=isFinite(movie.duration)?Math.max(0,movie.duration-.1):target;movie.currentTime=Math.min(target,end);}catch(ignore){unavailable();}}
    function update(milliseconds){
      if(disposed||!spec||broken)return;
      active=true;target=Math.max(0,milliseconds/1000);root.classList.add('has-preview');host.hidden=false;
      var nextKey=spec.type==='sprite'?'s'+Math.floor(target/spec.interval):'v'+Math.floor(target*4);
      if(nextKey===key)return;key=nextKey;state(false);clearTimeout(timer);
      timer=setTimeout(function(){timer=null;if(!active||disposed)return;if(spec.type==='sprite')sprite();else videoFrame();},120);
    }
    return{
      source:function(value){sequence++;stop();spec=source(value);broken=false;failure='';key='';rendered=null;cache=[];root.classList.remove('has-preview');host.hidden=true;},
      show:update,
      hide:function(){if(!active)return;active=false;sequence++;key='';stop();root.classList.remove('has-preview');host.hidden=true;},
      destroy:function(){disposed=true;active=false;sequence++;stop();cache=[];canvas.remove();},
      snapshot:function(){return{active:active,type:spec&&spec.type,ready:ready,unavailable:broken,failure:failure,target:target,rendered:rendered};}
    };
  }
  window.WePlaySeekPreview={read:read,source:source,frame:frame,create:create};
}());

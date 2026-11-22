(function(){
  'use strict';
  if(!window.WePlayVideoBridge)return;
  var sequence=0,current=null,blocked=new Set();
  function post(id,action,data){WePlayVideoBridge.postMessage(JSON.stringify(Object.assign({session:id,action:action},data||{})));}
  function key(stream){return stream&&(stream.streamKey||stream.url)||'';}
  function create(media,config){
    var id=++sequence,sent=0,active=true,state={position:0,duration:0,buffered:0,wantsPlay:false,playing:false,width:0,height:0,rendered:false,state:1,currentLevel:-1},listeners={},manual=-1,audio=-1,subtitle=-1,metadata=false,loaded=false,volume=1,muted=false;
    var engine={nativeMedia3:true,config:{minAutoBitrate:0},levels:[],audioTracks:[],subtitleTracks:[]};
    function command(action,data){if(active)post(id,action,Object.assign({},data||{},{sequence:++sent}));}
    function fire(event,data){(listeners[event]||[]).slice().forEach(function(callback){callback(event,data||{});});}
    function event(name){media.dispatchEvent(new Event(name));}
    function quality(index){manual=index;command('quality',{index:index});}
    function tracks(values){return (values||[]).map(function(value,index){return Object.assign({id:index},value);});}
    Object.defineProperties(engine,{
      currentLevel:{get:function(){return state.currentLevel;},set:quality},
      nextLevel:{get:function(){return manual;},set:quality},
      startLevel:{get:function(){return manual;},set:function(){}},
      autoLevelEnabled:{get:function(){return manual<0;}},
      audioTrack:{get:function(){return audio;},set:function(index){audio=index;command('audio',{index:index});}},
      subtitleTrack:{get:function(){return subtitle;},set:function(index){subtitle=index;command('subtitle',{index:index});}},
      subtitleDisplay:{get:function(){return subtitle>=0;},set:function(value){if(!value){subtitle=-1;command('subtitle',{index:-1});}}}
    });
    Object.defineProperties(media,{
      currentTime:{get:function(){return state.position/1000;},set:function(seconds){state.position=Math.max(0,seconds*1000);command('seek',{position:Math.round(state.position)});}},
      duration:{get:function(){return state.duration>0?state.duration/1000:NaN;}},
      paused:{get:function(){return !state.wantsPlay;}},
      ended:{get:function(){return state.state===4;}},
      videoWidth:{get:function(){return state.rendered?state.width:0;}},
      videoHeight:{get:function(){return state.rendered?state.height:0;}},
      readyState:{get:function(){return state.state===3?4:state.rendered?2:0;}},
      error:{get:function(){return state.error||null;}},
      buffered:{get:function(){var end=Math.max(state.position,state.buffered)/1000;return{length:end>state.position/1000?1:0,start:function(){return state.position/1000;},end:function(){return end;}};}},
      muted:{get:function(){return muted;},set:function(value){muted=!!value;command('volume',{volume:muted?0:volume});}},
      volume:{get:function(){return volume;},set:function(value){volume=Math.max(0,Math.min(1,Number(value)||0));command('volume',{volume:muted?0:volume});}}
    });
    media.play=function(){state.wantsPlay=true;command('play');return Promise.resolve();};
    media.pause=function(){if(!active)return;state.wantsPlay=false;command('pause');event('pause');};
    media.load=function(){};
    media.getVideoPlaybackQuality=function(){return{totalVideoFrames:(state.renderedFrames||0)+(state.droppedFrames||0),droppedVideoFrames:state.droppedFrames||0,creationTime:performance.now()};};
    media.hidden=true;
    engine.on=function(name,callback){(listeners[name]||(listeners[name]=[])).push(callback);};
    engine.attachMedia=function(){};
    engine.startLoad=function(){};
    engine.stopLoad=function(){media.pause();};
    engine.loadSource=function(url){
      document.documentElement.classList.add('android-native-video');
      current={id:id,receive:receive,engine:engine};
      command('open',{url:url,position:Math.round(Math.max(0,config.startPosition||0)*1000),format:config.nativeFormat||'hls'});
    };
    engine.destroy=function(){
      if(!active)return;command('close');active=false;
      if(current&&current.id===id){current=null;document.documentElement.classList.remove('android-native-video');}
      listeners={};
    };
    engine.diagnostics=function(){return Object.assign({},state,{manualLevel:manual,levels:engine.levels.length});};
    function receive(next){
      if(!active)return;
      if(next.event==='error'){
        state.error={code:next.code>=2000&&next.code<3000?2:3,message:next.message};
        fire(Hls.Events.ERROR,{fatal:true,type:state.error.code===2?Hls.ErrorTypes.NETWORK_ERROR:Hls.ErrorTypes.MEDIA_ERROR,details:next.fallback?'nativeUnsupported':'nativePlaybackError'});return;
      }
      if(typeof next.sequence==='number'&&next.sequence<sent)return;
      var previous=state;state=Object.assign({},state,next);
      if(next.levels){
        engine.levels=tracks(next.levels);engine.audioTracks=tracks(next.audioTracks);engine.subtitleTracks=tracks(next.subtitleTracks);
        if(!metadata&&engine.levels.length){metadata=true;fire(Hls.Events.MANIFEST_PARSED,{levels:engine.levels});}
        fire(Hls.Events.AUDIO_TRACKS_UPDATED);fire(Hls.Events.SUBTITLE_TRACKS_UPDATED);
      }
      if(state.duration!==previous.duration)event('durationchange');
      if(!loaded&&state.rendered){loaded=true;event('loadedmetadata');event('loadeddata');}
      if(state.width!==previous.width||state.height!==previous.height){event('resize');fire(Hls.Events.LEVEL_SWITCHED);}
      if(state.state===2&&previous.state!==2)event('waiting');
      if(state.playing&&state.rendered&&(!previous.playing||!previous.rendered))event('playing');
      if(!state.wantsPlay&&previous.wantsPlay)event('pause');
      if(state.position!==previous.position)event('timeupdate');
      if(next.event==='ended'&&previous.state!==4)event('ended');
    }
    return engine;
  }
  window.WePlayAndroidVideo={
    supported:function(stream){return !!stream&&stream.transport==='plain'&&!blocked.has(key(stream));},
    block:function(stream){blocked.add(key(stream));},
    create:create,
    receive:function(data){if(current&&current.id===data.session)current.receive(data);},
    diagnostics:function(){return current?current.engine.diagnostics():null;}
  };
}());

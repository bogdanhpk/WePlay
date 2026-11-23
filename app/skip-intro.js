/* Optional episode timestamps. Playback never waits for these metadata requests. */
(function(){
  'use strict';
  var cache=new Map();
  function number(value){return value!==null&&value!==''&&isFinite(Number(value))?Number(value):NaN;}
  function read(data){
    if(!data||typeof data!=='object')return null;
    var value=data.introRange||data.intro,ms=value&&value.start_ms!==undefined;
    if(data.introRange&&value.start!==undefined)return{start:number(value.start),end:number(value.end)};
    if(value&&typeof value==='object')return{start:ms?number(value.start_ms):number(value.start_sec)*1000,end:ms?number(value.end_ms):number(value.end_sec)*1000};
    if(data.introStartMs!==undefined||data.intro_start_ms!==undefined)return{start:number(data.introStartMs!==undefined?data.introStartMs:data.intro_start_ms),end:number(data.introEndMs!==undefined?data.introEndMs:data.intro_end_ms)};
    if(data.introStartSeconds!==undefined||data.intro_start_seconds!==undefined)return{start:number(data.introStartSeconds!==undefined?data.introStartSeconds:data.intro_start_seconds)*1000,end:number(data.introEndSeconds!==undefined?data.introEndSeconds:data.intro_end_seconds)*1000};
    return null;
  }
  function valid(range,duration){
    return !!(range&&isFinite(range.start)&&isFinite(range.end)&&duration>=90000&&range.start>=0&&range.start<Math.min(duration*.5,1200000)&&range.end-range.start>=5000&&range.end-range.start<=300000&&range.end<=duration-10000);
  }
  function identity(item){
    if(!item)return '';
    var ids=window.WePlayCatalogUnion&&WePlayCatalogUnion.identifiers(item)||{},resource=window.WePlayArtwork&&WePlayArtwork.cached(item),packaged=window.WePlayTMDB&&WePlayTMDB.indexed(item);
    var id=ids.imdb||resource&&resource.metadata&&resource.metadata.imdbId||packaged&&packaged.imdbId;
    return /^tt\d{7,8}$/.test(id||'')?id:'';
  }
  function json(url,signal){return WePlayNetwork.request(url,{credentials:'omit',headers:{Accept:'application/json'}},{media:true,signal:signal,timeout:3500,maxBytes:32768}).then(function(text){return JSON.parse(text);});}
  function same(data,id,episode){return data&&data.imdb_id===id&&Number(data.season)===Number(episode.season)&&Number(data.episode)===Number(episode.episode);}
  function lookup(item,episode,duration,signal){
    if(!episode||!Number.isInteger(Number(episode.season))||!Number.isInteger(Number(episode.episode))||episode.season<1||episode.episode<1||duration<90000)return Promise.resolve(null);
    var known=identity(item),resolve=known?Promise.resolve(known):window.WePlayTMDB&&WePlayTMDB.available()?WePlayTMDB.artwork(item,false,{media:true,signal:signal}).then(function(art){return /^tt\d{7,8}$/.test(art&&art.imdbId||'')?art.imdbId:'';}):Promise.resolve('');
    return resolve.then(function(id){
      if(!id||signal&&signal.aborted)return null;
      var key=[id,episode.season,episode.episode,Math.round(duration/1000)].join(':'),entry=cache.get(key);
      if(entry&&entry.until>Date.now())return entry.value;
      var query='imdb_id='+id+'&season='+Number(episode.season)+'&episode='+Number(episode.episode);
      function fallback(){
        return json('https://api.introdb.app/segments?'+query,signal).then(function(data){
          if(!same(data,id,episode)||data.is_movie||data.no_intro||!data.intro||!(number(data.intro.confidence)>=.7))return null;
          var range=read(data);return valid(range,duration)?Object.assign(range,{source:'IntroDB'}):null;
        });
      }
      return json('https://api.skipdb.tv/api/segments?'+query+'&type=intro&duration='+Math.round(duration/1000)+'&adjust=conservative',signal).then(function(data){
        if(!same(data,id,episode))return null;
        var intro=data.segments&&data.segments.intro;
        // An explicitly different cut must not fall back to duration-agnostic marks.
        if(intro){var range=read({intro:intro}),offset=number(intro.offset_ms),matched=intro.match==='exact'&&Math.abs(offset)<=2000||intro.match==='shifted'&&intro.adjusted===true&&offset<=0&&offset>=-15000;return matched&&number(intro.confidence)>=.7&&valid(range,duration)?Object.assign(range,{source:'SkipDB'}):null;}
        return fallback();
      },function(error){if(signal&&signal.aborted)throw error;return fallback();}).then(function(value){
        if(signal&&signal.aborted)return null;
        cache.set(key,{value:value,until:Date.now()+(value?3600000:300000)});while(cache.size>64)cache.delete(cache.keys().next().value);return value;
      });
    }).catch(function(){return null;});
  }
  function create(options){
    var root=document.createElement('button');root.id='native-skip-intro';root.type='button';root.className='native-skip-intro focusable';root.textContent='Пропустить заставку';root.hidden=true;options.root.appendChild(root);
    var controller=new AbortController(),disposed=false,pending=false,attempted=false,dismissed=false,range=null,remote=null;
    function hide(){root.hidden=true;if(document.activeElement===root)options.returnFocus();}
    function skip(){var state=options.state();if(root.hidden||state.blocked||!valid(range,state.duration)||state.time<range.start||state.time>=range.end-1000)return;hide();options.onSkip(range.end);update();}
    function update(){
      if(disposed)return;var state=options.state(),local=read(options.source()),candidate=valid(local,state.duration)?Object.assign(local,{source:'Источник'}):remote;range=candidate;
      if(!attempted&&state.started&&state.duration>=90000&&!state.blocked){
        attempted=true;
        if(!candidate){pending=true;lookup(options.item,options.episode,state.duration,controller.signal).then(function(value){if(disposed)return;pending=false;remote=value;update();});}
      }
      if(range&&state.time<range.start-1000)dismissed=false;
      if(state.blocked||!state.started||dismissed||!valid(range,state.duration)||state.time<range.start||state.time>=range.end-1000){hide();return;}
      var entering=root.hidden;root.hidden=false;root.classList.toggle('native-skip-intro-raised',!!options.controlsVisible());
      if(entering)WePlayFocus.focus(root,false);
    }
    root.onclick=skip;
    var timer=setInterval(update,250);
    return{
      update:update,
      button:function(){return root.hidden?null:root;},
      key:function(key,shift,repeat){
        update();if(root.hidden)return false;var owned=document.activeElement===root;
        if(owned){
          if(key===13){if(!repeat)skip();return true;}
          if(key===27||key===10009){if(!repeat){dismissed=true;hide();}return true;}
          if(key===38||key===40){options.focusControls(key===38);return true;}
          if(key===37||key===39)options.returnFocus();
        }else if(key===40&&!options.controlsVisible()){WePlayFocus.focus(root,false);return true;}
        return false;
      },
      snapshot:function(){return{visible:!root.hidden,loading:pending,range:range&&{start:range.start,end:range.end,source:range.source},dismissed:dismissed};},
      destroy:function(){if(disposed)return;disposed=true;clearInterval(timer);controller.abort();hide();root.remove();}
    };
  }
  window.WePlayIntro={read:read,valid:valid,lookup:lookup,create:create};
}());

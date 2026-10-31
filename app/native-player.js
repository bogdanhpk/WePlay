/* Native Samsung playback. Provider HTML is parsed as data and is never executed. */
(function(){
  'use strict';
  function balanced(s,start){
    var open=s[start],close=open==='['?']':'}',depth=0,quote='',escaped=false;
    for(var i=start;i<s.length;i++){
      var c=s[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
      if(c==='"'||c==="'"){quote=c;continue;}if(c===open)depth++;if(c===close&&--depth===0)return s.slice(start,i+1);
    }throw new Error('Не удалось прочитать список серий');
  }
  function parse(html){
    if(html&&typeof html==='object'&&Array.isArray(html.episodes)){var supplied=html.episodes.filter(function(e){return Array.isArray(e.variants)&&e.variants.length;});if(!supplied.length)throw new Error('Нет доступных серий.');return supplied;}
    var m=/\bseasons\s*:\s*\[/.exec(html),episodes=[],auth=/var\s+lok\s*=\s*\d+\s*,\s*\w+\s*=\s*"([^"]+)"/.exec(html);
    if(m){
      var start=html.indexOf('[',m.index),seasons=JSON.parse(balanced(html,start));
      seasons.forEach(function(s){(s.episodes||[]).forEach(function(e){if(e.hls&&!e.blocked){e.season=s.season;episodes.push(e);}});});
    }else{
      m=/\bhls\s*:\s*("(?:\\.|[^"\\])*")/.exec(html);
      if(m){var e={hls:JSON.parse(m[1]),title:'Фильм',audio:{names:[]}},a=/\baudio\s*:\s*\{/.exec(html);
        if(a){try{e.audio=JSON.parse(balanced(html,html.indexOf('{',a.index)));}catch(ignore){}}
        episodes.push(e);
      }
    }
    if(!episodes.length)throw new Error('В этом источнике пока нет доступного видео.');
    episodes.forEach(function(e){if(auth)e.hls+='&'+auth[1];var u=new URL(e.hls);if(!/^https?:$/.test(u.protocol))throw new Error('Некорректный адрес видео');});
    return episodes;
  }
  function el(tag,cls,label){var e=document.createElement(tag);if(cls)e.className=cls;if(label!==undefined)e.textContent=label;return e;}
  function playerIcon(name){return /^(?:x$|plus|check|arrow-|caret-)/.test(name)?window.WEPLAY_ICONS[name]||'':window.WEPLAY_PLAYER_ICONS&&window.WEPLAY_PLAYER_ICONS[name]||window.WEPLAY_ICONS[name]||'';}
  function time(ms){var n=isFinite(ms)?Math.max(0,Math.floor(ms/1000)):0,s=n%60,m=Math.floor(n/60)%60,h=Math.floor(n/3600);return(h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
  var active=false,api=null,video=null,hls=null,serverOffset=0,episodes=[],episodeIndex=0,audioIndex=0,options=null,menu=null,buttons=[],menuIndex=0,bar=null,timer=null,request=0,prepareTimer=null;
  var currentTime=0,totalTime=0,audioPreference='',timeline=null;
  var controlsFocused=false,barSelection='native-toggle',menuBack=null,suspended=false,wantsPlay=true,failed=false,loading=true;
  var elapsed=null,remaining=null,nowTitle=null,nowEpisode=null,stateLabel=null,toggleButton=null,audioButton=null,episodeButton=null,retryButton=null;
  var seekBar=null,seekKnob=null,seekBubble=null,bufferFill=null,finishLabel=null,settingsButton=null,previousButton=null,nextButton=null,qualityBadge=null;
  var preview=null,seekRun=0,lastSeekKeyAt=0,menuClose=null,menuShade=null,qualityPreference=0,selectedQuality=0,bufferTimer=null,pointerCleanup=null;
  var runningEpisode=null,started=false,runningEnded=false,resumeTarget=0,lastSavedAt=0;
  var postplay=null,postplayDismissals={},postplayAutoplay=true;
  try{audioPreference=localStorage.getItem('lord.audioPreference')||'';}catch(ignore){}
  try{qualityPreference=Number(localStorage.getItem('lord.quality.v1'))||0;}catch(ignore){}
  function put(node,value){if(node&&node.textContent!==value)node.textContent=value;}
  function report(t,d){if(options&&options.log)options.log(t,d);}
  function error(message){saveProgress(true);clearTimeout(prepareTimer);clearTimeout(bufferTimer);if(preview){wantsPlay=preview.playing;preview=null;}if(pointerCleanup)pointerCleanup();if(seekBubble)seekBubble.hidden=true;closeMenu(false);failed=true;loading=false;if(options){options.status.textContent=message;report('nativeError',message);barSelection='native-retry';show(true);}}
  function state(){try{return api?api.getState():(video?(video.paused?'PAUSED':'PLAYING'):'NONE');}catch(ignore){return 'NONE';}}
  function encodedUrl(raw){
    if(options&&options.transport==='plain')return raw;
    var u=new URL(raw);if(u.pathname.indexOf('/x-en-x/')===0)return raw;
    var letters='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',map='DlChEXitLONYRkFjAsnBbymWzSHMqKPgQZpvwerofJTVdIuUcxaG';
    var value=btoa(Math.round((Date.now()+serverOffset)/3600000)+'/'+u.pathname+u.search);
    return u.origin+'/x-en-x/'+value.split('').map(function(c){var i=letters.indexOf(c);return i<0?c:map[i];}).join('');
  }
  function ProviderLoader(config){
    var inner=new Hls.DefaultConfig.loader(config),self=this;this.context=null;
    Object.defineProperty(this,'stats',{get:function(){return inner.stats;}});
    this.abort=function(){inner.abort();};this.destroy=function(){inner.destroy();};
    this.getCacheAge=function(){return inner.getCacheAge?inner.getCacheAge():null;};
    this.getResponseHeader=function(n){return inner.getResponseHeader?inner.getResponseHeader(n):null;};
    this.load=function(context,cfg,callbacks){
      self.context=context;var original=context.url,wire=Object.assign({},context,{url:encodedUrl(original)}),cb=Object.assign({},callbacks);
      cb.onSuccess=function(response,stats,ctx,details){response.url=original;callbacks.onSuccess(response,stats,context,details);};
      cb.onError=function(err,ctx,details,stats){if(callbacks.onError)callbacks.onError(err,context,details,stats);};
      cb.onTimeout=function(stats,ctx,details){if(callbacks.onTimeout)callbacks.onTimeout(stats,context,details);};
      cb.onProgress=function(stats,ctx,data,details){if(callbacks.onProgress)callbacks.onProgress(stats,context,data,details);};
      cb.onAbort=function(stats,ctx,details){if(callbacks.onAbort)callbacks.onAbort(stats,context,details);};
      inner.load(wire,cfg,cb);
    };
  }
  function followingEpisode(index){var current=episodes[index],next=episodes[index+1];if(!current||!next||!current.season||options&&options.mediaKind==='movie')return null;return Number(next.season)===Number(current.season)&&Number(next.episode)===Number(current.episode)+1||Number(next.season)===Number(current.season)+1&&Number(next.episode)===1?next:null;}
  function saveProgress(force,ended){
    if(!options||!options.onProgress||!runningEpisode||!started||runningEnded||failed)return;
    var position=currentTime;try{position=api?api.getCurrentTime():video?video.currentTime*1000:position;}catch(ignore){}
    if(!isFinite(position)||position<0)return;
    // Early metadata/time events may still report zero before the resume seek has landed.
    if(resumeTarget>0){if(totalTime>0&&resumeTarget>=totalTime||Math.abs(position-resumeTarget)>5000)return;resumeTarget=0;}
    var now=Date.now();if(!force&&now>=lastSavedAt&&now-lastSavedAt<5000)return;
    lastSavedAt=now;var index=episodes.indexOf(runningEpisode),next=followingEpisode(index);
    options.onProgress({position:position,duration:isFinite(totalTime)&&totalTime>0?totalTime:0,season:runningEpisode.season,episode:runningEpisode.episode,next:next&&{season:next.season,episode:next.episode},ended:!!ended});
  }
  function playbackStarted(){if(!started){started=true;if(options&&options.onStarted)options.onStarted();}saveProgress(false);}
  function completed(){if(runningEnded)return;var token=request;saveProgress(true,true);runningEnded=true;wantsPlay=false;pauseEngine();if(totalTime>0)currentTime=totalTime;tick(currentTime);if(token!==request)return;show(false);if(postplay)postplay.ended();}
  function creditsStart(episode){
    var ms=Number(episode.creditsStartMs||episode.credits_start_ms)||Number(episode.creditsStartSeconds||episode.credits_start_seconds)*1000;
    return isFinite(ms)&&totalTime>0&&ms>=totalTime*.8&&ms<totalTime&&totalTime-ms<=600000?ms:0;
  }
  function stopEngine(){
    saveProgress(true);runningEpisode=null;started=false;
    if(postplay){postplay.destroy();postplay=null;}
    document.body.classList.remove('avplay-active');
    clearTimeout(prepareTimer);clearTimeout(bufferTimer);preview=null;if(pointerCleanup)pointerCleanup();
    if(hls){hls.destroy();hls=null;}
    if(api){try{if(['PLAYING','PAUSED','READY'].indexOf(api.getState())>=0)api.stop();api.close();}catch(ignore){}}
    if(video){video.pause();video.removeAttribute('src');video.load();video=null;}
  }
  function closeMenu(restore){if(menu)menu.remove();if(menuShade)menuShade.remove();menu=null;menuShade=null;menuClose=null;buttons=[];menuBack=null;if(settingsButton)settingsButton.setAttribute('aria-expanded','false');if(bar)bar.removeAttribute('aria-hidden');if(restore&&active)show(true);}
  function play(){if(runningEnded)seekTo(0);wantsPlay=true;if(suspended||preview)return;try{if(api){if(['PAUSED','READY'].indexOf(api.getState())>=0)api.play();}else if(video){var p=video.play();if(p&&p.catch)p.catch(function(e){if(e.name!=='AbortError')error(e.name==='NotAllowedError'?'Нажмите «Продолжить» для запуска видео.':'Не удалось запустить видео. Попробуйте ещё раз.');});}}catch(e){report('nativePlayError',e.message);error('Не удалось запустить видео. Попробуйте ещё раз.');}updateControls();armHide();}
  function pauseEngine(){try{if(api&&api.getState()==='PLAYING')api.pause();else if(video)video.pause();}catch(ignore){}}
  function pause(){wantsPlay=false;pauseEngine();saveProgress(true);updateControls();clearTimeout(timer);}
  function toggle(){if(wantsPlay)pause();else play();show(controlsFocused);}
  function clamp(ms){return Math.max(0,Math.min(totalTime>0?Math.max(0,totalTime-1000):currentTime,ms));}
  function seekTo(target){try{resumeTarget=0;runningEnded=false;currentTime=clamp(target);if(api&&['PLAYING','PAUSED'].indexOf(api.getState())>=0)api.seekTo(currentTime,function(){saveProgress(true);},function(){});else if(video)video.currentTime=currentTime/1000;tick(currentTime);if(!api)saveProgress(true);}catch(ignore){}}
  function seek(seconds){if(totalTime<=0||failed)return;seekTo(currentTime+seconds*1000);if(!menu)show(controlsFocused);}
  function beginSeek(direction,repeat,step){
    if(totalTime<=0||failed||suspended){show(true);return;}
    var now=Date.now();seekRun=repeat||now-lastSeekKeyAt<300?seekRun+1:0;lastSeekKeyAt=now;
    if(!preview){preview={origin:currentTime,target:currentTime,playing:wantsPlay};pauseEngine();}
    preview.target=clamp(preview.target+direction*(step|| (seekRun>15?60:seekRun>5?30:10))*1000);
    show(false);controlsFocused=true;WePlayFocus.focus(seekBar);tick(currentTime);clearTimeout(timer);
  }
  function finishSeek(commit,forcePlay){
    if(!preview)return;var saved=preview;preview=null;seekRun=0;
    if(commit)seekTo(saved.target);
    wantsPlay=forcePlay===undefined?saved.playing:forcePlay;if(wantsPlay)play();else pause();
    show(false);controlsFocused=true;WePlayFocus.focus(seekBar);tick(currentTime);armHide();report(commit?'seekCommitted':'seekCancelled',Math.round((commit?saved.target:saved.origin)/1000));
  }
  function tick(ms){
    currentTime=ms;try{totalTime=api?api.getDuration():video.duration*1000;}catch(ignore){}
    if(!failed&&resumeTarget>0&&totalTime>0&&resumeTarget>=totalTime){wantsPlay=false;pauseEngine();error('Сохранённый момент за пределами этого видео. Смените источник или выберите «Сначала».');return;}
    var position=preview?preview.target:ms,ratio=totalTime>0?Math.max(0,Math.min(1,position/totalTime)):0;
    put(elapsed,time(position));put(remaining,totalTime>0?time(totalTime):'—');
    if(timeline)timeline.style.transform='scaleX('+ratio+')';if(seekKnob)seekKnob.style.left=(ratio*100)+'%';
    if(seekBubble){seekBubble.hidden=!preview;if(preview){seekBubble.style.left=(ratio*100)+'%';put(seekBubble,time(position));}}
    if(seekBar){seekBar.setAttribute('aria-valuemax',String(Math.floor(totalTime/1000)||0));seekBar.setAttribute('aria-valuenow',String(Math.floor(position/1000)));seekBar.setAttribute('aria-valuetext',time(position)+' из '+time(totalTime));seekBar.setAttribute('aria-disabled',String(totalTime<=0||failed));}
    var buffered=0;try{if(video&&video.buffered.length)buffered=video.buffered.end(video.buffered.length-1)*1000;}catch(ignore){}
    if(bufferFill)bufferFill.style.transform='scaleX('+(totalTime>0?Math.max(0,Math.min(1,buffered/totalTime)):0)+')';
    put(finishLabel,totalTime>0?'Осталось '+time(Math.max(0,totalTime-position)):'');
    if(ms>1000&&!failed&&!loading&&options.status.textContent){options.status.textContent='';report('nativeProgress',Math.round(ms));}
    updateControls();saveProgress(false);if(postplay)postplay.update();
  }
  function controlButtons(){return bar?Array.prototype.slice.call(bar.querySelectorAll('.native-actions button')).filter(function(b){return !b.disabled&&!b.hidden&&b.offsetWidth&&b.offsetHeight;}):[];}
  function updateControls(){
    if(!bar||!episodes.length)return;var e=episodes[episodeIndex],tracks=audioOptions(),track=tracks.filter(function(t){return t.index===audioSelection();})[0];
    nowTitle.textContent=options.title||document.getElementById('player-title').textContent||'Просмотр';nowEpisode.textContent=e.season?'Сезон '+e.season+' · Серия '+e.episode:'';nowEpisode.hidden=!e.season;
    put(stateLabel,failed?'Видео недоступно':preview?'Перемотка':runningEnded?'Завершено':suspended||!wantsPlay?'Пауза':'');stateLabel.hidden=!stateLabel.textContent;
    document.getElementById('player').classList.toggle('native-loading',loading&&!failed&&!suspended&&!preview);
    toggleButton.querySelector('.control-label').textContent=runningEnded?'Сначала':wantsPlay?'Пауза':'Продолжить';toggleButton.querySelector('.icon').innerHTML=playerIcon(wantsPlay?'pause':'play');
    toggleButton.setAttribute('aria-label',runningEnded?'Сначала':wantsPlay?'Пауза':'Продолжить');
    audioButton.querySelector('.control-caption').textContent=track?track.label:tracks.length?'Выбрать дорожку':'Нет дорожек';audioButton.disabled=!tracks.length;
    if(episodeButton)episodeButton.querySelector('.control-caption').textContent='Сезон '+e.season+' · Серия '+e.episode;
    if(previousButton)previousButton.disabled=episodeIndex===0;
    if(nextButton)nextButton.disabled=episodeIndex+1>=episodes.length;
    if(settingsButton){syncQuality();var resolution=currentResolution(),tier=WePlayQuality.tier(resolution);put(qualityBadge,tier);qualityBadge.hidden=!tier;settingsButton.setAttribute('aria-label',tier?'Настройки. Текущее качество: '+tier:'Настройки');refreshSettings(resolution);refreshQuality();}
    retryButton.hidden=!failed;
  }
  function hideControls(){if(!bar)return;bar.hidden=true;options.hint.hidden=true;controlsFocused=false;if(bar.contains(document.activeElement))document.getElementById('player').focus();clearTimeout(timer);}
  function armHide(){clearTimeout(timer);if(!active||menu||preview||suspended||loading||!wantsPlay||failed)return;timer=setTimeout(hideControls,5000);}
  function show(takeFocus){
    if(!bar||!options)return;bar.hidden=false;options.hint.hidden=false;updateControls();
    options.hint.textContent=preview?'← → — выбрать момент · OK — перейти · Назад — отменить':takeFocus?'← → — кнопки · ↑ — шкала времени · OK — выбрать · Назад — скрыть':'OK — пауза · ↑ — управление · ← → — перемотка';
    if(takeFocus&&!suspended){controlsFocused=true;var list=controlButtons(),selected=list.filter(function(b){return b.id===barSelection;})[0]||toggleButton;WePlayFocus.focus(selected);}
    armHide();
  }
  function choose(title,items,onSelect,onBack,config){
    config=config||{};
    closeMenu(false);clearTimeout(timer);controlsFocused=false;if(bar){bar.hidden=true;bar.setAttribute('aria-hidden','true');}menuBack=onBack||function(){show(true);};
    menuShade=el('div','native-menu-shade');menuShade.onclick=function(){closeMenu(true);};document.getElementById('player').appendChild(menuShade);menu=el('section','native-menu');menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','true');menu.setAttribute('aria-labelledby','native-menu-title');if(config.kind)menu.setAttribute('data-menu-kind',config.kind);if(settingsButton)settingsButton.setAttribute('aria-expanded',String(config.kind==='settings'||config.kind==='quality'||config.kind==='subtitles'));
    var header=el('header','native-menu-header'),heading=el('h2','',title);heading.id='native-menu-title';header.appendChild(heading);menuClose=el('button','focusable native-menu-close');menuClose.type='button';menuClose.setAttribute('aria-label','Закрыть');menuClose.innerHTML=playerIcon('x')||'×';menuClose.onclick=function(){closeMenu(true);};header.appendChild(menuClose);menu.appendChild(header);menu.appendChild(el('p','native-menu-context',options.title||''));
    var scroll=el('div','native-menu-scroll'),grid=el('div','native-menu-grid');grid.setAttribute('data-focus-grid','1');buttons=[];menuIndex=0;
    items.forEach(function(item,index){var b=el('button','focusable secondary native-choice'+(item.active?' selected':''));b.type='button';b.disabled=!!item.disabled;b.setAttribute('aria-label',item.label);if(config.kind==='quality')b.setAttribute('data-quality',String(item.value));if(item.drilldown){b.setAttribute('data-setting',item.value);b.setAttribute('aria-haspopup','dialog');}else b.setAttribute('aria-pressed',String(!!item.active));var copy=el('span','native-choice-copy');copy.appendChild(el('span','native-choice-label',item.label));if(item.caption){var caption=el('span','native-choice-caption',item.caption);caption.id='native-choice-caption-'+index;b.setAttribute('aria-describedby',caption.id);copy.appendChild(caption);}b.appendChild(copy);var mark=el('span','native-choice-check');mark.innerHTML=item.drilldown?playerIcon('caret-right'):item.active?playerIcon('check')||'✓':'';mark.setAttribute('aria-hidden','true');b.appendChild(mark);if(!b.disabled){if(item.active||item.value===config.focusValue)menuIndex=buttons.length;buttons.push(b);}b.onclick=function(){closeMenu(false);onSelect(item.value);};grid.appendChild(b);});scroll.appendChild(grid);menu.appendChild(scroll);menu.appendChild(el('p','native-menu-hint','↑ ↓ — выбор · OK — подтвердить · Назад — вернуться'));document.getElementById('player').appendChild(menu);options.hint.hidden=true;WePlayFocus.focus(buttons[menuIndex]||menuClose);
  }
  function chooseEpisode(){
    var seasons=[];episodes.forEach(function(e){if(seasons.indexOf(e.season)<0)seasons.push(e.season);});
    function series(season){choose('Сезон '+season+' · Серии',episodes.map(function(e,i){return {label:'Серия '+e.episode,caption:i===episodeIndex?'Сейчас смотрите':e.title&&e.title!=='Фильм'?e.title:'Сезон '+e.season,value:i,season:e.season,active:i===episodeIndex};}).filter(function(e){return e.season===season;}),function(i){episodeIndex=i;startEpisode();report('episodeSelected','Сезон '+episodes[i].season+', серия '+episodes[i].episode);},seasons.length>1?seasonList:null);}
    function seasonList(){choose('Выбрать сезон',seasons.map(function(s){return{label:'Сезон '+s,caption:'Серий: '+episodes.filter(function(e){return e.season===s;}).length,value:s,active:s===episodes[episodeIndex].season};}),series);}
    if(seasons.length===1)series(seasons[0]);else seasonList();
  }
  function audioOptions(){
    if(options&&options.resolveEpisode)return (episodes[episodeIndex].variants||[]).map(function(v,i){return{index:i,label:v.label};});
    var audio=episodes[episodeIndex].audio||{},names=audio.names||[],order=audio.order||[],tracks=[];
    if(hls)tracks=hls.audioTracks.map(function(t,i){return {index:i,label:names.length===hls.audioTracks.length?names[i]:(t.name||('Дорожка '+(i+1)))};});
    if(api){try{tracks=api.getTotalTrackInfo().filter(function(t){return t.type==='AUDIO';}).map(function(t,i){return{index:t.index,label:names[i]||('Дорожка '+(i+1))};});}catch(ignore){}}
    if(!tracks.length&&names.length)tracks=names.map(function(n,i){return {index:i,label:n};});
    return tracks.filter(function(t){return t.label.toLowerCase()!=='delete';}).sort(function(a,b){return (order[a.index]===undefined?a.index:order[a.index])-(order[b.index]===undefined?b.index:order[b.index]);});
  }
  function chooseAudio(){
    var tracks=audioOptions();
    if(!tracks.length){show();options.status.textContent='Дополнительных звуковых дорожек нет';setTimeout(function(){if(active)options.status.textContent='';},2500);return;}
    choose('Озвучка',tracks.map(function(t){return{label:t.label,value:t.index,active:t.index===audioSelection()};}),function(i){var previous=audioSelection();audioIndex=i;var selected=tracks.filter(function(t){return t.index===i;})[0];audioPreference=selected.label;try{localStorage.setItem('lord.audioPreference',audioPreference);}catch(ignore){}if(i===previous){show(true);return;}if(options.resolveEpisode){var position=currentTime,playing=wantsPlay;startEpisode(position,playing,'native-audio');report('audioSelected',audioPreference);return;}try{if(hls)hls.audioTrack=i;else if(api)api.setSelectTrack('AUDIO',i);else if(video.audioTracks){for(var n=0;n<video.audioTracks.length;n++)video.audioTracks[n].enabled=n===i;}report('audioSelected',audioPreference);}catch(e){error('Не удалось переключить озвучку. Попробуйте другую дорожку.');}show(true);});
  }
  function audioSelection(){return options&&options.resolveEpisode?audioIndex:hls&&hls.audioTrack>=0?hls.audioTrack:audioIndex;}
  function currentResolution(){
    var size=WePlayQuality.size(video&&video.videoWidth,video&&video.videoHeight);
    if(size.width||size.height)return size;
    if(hls){var level=hls.levels&&hls.levels[hls.currentLevel];return WePlayQuality.size(level&&level.width,level&&level.height);}
    if(api)try{if(['PLAYING','PAUSED'].indexOf(api.getState())>=0){var tracks=api.getCurrentStreamInfo();for(var i=0;i<tracks.length;i++)if(tracks[i].type==='VIDEO'){var extra=tracks[i].extra_info;extra=typeof extra==='string'?JSON.parse(extra):extra||{};return WePlayQuality.size(extra.Width||extra.width,extra.Height||extra.height);}}}catch(ignore){}
    return size;
  }
  function qualityLevels(){return WePlayQuality.levels(hls&&hls.levels);}
  function syncQuality(){if(hls&&hls.autoLevelEnabled===true)selectedQuality=0;}
  function qualityCaption(size,levels){
    var actual=WePlayQuality.height(size),current=actual?actual+'p':'';
    if(!levels.length)return current?current+' · выбор недоступен':'Качество задаёт источник';
    if(!selectedQuality)return 'Автоматически'+(current?' · '+current:'');
    return selectedQuality+'p'+(actual&&actual!==selectedQuality?' · сейчас '+current:'');
  }
  function settingsItems(size){size=size||currentResolution();var levels=qualityLevels(),tracks=hls&&hls.subtitleTracks||[],selected=tracks[hls&&hls.subtitleTrack];return [
    {label:'Качество',caption:qualityCaption(size,levels),value:'quality',drilldown:true,disabled:!levels.length},
    {label:'Субтитры',caption:tracks.length?(selected?selected.name||selected.lang||'Включены':'Выключены'):'Недоступны для этого видео',value:'subtitles',drilldown:true,disabled:!tracks.length}
  ];}
  function showSettings(focusValue){if(preview)finishSeek(false);syncQuality();barSelection='native-settings';choose('Настройки',settingsItems(),function(value){if(value==='quality')chooseQuality();else chooseSubtitles();},null,{kind:'settings',focusValue:focusValue});}
  function refreshSettings(size){if(!menu||menu.getAttribute('data-menu-kind')!=='settings')return;var focused=document.activeElement;settingsItems(size).forEach(function(item){var row=menu.querySelector('[data-setting="'+item.value+'"]');if(row){row.disabled=!!item.disabled;put(row.querySelector('.native-choice-caption'),item.caption);}});buttons=Array.prototype.filter.call(menu.querySelectorAll('.native-choice'),function(b){return !b.disabled;});var at=buttons.indexOf(focused);if(at>=0)menuIndex=at;else if(focused!==menuClose&&menu.contains(focused))WePlayFocus.focus(buttons[0]||menuClose);}
  function refreshQuality(){
    if(!menu||menu.getAttribute('data-menu-kind')!=='quality')return;
    var levels=qualityLevels();menu.querySelectorAll('[data-quality]').forEach(function(row){var height=Number(row.getAttribute('data-quality')),selected=height===selectedQuality;var disabled=height>0&&!levels.some(function(level){return level.height===height;});if(row.disabled!==disabled)row.disabled=disabled;if(row.getAttribute('aria-pressed')!==String(selected)){row.classList.toggle('selected',selected);row.setAttribute('aria-pressed',String(selected));row.querySelector('.native-choice-check').innerHTML=selected?playerIcon('check')||'✓':'';}});
    buttons=Array.prototype.filter.call(menu.querySelectorAll('.native-choice'),function(b){return !b.disabled;});var at=buttons.indexOf(document.activeElement);if(at>=0)menuIndex=at;else if(document.activeElement!==menuClose&&menu.contains(document.activeElement))WePlayFocus.focus(buttons[0]||menuClose);
  }
  function chooseQuality(){
    syncQuality();if(!hls||!qualityLevels().length){showSettings('quality');return;}var choices=[{label:'Автоматически',caption:'Подстраивается под скорость интернета',value:0,active:!selectedQuality}];
    qualityLevels().slice().reverse().forEach(function(level){choices.push({label:level.height+'p',caption:WePlayQuality.description(level),value:level.height,active:selectedQuality===level.height});});
    choose('Качество видео',choices,function(height){
      if(!hls)return;var level=height&&qualityLevels().filter(function(candidate){return candidate.height===height;})[0];if(height&&!level){chooseQuality();return;}
      qualityPreference=selectedQuality=height;hls.nextLevel=level?level.index:-1;
      try{localStorage.setItem('lord.quality.v1',String(qualityPreference));}catch(ignore){}showSettings('quality');report('qualitySelected',qualityPreference||'auto');
    },function(){showSettings('quality');},{kind:'quality'});
  }
  function chooseSubtitles(){
    var tracks=hls&&hls.subtitleTracks||[];if(!tracks.length){showSettings('subtitles');return;}var choices=[{label:'Выключены',value:-1,active:hls.subtitleTrack<0}];
    tracks.forEach(function(track,index){choices.push({label:track.name||track.lang||'Дорожка '+(index+1),value:index,active:hls.subtitleTrack===index});});
    choose('Субтитры',choices,function(index){hls.subtitleTrack=index;hls.subtitleDisplay=index>=0;showSettings('subtitles');report('subtitlesSelected',index);},function(){showSettings('subtitles');},{kind:'subtitles'});
  }
  function startEpisode(position,playing,focusId){
    var token=++request,e=episodes[episodeIndex];position=typeof position==='number'?position:0;stopEngine();closeMenu(false);currentTime=position;totalTime=0;failed=false;loading=true;audioIndex=0;selectedQuality=0;wantsPlay=playing!==false;
    runningEpisode=e;runningEnded=false;resumeTarget=position;lastSavedAt=0;postplayAutoplay=true;
    if(options.resolveEpisode){audioIndex=0;(e.variants||[]).some(function(v,i){if(v.label===audioPreference){audioIndex=i;return true;}return false;});}
    options.status.textContent='Загружаем видео…';options.surface.innerHTML='';
    options.hint.textContent='OK или ↑ — управление · ← → — перемотка на 10 с · Назад — выйти';
    makeBar();barSelection=focusId||'native-toggle';controlsFocused=!!focusId;show(!!focusId);if(!suspended&&!focusId)document.getElementById('player').focus();
    var following=followingEpisode(episodeIndex),currentIndex=episodeIndex,serial=options.mediaKind==='series'||options.mediaKind!=='movie'&&!!e.season;
    postplay=WePlayPostplay.create({root:document.getElementById('player'),icon:playerIcon,dismissed:postplayDismissals[currentIndex],
      next:following&&serial?{kind:'episode',title:options.title||'Следующая серия',caption:'Сезон '+following.season+' · Серия '+following.episode,item:options.mediaItem}:null,
      load:!serial&&options.nextMedia?options.nextMedia:null,
      state:function(){return{time:currentTime,duration:totalTime,started:started,ended:runningEnded,creditsStart:creditsStart(e),playing:wantsPlay&&!loading,failed:failed,autoplay:postplayAutoplay,blocked:!active||suspended||!!menu||!!preview||document.hidden};},
      controlsVisible:function(){return !!bar&&!bar.hidden;},
      returnFocus:function(){if(!active)return;if(runningEnded){show(false);WePlayFocus.focus(document.getElementById('native-exit'),false);}else document.getElementById('player').focus();},
      focusControls:function(){show(false);controlsFocused=true;WePlayFocus.focus(seekBar,false);},
      onDismiss:function(){postplayDismissals[currentIndex]=true;},
      onWatch:function(next){saveProgress(true,true);runningEnded=true;if(next.kind==='episode'){episodeIndex=currentIndex+1;startEpisode(0,true);report('postplayEpisode',episodeIndex);}else if(options.onNextMedia)options.onNextMedia(next.item);}
    });
    if(options.resolveEpisode){options.resolveEpisode(e,audioIndex).then(function(stream){if(token===request)startEngine(token,e,stream,position);}).catch(function(err){if(token===request)error(err.message||'Не удалось загрузить видео. Попробуйте ещё раз.');});}
    else startEngine(token,e,e.hls,position);
  }
  function startEngine(token,e,stream,position){
    if(window.Hls&&Hls.isSupported()){
      api=null;video=el('video');video.id='native-video';video.autoplay=false;video.playsInline=true;
      var media=video;media.addEventListener('pause',function(){if(token===request)saveProgress(true);});media.addEventListener('timeupdate',function(){if(token===request)tick(media.currentTime*1000);});
      ['loadedmetadata','durationchange','loadeddata','resize'].forEach(function(name){media.addEventListener(name,function(){if(token===request)tick(currentTime);});});
      media.addEventListener('playing',function(){if(token===request){if(suspended||preview){pauseEngine();return;}clearTimeout(bufferTimer);loading=false;failed=false;currentTime=media.currentTime*1000;playbackStarted();updateControls();armHide();report('videoPlaying',media.videoWidth+'x'+media.videoHeight);}});
      media.addEventListener('waiting',function(){if(token===request&&!preview){loading=true;updateControls();armHide();clearTimeout(bufferTimer);bufferTimer=setTimeout(function(){if(token===request&&loading&&!suspended&&!preview)options.status.textContent='Буферизация…';},600);}});
      media.addEventListener('ended',function(){if(token===request&&!suspended)completed();});
      options.surface.appendChild(media);
      hls=new Hls({loader:ProviderLoader,enableWorker:false,debug:false,startLevel:0,startPosition:position/1000,capLevelToPlayerSize:true,backBufferLength:20,maxBufferLength:30,maxMaxBufferLength:60});
      hls.on(Hls.Events.MANIFEST_PARSED,function(ev,data){if(token!==request)return;report('hlsReady',data.levels.length);if(qualityPreference){var chosen=WePlayQuality.preferred(qualityLevels(),qualityPreference);if(chosen){hls.nextLevel=chosen.index;selectedQuality=chosen.height;}}if(hls.subtitleTracks&&hls.subtitleTracks.length)hls.subtitleTrack=-1;tick(currentTime);if(wantsPlay)play();});
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED,function(){if(token!==request||!audioPreference||options.resolveEpisode)return;var selected=audioOptions().filter(function(t){return t.label===audioPreference;})[0];if(selected)hls.audioTrack=selected.index;});
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED,function(ev,data){if(token===request){updateControls();report('audioSwitched',data.id);}});
      if(Hls.Events.LEVEL_SWITCHED)hls.on(Hls.Events.LEVEL_SWITCHED,function(){if(token===request)updateControls();});
      if(Hls.Events.LEVELS_UPDATED)hls.on(Hls.Events.LEVELS_UPDATED,function(){if(token===request){updateControls();if(menu&&menu.getAttribute('data-menu-kind')==='quality')chooseQuality();}});
      if(Hls.Events.SUBTITLE_TRACKS_UPDATED)hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED,function(){if(token===request)updateControls();});
      hls.on(Hls.Events.ERROR,function(ev,data){if(token!==request)return;report('hlsEvent',data.details+(data.response?' HTTP '+data.response.code:''));if(data.fatal){error('Не удалось загрузить видео. Попробуйте ещё раз.');}});
      hls.attachMedia(media);hls.loadSource(stream);report('nativeStarted','HLS in application');
    }else if(window.webapis&&webapis.avplay){
      document.body.classList.add('avplay-active');
      api=webapis.avplay;var object=el('object');object.type='application/avplayer';object.id='native-video';options.surface.appendChild(object);
      try{
        api.open(stream);api.setDisplayRect(0,0,1920,1080);
        try{api.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');api.setTimeoutForBuffering(20);api.setStreamingProperty('ADAPTIVE_INFO','STARTBITRATE=LOWEST');}catch(ignore){}
        api.setListener({
          onbufferingstart:function(){if(token===request){loading=true;updateControls();armHide();options.status.textContent='Загрузка видео…';}},
          onbufferingprogress:function(p){if(token===request)options.status.textContent='Загрузка видео: '+p+'%';},
          onbufferingcomplete:function(){if(token===request){loading=false;options.status.textContent='';updateControls();armHide();report('nativeBuffered',episodeIndex);}},
          onevent:function(event){if(token===request&&(event==='PLAYER_MSG_RESOLUTION_CHANGED'||event==='PLAYER_MSG_BITRATE_CHANGE'))updateControls();},
          oncurrentplaytime:function(ms){if(token===request){currentTime=ms;if(state()==='PLAYING'&&!loading)playbackStarted();tick(ms);}},
          onstreamcompleted:function(){if(token===request&&!suspended)completed();},
          onerror:function(code){if(token===request)error('Не удалось воспроизвести видео: '+code);},
          onerrormsg:function(code,message){if(token===request)report('nativeDetail',String(code)+': '+String(message).slice(0,150));}
        });
        prepareTimer=setTimeout(function(){if(token===request)error('Источник не ответил. Попробуйте открыть фильм позже.');},30000);
        api.prepareAsync(function(){if(token!==request)return;clearTimeout(prepareTimer);if(position>0)try{api.seekTo(position);}catch(ignore){}if(wantsPlay)play();totalTime=api.getDuration();report('nativeStarted',JSON.stringify({duration:totalTime,episode:episodeIndex}));show(false);},function(err){if(token===request){report('nativePrepareError',err.name||err.message||err);error('Не удалось загрузить видео. Попробуйте ещё раз.');}});
      }catch(err){error('Не удалось открыть видео: '+err.message);}
    }else{
      api=null;video=el('video');video.id='native-video';video.autoplay=false;video.src=stream;var media=video;['loadedmetadata','loadeddata','resize'].forEach(function(name){media.addEventListener(name,function(){if(token===request){if(name==='loadedmetadata'&&position>0)media.currentTime=position/1000;updateControls();}});});video.addEventListener('pause',function(){if(token===request)saveProgress(true);});video.addEventListener('timeupdate',function(){if(token===request)tick(video.currentTime*1000);});video.addEventListener('playing',function(){if(token===request){if(suspended){pauseEngine();return;}loading=false;failed=false;currentTime=media.currentTime*1000;playbackStarted();options.status.textContent='';updateControls();armHide();}});video.addEventListener('ended',function(){if(token===request&&!suspended)completed();});video.addEventListener('error',function(){if(token===request)error('Не удалось загрузить видео. Попробуйте ещё раз.');});options.surface.appendChild(video);if(wantsPlay)play();
    }
  }
  function control(id,label,name,caption,action){
    var b=el('button','focusable secondary native-control');b.id=id;b.type='button';b.setAttribute('aria-label',label);
    if(name){var icon=el('span','icon');icon.setAttribute('aria-hidden','true');icon.innerHTML=playerIcon(name);b.appendChild(icon);}
    var text=el('span','control-copy');text.appendChild(el('span','control-label',label));if(caption!==undefined)text.appendChild(el('span','control-caption',caption));b.appendChild(text);
    b.onclick=function(){controlsFocused=true;barSelection=id;action();};return b;
  }
  function makeBar(){
    if(bar)bar.remove();bar=el('section','native-controls');bar.setAttribute('aria-label','Управление видео');barSelection=failed?'native-retry':'native-toggle';
    var now=el('header','native-now'),exit=control('native-exit','Назад','arrow-left',undefined,function(){if(options.onExit)options.onExit();});now.appendChild(exit);
    var name=el('div','native-now-copy');nowTitle=el('h2','native-now-title');nowEpisode=el('p','native-now-episode');stateLabel=el('span','native-state');name.appendChild(nowTitle);name.appendChild(nowEpisode);now.appendChild(name);now.appendChild(stateLabel);bar.appendChild(now);
    var bottom=el('div','native-bottom');seekBar=el('div','native-timeline focusable');seekBar.id='native-seek';seekBar.tabIndex=0;seekBar.setAttribute('role','slider');seekBar.setAttribute('aria-label','Перемотка');seekBar.setAttribute('aria-valuemin','0');seekBar.setAttribute('aria-valuemax','0');seekBar.setAttribute('aria-valuenow','0');
    var track=el('div','native-track');bufferFill=el('span','native-buffer-fill');timeline=el('span','native-timeline-fill');seekKnob=el('span','native-seek-knob');seekBubble=el('span','native-seek-bubble');seekBubble.hidden=true;track.appendChild(bufferFill);track.appendChild(timeline);track.appendChild(seekKnob);seekBar.appendChild(track);seekBar.appendChild(seekBubble);bottom.appendChild(seekBar);
    var seekRow=el('div','native-time-row');elapsed=el('span','native-time','00:00');remaining=el('span','native-time native-total-time','—');finishLabel=el('span','native-remaining');seekRow.appendChild(elapsed);seekRow.appendChild(remaining);seekRow.appendChild(finishLabel);bottom.appendChild(seekRow);
    seekBar.addEventListener('mousedown',function(event){if(event.button!==0||totalTime<=0||failed)return;event.preventDefault();beginSeek(0,false);function move(e){if(!preview)return;var r=seekBar.getBoundingClientRect();preview.target=clamp((e.clientX-r.left)/r.width*totalTime);tick(currentTime);}function up(e){move(e);if(pointerCleanup)pointerCleanup();if(preview)finishSeek(true);}pointerCleanup=function(){document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);pointerCleanup=null;};document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);move(event);});
    var actions=el('div','native-actions'),audioGroup=el('div','native-audio-group'),transport=el('div','native-transport');audioButton=control('native-audio','Озвучка','speaker-high','',chooseAudio);audioGroup.appendChild(audioButton);actions.appendChild(audioGroup);
    previousButton=null;nextButton=null;
    if(episodes.length>1){previousButton=control('native-previous','Предыдущая','caret-left',undefined,function(){if(episodeIndex>0){episodeIndex--;startEpisode(0,true,'native-toggle');}});previousButton.setAttribute('aria-label','Предыдущая серия');transport.appendChild(previousButton);}
    toggleButton=control('native-toggle','Пауза','pause',undefined,toggle);transport.appendChild(toggleButton);
    if(episodes.length>1){nextButton=control('native-next','Следующая','caret-right',undefined,function(){if(episodeIndex+1<episodes.length){episodeIndex++;startEpisode(0,true,'native-toggle');}});nextButton.setAttribute('aria-label','Следующая серия');transport.appendChild(nextButton);}actions.appendChild(transport);
    var tools=el('div','native-tools');episodeButton=null;
    if(episodes.length>1){episodeButton=control('native-episodes','Серии','list-numbers','',chooseEpisode);tools.appendChild(episodeButton);}
    retryButton=control('native-retry','Попробовать ещё',null,undefined,function(){startEpisode(resumeTarget||currentTime,wantsPlay,'native-toggle');});retryButton.hidden=!failed;tools.appendChild(retryButton);
    settingsButton=control('native-settings','Настройки','gear-six',undefined,showSettings);settingsButton.setAttribute('aria-haspopup','dialog');settingsButton.setAttribute('aria-expanded','false');qualityBadge=el('span','native-settings-badge');qualityBadge.setAttribute('aria-hidden','true');qualityBadge.hidden=true;settingsButton.appendChild(qualityBadge);tools.appendChild(settingsButton);actions.appendChild(tools);bottom.appendChild(actions);bar.appendChild(bottom);document.getElementById('player').appendChild(bar);updateControls();tick(currentTime);
  }
  var pointerAt=0,playerRoot=document.getElementById('player');
  playerRoot.addEventListener('mousemove',function(){if(active&&!menu&&!suspended&&!preview&&Date.now()-pointerAt>250){pointerAt=Date.now();show(false);}});
  playerRoot.addEventListener('click',function(event){if(active&&!menu&&!suspended&&(event.target.id==='native-video'||event.target.id==='player-surface')){if(preview)finishSeek(true,true);else toggle();show(true);}});
  document.addEventListener('visibilitychange',function(){if(document.hidden)saveProgress(true);});
  window.addEventListener('pagehide',function(){saveProgress(true);});
  window.addEventListener('beforeunload',function(){saveProgress(true);});
  window.WePlayNativePlayer={
    parse:parse,
    get active(){return active;},
    snapshot:function(){return {active:active,engine:hls?'HLS':api?'AVPlay':'HTML5',state:state(),time:currentTime,duration:totalTime,episodes:episodes.length,episode:episodeIndex,season:episodes[episodeIndex]&&episodes[episodeIndex].season,episodeNumber:episodes[episodeIndex]&&episodes[episodeIndex].episode,audioTrack:options&&options.resolveEpisode?audioIndex:hls?hls.audioTrack:audioIndex,audioChoices:active?audioOptions():[],controls:!!bar&&!bar.hidden,controlsFocused:controlsFocused,menu:menu&&menu.querySelector('h2').textContent,suspended:suspended,seeking:!!preview,seekTarget:preview&&preview.target,wantsPlay:wantsPlay,quality:selectedQuality||'auto',resolution:currentResolution(),subtitle:hls&&hls.subtitleTrack,postplay:postplay&&postplay.snapshot()};},
    start:function(html,opts){
      this.close();options=opts;postplayDismissals={};episodes=WePlaySeasons.ordered(parse(html));var clock=/\bunixTime\s*=\s*(\d+)/.exec(html);serverOffset=clock?Number(clock[1])*1000-Date.now():0;
      episodeIndex=opts.resume?WePlaySeasons.resumeIndex(episodes,opts.resume):opts.startSeason===undefined||opts.startSeason===null?0:WePlaySeasons.startIndex(episodes,opts.startSeason);
      if(episodeIndex<0)throw new Error(opts.resume?'Сохранённая серия недоступна в этом источнике.':'Выбранный сезон недоступен в этом источнике.');
      active=true;document.body.classList.add('native-playing');startEpisode(opts.resume?opts.resume.position:0);report('nativeResolved',episodes.length);
    },
    close:function(){++request;active=false;stopEngine();closeMenu(false);if(bar)bar.remove();bar=null;timeline=null;controlsFocused=false;suspended=false;clearTimeout(timer);document.body.classList.remove('native-playing');document.getElementById('player').classList.remove('native-loading');api=null;options=null;},
    suspendForExit:function(){var resume=active&&(preview?preview.playing:wantsPlay)&&!failed;preview=null;suspended=true;clearTimeout(timer);pauseEngine();saveProgress(true);updateControls();return resume;},
    restoreAfterExit:function(resume){suspended=false;if(resume&&!failed)play();else pause();updateControls();armHide();},
    key:function(k,shift,repeat){
      if(!active)return false;
      if(k===415){postplayAutoplay=true;if(runningEnded&&postplay&&postplay.snapshot().visible&&postplay.snapshot().kind==='episode'){postplay.update();return true;}if(preview)finishSeek(true,true);else play();if(!menu)show(controlsFocused);return true;}if(k===19){if(runningEnded)postplayAutoplay=false;if(preview)finishSeek(false,false);else pause();if(!menu)show(controlsFocused);return true;}
      if(k===10252||k===32){if(runningEnded&&postplay&&postplay.snapshot().visible&&postplay.snapshot().kind==='episode'){postplayAutoplay=!postplayAutoplay;postplay.update();return true;}if(preview)finishSeek(true,true);else if(wantsPlay)pause();else play();if(!menu)show(controlsFocused);return true;}
      if(k===412||k===417){if(menu)seek(k===412?-30:30);else beginSeek(k===412?-1:1,repeat,30);return true;}
      if(menu){
        if(k===10009||k===27){var callback=menuBack;closeMenu(false);if(callback)callback();return true;}
        if(k===13){if(document.activeElement===menuClose)menuClose.click();else if(buttons[menuIndex])buttons[menuIndex].click();return true;}
        if((k>=37&&k<=40)||k===9||k===33||k===34||k===427||k===428){
          if(k===9){var list=[menuClose].concat(buttons),at=list.indexOf(document.activeElement);WePlayFocus.focus(list[(at+(shift?-1:1)+list.length)%list.length]);}
          else if(k===38&&document.activeElement===buttons[0])WePlayFocus.focus(menuClose);
          else if(k===40&&document.activeElement===menuClose)WePlayFocus.focus(buttons[menuIndex]||buttons[0]);
          else if(k===33||k===34||k===427||k===428)WePlayFocus.page(k===33||k===427?-1:1);
          else WePlayFocus.move(k);
          if(document.activeElement!==menuClose)menuIndex=Math.max(0,buttons.indexOf(document.activeElement));return true;
        }
        return false;
      }
      if(postplay&&postplay.key(k,shift,repeat))return true;
      if(k===9){if(preview)finishSeek(false);show(false);var ordered=[document.getElementById('native-exit')].concat(totalTime>0?[seekBar]:[]).concat(controlButtons()),at=ordered.indexOf(document.activeElement),next=ordered[(at+(shift?-1:1)+ordered.length)%ordered.length];controlsFocused=true;WePlayFocus.focus(next);if(next&&next.tagName==='BUTTON'&&next.id!=='native-exit')barSelection=next.id;armHide();return true;}
      if(preview){
        if(k===27||k===10009){finishSeek(false);return true;}
        if(k===13){finishSeek(true);return true;}
        if(k===37||k===39){beginSeek(k===37?-1:1,repeat);return true;}
        if(k===38||k===40){finishSeek(false);if(k===38)WePlayFocus.focus(document.getElementById('native-exit'));else show(true);return true;}
      }
      if(k===27||k===10009){if(bar&&!bar.hidden){hideControls();return true;}return false;}
      if(bar&&!bar.hidden&&document.activeElement===seekBar){
        if(k===37||k===39){beginSeek(k===37?-1:1,repeat);return true;}
        if(k===38){WePlayFocus.focus(document.getElementById('native-exit'));return true;}
        if(k===40||k===13){show(true);return true;}
      }
      if(bar&&!bar.hidden&&document.activeElement.id==='native-exit'){
        if(k===13){document.activeElement.click();return true;}if(k===40){if(totalTime>0)WePlayFocus.focus(seekBar);else show(true);return true;}if(k>=37&&k<=40)return true;
      }
      if(controlsFocused&&bar&&!bar.hidden){
        if(k===13){var focused=document.activeElement;if(bar.contains(focused)&&focused.tagName==='BUTTON')focused.click();else show(true);return true;}
        if(k===37||k===39||k===9){var list=controlButtons(),at=list.indexOf(document.activeElement);at=Math.max(0,Math.min(list.length-1,(at<0?0:at)+(k===37||k===9&&shift?-1:1)));if(list[at]){barSelection=list[at].id;WePlayFocus.focus(list[at]);}armHide();return true;}
        if(k===40){hideControls();return true;}
        if(k===38){if(totalTime>0)WePlayFocus.focus(seekBar);armHide();return true;}
      }
      if(k===13){toggle();show(true);return true;}
      if(k===38){show(false);controlsFocused=true;if(totalTime>0)WePlayFocus.focus(seekBar);else show(true);return true;}
      if(k===40||k===457||k===73||k===9){show(true);return true;}
      if(k===37||k===39){beginSeek(k===37?-1:1,repeat);return true;}
      if(k===403){barSelection='native-audio';chooseAudio();return true;}
      return false;
    }
  };
}());

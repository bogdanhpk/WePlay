async(page)=>{
 const app='app',android='android',reports=[];
 for(const platform of ['android','tizen','webos']){
  const context=await page.context().browser().newContext({viewport:{width:1920,height:1080}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><section id="player" tabindex="-1"><h1 id="player-title">Тест</h1><div id="player-surface"></div><div id="player-status"></div><div id="player-hint"></div></section></body></html>'}));
  try{
   await p.goto('https://intro.fixture.invalid/');
   await p.evaluate(platform=>{
    window.WePlayTV={name:platform,isForeground:()=>true,mediaURL:s=>s};window.WePlayFocus={focus:e=>e?.focus()};window.WEPLAY_ICONS={};window.WEPLAY_PLAYER_ICONS={};window.QA_SAMPLES=[];
    const values=new WeakMap(),value=e=>{if(!values.has(e))values.set(e,{time:0,paused:true});return values.get(e)};
    Object.defineProperties(HTMLMediaElement.prototype,{currentTime:{configurable:true,get(){return value(this).time},set(t){value(this).time=t}},duration:{configurable:true,get(){return 600}},paused:{configurable:true,get(){return value(this).paused}},readyState:{configurable:true,get(){return 4}},src:{configurable:true,get(){return ''},set(){setTimeout(()=>{this.dispatchEvent(new Event('loadedmetadata'));this.dispatchEvent(new Event('loadeddata'))},0)}}});
    Object.defineProperties(HTMLVideoElement.prototype,{videoWidth:{configurable:true,get(){return 1920}},videoHeight:{configurable:true,get(){return 1080}}});
    HTMLMediaElement.prototype.play=function(){value(this).paused=false;setTimeout(()=>this.dispatchEvent(new Event('playing')),0);return Promise.resolve()};HTMLMediaElement.prototype.pause=function(){value(this).paused=true;this.dispatchEvent(new Event('pause'))};HTMLMediaElement.prototype.load=function(){};
    class Hls{constructor(config){this.config=config;this.events={};this.levels=[{width:1920,height:1080,bitrate:5000000}];this.currentLevel=0;this.audioTracks=[];this.subtitleTracks=[];this.autoLevelEnabled=true;}on(k,cb){(this.events[k]??=[]).push(cb)}attachMedia(media){this.media=media}loadSource(url){this.media.src=url;setTimeout(()=>{for(const cb of this.events.manifest||[])cb('manifest',{levels:this.levels})},0)}startLoad(){}stopLoad(){}destroy(){}static isSupported(){return platform!=='tizen'}}
    Hls.Events={MANIFEST_PARSED:'manifest',AUDIO_TRACKS_UPDATED:'audio',AUDIO_TRACK_SWITCHED:'audioSwitch',SUBTITLE_TRACKS_UPDATED:'subs',LEVEL_SWITCHED:'level',LEVELS_UPDATED:'levels',ERROR:'error'};Hls.ErrorTypes={NETWORK_ERROR:'network',MEDIA_ERROR:'media'};window.Hls=Hls;
    if(platform==='tizen'){
     let state='NONE',listener={},position=0;window.webapis={avplay:{open:()=>{state='IDLE';position=0},close:()=>{state='NONE'},stop:()=>{state='IDLE'},getState:()=>state,getDuration:()=>600000,getCurrentTime:()=>position,setListener:x=>{listener=x},setDisplayRect:()=>{},setDisplayMethod:()=>{},setTimeoutForBuffering:()=>{},setStreamingProperty:()=>{},prepareAsync:done=>setTimeout(()=>{state='READY';listener.onbufferingcomplete?.();done()},0),seekTo:(at,done)=>{position=at;listener.oncurrentplaytime?.(at);done?.()},play:()=>{state='PLAYING';listener.oncurrentplaytime?.(position)},pause:()=>{state='PAUSED'},getCurrentStreamInfo:()=>[{type:'VIDEO',extra_info:'{"Width":1920,"Height":1080}'}],getTotalTrackInfo:()=>[]}};
     window.QA_TIME=ms=>{position=ms;listener.oncurrentplaytime?.(ms)};
    }else if(platform==='android'){
     let state={},commands=[];window.QA_COMMANDS=commands;
     const emit=(event,more={})=>{const snapshot={...state,...more,event};setTimeout(()=>WePlayAndroidVideo.receive(snapshot),0)};
     window.WePlayVideoBridge={postMessage:raw=>{const c=JSON.parse(raw);commands.push(c);if(c.action==='close')return;if(c.action==='open'){state={session:c.session,sequence:c.sequence,position:c.position,duration:600000,buffered:c.position+30000,state:2,wantsPlay:false,playing:false,rendered:false,width:1920,height:1080,currentLevel:0};emit('tracks',{levels:[{width:1920,height:1080,bitrate:5000000}],audioTracks:[],subtitleTracks:[]});return;}state.sequence=c.sequence;if(c.action==='seek')state.position=c.position;if(c.action==='pause'){state.wantsPlay=false;state.playing=false;}if(c.action==='play'){state.wantsPlay=true;state.playing=true;state.state=3;state.rendered=true;}emit('state');}};
     window.QA_TIME=ms=>{state.position=ms;emit('state')};
    }else window.QA_TIME=ms=>{const v=document.getElementById('native-video');v.currentTime=ms/1000;v.dispatchEvent(new Event('timeupdate'))};
   },platform);
   for(const name of ['network.js','seasons.js','audio-tracks.js','quality.js','seek-preview.js','postplay.js','skip-intro.js'])await p.addScriptTag({path:app+'/'+name});
   if(platform==='android')await p.addScriptTag({path:android+'/platform/android-video.js'});
   await p.addScriptTag({path:app+'/native-player.js'});
   for(const name of ['style.css','player.css','postplay.css'])await p.addStyleTag({path:app+'/'+name});
   await p.addStyleTag({content:'#player{position:fixed;inset:0;background:#101010}#player-surface{position:absolute;inset:0}#player-title,#player-hint{display:none}#native-video{width:100%;height:100%}'});
   await p.evaluate(()=>{
    document.body.classList.add('playback-open');
    const episodes=[1,2].map(episode=>({season:1,episode,variants:[{label:'Дубляж',preferenceKey:'dub'}]}));
    WePlayNativePlayer.start({episodes},{surface:document.getElementById('player-surface'),status:document.getElementById('player-status'),hint:document.getElementById('player-hint'),title:'Проверка заставки',mediaKind:'series',onProgress:s=>QA_SAMPLES.push(s),onExit:()=>{window.QA_EXIT=true},resolveEpisode:async e=>({url:'https://video.fixture.invalid/'+e.episode+'.m3u8',format:'hls',transport:'plain',introRange:{start:10000,end:90000}})});
   });
   await p.waitForFunction(()=>WePlayNativePlayer.snapshot().state==='PLAYING');
   if(await p.locator('#native-skip-intro').isVisible())throw Error('Intro shown before its start');
   await p.evaluate(()=>QA_TIME(12000));await p.waitForFunction(()=>WePlayNativePlayer.snapshot().intro.visible&&document.activeElement.id==='native-skip-intro');
   const bounds=await p.locator('#native-skip-intro').boundingBox();if(bounds.x<0||bounds.x+bounds.width>1841||bounds.y<0||bounds.y+bounds.height>1001)throw Error('Unsafe bounds '+JSON.stringify(bounds));
   if(platform==='android')await p.screenshot({path:'output/playwright/skip-intro.png'});
   await p.evaluate(()=>WePlayNativePlayer.key(13));await p.waitForFunction(()=>WePlayNativePlayer.snapshot().time===90000&&!WePlayNativePlayer.snapshot().intro.visible);
   let s=await p.evaluate(()=>WePlayNativePlayer.snapshot());if(!s.wantsPlay)throw Error('Skip paused playback');
   await p.evaluate(()=>QA_TIME(12000));await p.waitForFunction(()=>document.activeElement.id==='native-skip-intro');
   await p.evaluate(()=>WePlayNativePlayer.key(19));await p.evaluate(()=>WePlayNativePlayer.key(13));await p.waitForFunction(()=>WePlayNativePlayer.snapshot().time===90000);s=await p.evaluate(()=>WePlayNativePlayer.snapshot());if(s.wantsPlay)throw Error('Skip lost pause');
   await p.evaluate(()=>{WePlayNativePlayer.key(415);QA_TIME(12000)});await p.waitForFunction(()=>document.activeElement.id==='native-skip-intro');
   await p.evaluate(()=>WePlayNativePlayer.key(27));if(await p.locator('#native-skip-intro').isVisible())throw Error('Back did not dismiss intro');if(await p.evaluate(()=>!!window.QA_EXIT))throw Error('Back exited playback');
   await p.evaluate(()=>{QA_TIME(1000)});await p.evaluate(()=>QA_TIME(12000));await p.waitForFunction(()=>document.activeElement.id==='native-skip-intro');
   await p.evaluate(()=>WePlayNativePlayer.key(40));await p.waitForFunction(()=>document.activeElement.id==='native-toggle');
   await p.evaluate(()=>document.getElementById('native-settings').click());await p.waitForFunction(()=>!WePlayNativePlayer.snapshot().intro.visible);await p.evaluate(()=>WePlayNativePlayer.key(27));
   await p.evaluate(()=>QA_TIME(575000));await p.waitForFunction(()=>document.activeElement.id==='postplay-watch');await p.evaluate(()=>WePlayNativePlayer.key(13));await p.waitForFunction(()=>WePlayNativePlayer.snapshot().episodeNumber===2&&WePlayNativePlayer.snapshot().state==='PLAYING');
   const result=await p.evaluate(()=>({engine:WePlayNativePlayer.snapshot().engine,episode:WePlayNativePlayer.snapshot().episodeNumber,savedSkip:QA_SAMPLES.some(s=>s.position===90000),seekCommand:window.QA_COMMANDS?.some(c=>c.action==='seek'&&c.position===90000)}));if(!result.savedSkip)throw Error('Skipped position not saved');
   await p.evaluate(()=>{
    window.WePlayCatalogUnion={identifiers:()=>({imdb:'tt0903747'})};WePlayNetwork.request=(url,init,opts)=>new Promise(resolve=>{window.QA_RELEASE=()=>resolve(JSON.stringify({imdb_id:'tt0903747',season:1,episode:1,segments:{intro:{start_ms:10000,end_ms:80000,match:'exact',offset_ms:0,confidence:.9}}}))});
    WePlayNativePlayer.start({episodes:[{season:1,episode:1,variants:[{label:'Дубляж',preferenceKey:'dub'}]}]},{surface:document.getElementById('player-surface'),status:document.getElementById('player-status'),hint:document.getElementById('player-hint'),title:'Медленный API',mediaItem:{},mediaKind:'series',resume:{season:1,episode:1,position:12000},onProgress:()=>{},resolveEpisode:async()=>({url:'https://video.fixture.invalid/slow.m3u8',format:'hls',transport:'plain'})});
   });
   await p.waitForFunction(()=>WePlayNativePlayer.snapshot().state==='PLAYING'&&WePlayNativePlayer.snapshot().intro.loading);if(await p.locator('#native-skip-intro').isVisible())throw Error('Guessed a timestamp before API result');await p.evaluate(()=>{QA_TIME(12000);QA_RELEASE()});await p.waitForFunction(()=>document.activeElement.id==='native-skip-intro');await p.evaluate(()=>WePlayNativePlayer.key(13));await p.waitForFunction(()=>WePlayNativePlayer.snapshot().time===80000);
   await p.evaluate(()=>{document.body.classList.remove('playback-open');WePlayNativePlayer.close()});if(await p.locator('#native-skip-intro').count())throw Error('Intro leaked after close');if(errors.length)throw Error(errors.join('; '));
   reports.push({platform,...result,checks:['immediate focus and one OK','skip seeks to exact end','pause preserved','Back dismisses without exit','rewind offers intro again','settings hide skip','next episode immediately focused','slow timestamp API never delays video','no guessed skip before metadata','cleanup'],errors});
  }catch(e){throw Error(JSON.stringify({platform,error:e.message,errors,state:await p.evaluate(()=>window.WePlayNativePlayer?.snapshot())}));}finally{await context.close()}
 }
 return{result:'PASS',reports};
}

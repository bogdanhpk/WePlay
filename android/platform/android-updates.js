/* Android APK updates use the same visual action as Tizen, with Android's own installer. */
(function(){
  'use strict';
  var state={available:false,phase:'idle'},opened=false,trigger=null,callback=null,saved=[],scroll=0,autoInstall=false;
  var modal=document.createElement('div');modal.id='update-modal';modal.hidden=true;
  modal.innerHTML='<section class="player-confirm" role="dialog" aria-modal="true" aria-labelledby="update-title" aria-describedby="update-description"><h2 id="update-title">Обновить WePlay?</h2><p id="update-description"></p><div class="android-update-progress" hidden role="progressbar" aria-label="Загрузка обновления" aria-valuemin="0" aria-valuemax="100"><span></span></div><div class="confirm-actions"><button id="update-apply" class="primary focusable">Скачать и обновить</button><button id="update-later" class="secondary focusable">Позже</button></div></section>';
  document.getElementById('stage').appendChild(modal);
  var apply=modal.querySelector('#update-apply'),later=modal.querySelector('#update-later'),description=modal.querySelector('#update-description'),heading=modal.querySelector('#update-title'),progress=modal.querySelector('[role="progressbar"]'),fill=progress.firstElementChild;
  function idle(){return !document.hidden&&!document.body.classList.contains('playback-open')&&!(window.WePlayNativePlayer&&WePlayNativePlayer.active);}
  function send(action){if(window.WePlayUpdateBridge)WePlayUpdateBridge.postMessage(JSON.stringify({action:action,idle:idle()}));}
  function preferred(){return document.activeElement===later||apply.disabled?later:apply;}
  function close(restore){
    if(!opened)return;autoInstall=false;send('cancel');
    opened=false;modal.hidden=true;document.getElementById('stage').classList.remove('update-open');
    saved.forEach(function(entry){if(entry.value===null)entry.node.removeAttribute('aria-hidden');else entry.node.setAttribute('aria-hidden',entry.value);});saved=[];
    var previous=trigger,done=callback;trigger=null;callback=null;
    if(previous)previous.setAttribute('aria-expanded','false');
    if(restore!==false){if(done)done();WePlayFocus.focus(previous,false);document.getElementById('content').scrollTop=scroll;}
  }
  function paint(){
    document.querySelectorAll('.update-action').forEach(function(button){button.hidden=!state.available;if(button.parentNode)button.parentNode.hidden=!state.available;button.setAttribute('aria-label',state.available?'Доступно обновление WePlay '+state.version:'Обновление WePlay');});
    if(!opened)return;
    var downloading=state.phase==='downloading',installing=state.phase==='installing',percent=state.size?Math.min(100,Math.floor(100*state.received/state.size)):0;
    heading.textContent=downloading?'Загружаем обновление':installing?'Установка обновления':'Обновить WePlay?';
    description.textContent=state.error||(downloading?'Версия '+state.version+' · '+percent+'%. История просмотра и избранное сохранятся.':installing?'Подтвердите обновление в установщике Android. После установки откройте WePlay.':state.phase==='permission'?'Разрешите WePlay устанавливать обновления в настройках Android. Затем вернитесь в приложение.':state.downloaded?'Версия '+state.version+' загружена и проверена. Подтвердите установку в Android. История просмотра и избранное сохранятся.':'Доступна версия '+state.version+'. WePlay скачает APK и откроет установщик Android. История просмотра и избранное сохранятся.');
    apply.textContent=state.phase==='permission'?'Разрешить установку':state.downloaded?'Установить обновление':state.error?'Попробовать ещё':'Скачать и обновить';
    apply.disabled=downloading||installing||!state.available;later.textContent=downloading?'Отмена':'Позже';
    progress.hidden=!downloading;progress.setAttribute('aria-valuenow',String(percent));fill.style.transform='scaleX('+(percent/100)+')';
    if(apply.disabled&&document.activeElement===apply)WePlayFocus.focus(later,false);
    if(!modal.contains(document.activeElement))WePlayFocus.focus(apply.disabled?later:apply,false);
    if(autoInstall&&state.phase==='ready'&&idle()){autoInstall=false;send('install');}
    if(state.phase==='error')autoInstall=false;
  }
  function open(button,onClose){
    if(opened||!state.available||!idle()||window.WePlaySupport&&WePlaySupport.isOpen())return;
    trigger=button;callback=onClose;scroll=document.getElementById('content').scrollTop;
    saved=['content','sidebar'].map(function(id){var node=document.getElementById(id);return{node:node,value:node.getAttribute('aria-hidden')};});
    saved.forEach(function(entry){entry.node.setAttribute('aria-hidden','true');});
    opened=true;modal.hidden=false;document.getElementById('stage').classList.add('update-open');button.setAttribute('aria-expanded','true');paint();WePlayFocus.focus(apply.disabled?later:apply,false);
  }
  function check(){if(idle()&&state.phase!=='downloading'&&state.phase!=='installing')send('check');}
  function control(onOpen,onClose){
    var wrapper=document.createElement('span'),aura=document.createElement('span');wrapper.className='update-control';wrapper.hidden=!state.available;aura.className='update-aura';aura.setAttribute('aria-hidden','true');wrapper.appendChild(aura);
    var button=document.createElement('button');button.type='button';button.id='update-open';button.className='secondary focusable update-action';button.hidden=!state.available;
    button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','update-modal');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Доступно обновление WePlay '+(state.version||''));
    button.innerHTML='<span class="icon" aria-hidden="true">'+WEPLAY_ICONS['download-simple']+'</span><span class="button-label">Доступна новая версия</span>';
    button.addEventListener('click',function(){if(onOpen)onOpen();open(button,onClose);});wrapper.appendChild(button);return wrapper;
  }
  apply.addEventListener('click',function(){if(apply.disabled||!idle())return;autoInstall=!state.downloaded;send(state.downloaded?'install':'download');});
  later.addEventListener('click',function(){close(true);});
  document.addEventListener('focusin',function(event){if(opened&&!modal.contains(event.target)){event.stopImmediatePropagation();WePlayFocus.focus(preferred(),false);}},true);
  document.addEventListener('keydown',function(event){if(!opened)return;var key=event.keyCode||event.which;if([13,32,9,27,10009,37,38,39,40].indexOf(key)<0)return;event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;if(key===27||key===10009)close(true);else if(key===13||key===32)preferred().click();else if(!apply.disabled)WePlayFocus.focus(preferred()===apply?later:apply,false);},true);
  document.addEventListener('visibilitychange',function(){if(!document.hidden){send('status');check();}});
  window.addEventListener('online',check);
  window.WePlayAndroidUpdates={receive:function(value){state=value;paint();},snapshot:function(){return Object.assign({},state);},check:check};
  window.WePlayUpdatesUI={control:control,close:close,isOpen:function(){return opened;}};
  send('status');setTimeout(check,5000);setInterval(check,60000);
}());

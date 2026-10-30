/* A short OK opens the profile; holding OK opens local viewing-history actions. */
(function(){
  'use strict';
  var HOLD=650,press=null,opened=false,trigger=null,item=null,onRemove=null,saved=[],scroll=0,clickGuard=null,lastBackAt=0;
  var stage=document.getElementById('stage'),viewport=document.getElementById('content'),modal=document.createElement('div');
  modal.id='continue-menu';modal.hidden=true;
  modal.innerHTML='<section class="continue-dialog" role="dialog" aria-modal="true" aria-labelledby="continue-name" aria-describedby="continue-description"><h2 id="continue-name"></h2><p id="continue-description" class="continue-description">Сохранённый прогресс сбросится. Можно будет начать просмотр сначала.</p><p id="continue-error" class="continue-error" role="alert" hidden></p><div class="continue-actions"><button id="continue-remove" class="secondary focusable" type="button">Убрать из просмотра</button><button id="continue-cancel" class="secondary focusable" type="button">Отмена</button></div></section>';
  stage.appendChild(modal);
  var remove=modal.querySelector('#continue-remove'),cancel=modal.querySelector('#continue-cancel'),name=modal.querySelector('#continue-name'),error=modal.querySelector('#continue-error');
  var panel=modal.querySelector('.continue-dialog');
  function position(){
    if(!opened||!trigger||!trigger.isConnected)return;
    var bounds=stage.getBoundingClientRect(),card=trigger.querySelector('.poster-wrap').getBoundingClientRect(),scale=bounds.width/1920||1,width=panel.offsetWidth,height=panel.offsetHeight;
    var left=(card.left-bounds.left)/scale,top=(card.top-bounds.top)/scale,bottom=(card.bottom-bounds.top)/scale;
    var y=top-height-16;if(y<48)y=bottom+16;if(y+height>1032)y=Math.max(48,Math.min(top,1032-height));
    panel.style.left=Math.max(48,Math.min(1872-width,left))+'px';panel.style.top=y+'px';
  }
  function preferred(){return document.activeElement===cancel?cancel:remove;}
  function eligible(card){return card&&card.isConnected&&card.hasAttribute('data-continue-card')&&!card.disabled&&!document.hidden&&document.getElementById('player').hidden&&!WePlaySupport.isOpen()&&!(window.WePlayUpdatesUI&&WePlayUpdatesUI.isOpen());}
  function cleanPress(){if(!press)return;clearTimeout(press.timer);press.card.classList.remove('continue-holding');var meter=press.card.querySelector('.continue-hold');if(meter)meter.remove();}
  function cancelPress(){cleanPress();press=null;}
  function guardClick(card){clickGuard={card:card,until:Date.now()+700};}
  function open(card){
    if(opened||!eligible(card))return;
    trigger=card;item=card._continueItem;onRemove=card._continueRemove;scroll=viewport.scrollTop;
    name.textContent=card.querySelector('.movie-title').textContent;error.hidden=true;
    saved=['content','sidebar'].map(function(id){var node=document.getElementById(id);return{node:node,value:node.getAttribute('aria-hidden')};});
    opened=true;modal.hidden=false;trigger.classList.add('continue-selected');trigger.setAttribute('aria-expanded','true');position();WePlayFocus.focus(remove,false);
    saved.forEach(function(entry){entry.node.setAttribute('aria-hidden','true');});
  }
  function close(restore){
    if(!opened)return;opened=false;modal.hidden=true;
    saved.forEach(function(entry){if(entry.value===null)entry.node.removeAttribute('aria-hidden');else entry.node.setAttribute('aria-hidden',entry.value);});saved=[];
    var previous=trigger;trigger=null;item=null;onRemove=null;
    if(previous){previous.setAttribute('aria-expanded','false');previous.classList.remove('continue-selected');}
    if(restore!==false){WePlayFocus.focus(previous,false);viewport.scrollTop=scroll;}
  }
  function begin(card,source){
    if(press||!eligible(card))return;
    clickGuard=null;press={card:card,source:source,fired:false};var active=press;
    var meter=document.createElement('span');meter.className='continue-hold';meter.setAttribute('aria-hidden','true');meter.appendChild(document.createElement('span'));card.querySelector('.poster-wrap').appendChild(meter);
    // Commit the initial scale before starting the hold indicator, including on older TV engines.
    meter.offsetWidth;card.classList.add('continue-holding');
    active.timer=setTimeout(function(){if(press!==active||document.activeElement!==card||!eligible(card)){cancelPress();return;}active.fired=true;cleanPress();open(card);},HOLD);
  }
  function release(source){
    if(!press||press.source!==source)return false;
    var active=press;cleanPress();press=null;
    if(active.fired){guardClick(active.card);return true;}
    if(source==='key'&&document.activeElement===active.card&&eligible(active.card))active.card.click();
    return true;
  }
  remove.addEventListener('click',function(){
    var removed=item,previous=trigger,done=onRemove;
    if(!WePlayProgress.reset(removed)){error.textContent='Не удалось сбросить просмотр. Попробуйте ещё раз.';error.hidden=false;position();return;}
    close(false);if(done)done(removed,previous);
  });
  cancel.addEventListener('click',function(){close(true);});
  modal.addEventListener('click',function(event){if(event.target===modal)close(true);});
  window.addEventListener('resize',position);
  document.addEventListener('keydown',function(event){
    var key=event.keyCode||event.which;
    if((key===27||key===10009)&&Date.now()-lastBackAt<350){event.preventDefault();event.stopImmediatePropagation();return;}
    // The release of the original hold must never activate the newly focused Remove button.
    if(press&&press.source==='key'&&key===13){event.preventDefault();event.stopImmediatePropagation();return;}
    if(opened){
      if(key!==13&&key!==32&&key!==9&&key!==27&&key!==10009&&!(key>=37&&key<=40)&&key!==33&&key!==34)return;
      event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
      if(key===27||key===10009){lastBackAt=Date.now();close(true);}else if(key===13||key===32)preferred().click();else if(key===9||key===38||key===40)WePlayFocus.focus(preferred()===remove?cancel:remove,false);return;
    }
    if(key===13&&eligible(document.activeElement)){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)begin(document.activeElement,'key');return;}
    if(press)cancelPress();
  },true);
  document.addEventListener('keyup',function(event){if((event.keyCode||event.which)===13&&release('key')){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('mousedown',function(event){if(event.button!==0||opened)return;var card=event.target.closest&&event.target.closest('[data-continue-card]');if(eligible(card)){WePlayFocus.focus(card,false);begin(card,'mouse');}},true);
  document.addEventListener('mouseup',function(){release('mouse');},true);
  document.addEventListener('mousemove',function(event){if(press&&press.source==='mouse'&&!press.card.contains(event.target))cancelPress();},true);
  document.addEventListener('click',function(event){if(clickGuard&&Date.now()<=clickGuard.until&&clickGuard.card.contains(event.target)){clickGuard=null;event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('contextmenu',function(event){var card=event.target.closest&&event.target.closest('[data-continue-card]');if(eligible(card)){event.preventDefault();cancelPress();open(card);}},true);
  document.addEventListener('focusin',function(event){if(opened&&!modal.contains(event.target)){event.stopImmediatePropagation();WePlayFocus.focus(remove,false);}else if(press&&!press.fired&&event.target!==press.card)cancelPress();},true);
  document.addEventListener('tizenhwkey',function(event){if(event.keyName==='back'&&(opened||press||Date.now()-lastBackAt<350)){event.preventDefault();event.stopImmediatePropagation();lastBackAt=Date.now();cancelPress();close(true);}},true);
  window.addEventListener('blur',cancelPress);
  document.addEventListener('visibilitychange',function(){if(document.hidden){cancelPress();close(true);}});
  function bind(card,record,done){card.setAttribute('data-continue-card','');card.setAttribute('aria-haspopup','dialog');card.setAttribute('aria-controls','continue-menu');card.setAttribute('aria-expanded','false');card._continueItem=record;card._continueRemove=done;}
  window.WePlayContinue={bind:bind,close:close,cancelPress:cancelPress,isOpen:function(){return opened;}};
}());

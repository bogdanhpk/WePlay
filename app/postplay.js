/* End-of-playback card. Only a confirmed next episode can start automatically. */
(function(){
  'use strict';
  function el(tag,cls,label){var node=document.createElement(tag);if(cls)node.className=cls;if(label!==undefined)node.textContent=label;return node;}
  function create(options){
    var COUNTDOWN=5000,disposed=false,dismissed=!!options.dismissed,visible=false,ended=false,endFocused=false,moving=false,loading=false,attempted=false,next=options.next||null,remaining=COUNTDOWN,last=Date.now(),controller=new AbortController(),animation=null;
    var root=el('section','postplay');root.id='postplay';root.hidden=true;root.setAttribute('aria-label','Смотреть дальше');
    var watch=el('button','postplay-watch focusable'),fill=el('span','postplay-progress'),image=el('img','postplay-cover'),copy=el('span','postplay-copy'),title=el('strong','postplay-title'),caption=el('span','postplay-caption'),action=el('span','postplay-action','Смотреть');watch.id='postplay-watch';watch.type='button';image.alt='';fill.setAttribute('aria-hidden','true');copy.appendChild(title);copy.appendChild(caption);copy.appendChild(action);watch.appendChild(fill);watch.appendChild(image);watch.appendChild(copy);root.appendChild(watch);options.root.appendChild(root);
    function paint(){if(!next)return;title.textContent=next.title;caption.textContent=next.caption||'';caption.hidden=!caption.textContent;watch.setAttribute('aria-label','Смотреть: '+next.title+(next.caption?'. '+next.caption:''));if(next.item&&window.WePlayArtwork)WePlayArtwork.attach(image,next.item,'preview');}
    function focus(){if(visible)WePlayFocus.focus(watch,false);}
    function hide(){visible=false;root.hidden=true;if(animation)animation.pause();if(root.contains(document.activeElement))options.returnFocus();}
    function progress(automatic,allowed){
      fill.hidden=!automatic;
      if(!automatic){if(animation){animation.cancel();animation=null;}fill.style.transform='scaleX(0)';return;}
      var elapsed=COUNTDOWN-remaining;
      if(fill.animate&&!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)){
        if(!animation)animation=fill.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:COUNTDOWN,fill:'both',easing:'linear'});
        animation.currentTime=elapsed;if(allowed)animation.play();else animation.pause();
      }else fill.style.transform='scaleX('+elapsed/COUNTDOWN+')';
    }
    function dismiss(){dismissed=true;remaining=COUNTDOWN;hide();if(options.onDismiss)options.onDismiss();}
    function start(){if(disposed||moving||!next)return;var state=options.state();if(state.blocked)return;moving=true;hide();options.onWatch(next);}
    function load(){if(next||attempted||dismissed||!options.load)return;attempted=true;loading=true;Promise.resolve().then(function(){return options.load(controller.signal);}).then(function(value){if(disposed||controller.signal.aborted)return;loading=false;next=value;paint();update();}).catch(function(){loading=false;});}
    function update(){
      if(disposed)return;var state=options.state(),now=Date.now(),delta=Math.max(0,Math.min(1000,now-last));last=now;ended=!!state.ended;var credits=state.creditsStart>0&&state.time>=state.creditsStart;if(!ended&&!credits)remaining=COUNTDOWN;if(!ended)endFocused=false;
      var left=state.duration-state.time,threshold=next&&next.kind==='episode'?30000:60000,near=state.started&&state.duration>=90000&&left<=Math.min(threshold,state.duration*.1)&&left>=0;
      if(!dismissed&&!state.blocked&&(ended||state.started&&state.duration>=90000&&left<=120000))load();
      var shouldShow=!!next&&!dismissed&&!moving&&!state.failed&&!state.blocked&&(ended||credits||near);
      if(!shouldShow){hide();return;}
      var entering=!visible;visible=true;root.hidden=false;root.classList.toggle('postplay-raised',!!options.controlsVisible());
      if(ended&&!endFocused){endFocused=true;focus();}
      if(entering){root.classList.remove('postplay-ready');requestAnimationFrame(function(){if(!disposed&&visible)root.classList.add('postplay-ready');});}
      var automatic=(ended||credits)&&next.kind==='episode',allowed=state.autoplay!==false&&(ended||state.playing);
      if(automatic&&allowed)remaining=Math.max(0,remaining-delta);
      action.textContent=automatic?(!allowed?'Автопереход приостановлен':'Смотреть через '+Math.ceil(remaining/1000)+' с'):'Смотреть';progress(automatic,allowed);
      if(automatic&&remaining<=0&&allowed)start();
    }
    watch.onclick=start;
    var timer=setInterval(update,250);paint();
    return{
      update:update,
      ended:function(){ended=true;last=Date.now();update();if(visible)focus();},
      key:function(key,shift,repeat){
        if(!visible)return false;var owned=root.contains(document.activeElement);
        if(key===27||key===10009){if(!repeat)dismiss();return true;}
        if(!owned){if(key===40&&!options.controlsVisible()){focus();return true;}return false;}
        if(key===13){if(!repeat)document.activeElement.click();return true;}
        if(key===9||key===37||key===39||key===40){focus();return true;}
        if(key===38){options.focusControls();return true;}
        return false;
      },
      snapshot:function(){return{visible:visible,ended:ended,dismissed:dismissed,kind:next&&next.kind,title:next&&next.title,remaining:Math.ceil(remaining/1000),loading:loading,moving:moving};},
      destroy:function(){if(disposed)return;disposed=true;clearInterval(timer);controller.abort();if(animation)animation.cancel();if(window.WePlayArtwork)WePlayArtwork.release(root);root.remove();}
    };
  }
  window.WePlayPostplay={create:create};
}());

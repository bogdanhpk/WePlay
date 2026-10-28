(function () {
  'use strict';
  var modal=document.getElementById('support-modal'),closeButton=document.getElementById('support-close');
  var opened=false,trigger=null,onClose=null,background=[],scrollTop=0;
  function syncMotion(){document.getElementById('stage').classList.toggle('support-motion-paused',opened||document.hidden||!document.getElementById('player').hidden);}
  function focusClose(){WePlayFocus.focus(closeButton,false);}
  function open(button,callback){
    if(opened)return;
    trigger=button;onClose=callback;scrollTop=document.getElementById('content').scrollTop;
    background=['content','sidebar'].map(function(id){var node=document.getElementById(id);return{node:node,value:node.getAttribute('aria-hidden')};});
    opened=true;modal.hidden=false;syncMotion();
    if(trigger)trigger.setAttribute('aria-expanded','true');
    focusClose();
    background.forEach(function(saved){saved.node.setAttribute('aria-hidden','true');});
  }
  function close(restore){
    if(!opened)return;
    opened=false;modal.hidden=true;syncMotion();
    background.forEach(function(saved){if(saved.value===null)saved.node.removeAttribute('aria-hidden');else saved.node.setAttribute('aria-hidden',saved.value);});
    background=[];
    var previous=trigger,callback=onClose;trigger=null;onClose=null;
    if(previous)previous.setAttribute('aria-expanded','false');
    if(restore!==false){
      if(callback)callback();
      WePlayFocus.focus(previous,false);
      document.getElementById('content').scrollTop=scrollTop;
    }
  }
  function key(event,code){
    if(!opened)return false;
    if(code===10009||code===27||code===13||code===32){
      event.preventDefault();event.stopPropagation();
      if(!event.repeat)close(true);
    }else if(code===9||code>=37&&code<=40||code===33||code===34||code===427||code===428){
      event.preventDefault();event.stopPropagation();focusClose();
    }
    // Other system keys (volume, power) retain their platform behavior.
    return true;
  }
  closeButton.addEventListener('click',function(){close(true);});
  closeButton.querySelector('.icon').innerHTML=WEPLAY_ICONS.x;
  document.addEventListener('visibilitychange',syncMotion);
  new MutationObserver(syncMotion).observe(document.getElementById('player'),{attributes:true,attributeFilter:['hidden']});
  syncMotion();
  document.addEventListener('focusin',function(event){
    if(opened&&!modal.contains(event.target)){event.stopImmediatePropagation();focusClose();}
  },true);
  window.WePlaySupport={open:open,close:close,key:key,isOpen:function(){return opened;}};
}());

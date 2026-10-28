/* Shared activity indicator, compatible with the TV's Chromium 69 renderer. */
(function(){
  'use strict';
  function indicator(){
    var spinner=document.createElement('span');spinner.className='activity-indicator';spinner.setAttribute('aria-hidden','true');
    for(var i=0;i<12;i++){var segment=document.createElement('span');segment.style.transform='rotate('+(i*30)+'deg)';segment.style.animationDelay=((i-12)/12)+'s';spinner.appendChild(segment);}
    return spinner;
  }
  function create(label){var status=document.createElement('div');status.className='loading-status';status.setAttribute('role','status');status.setAttribute('aria-label',label||'Загрузка');status.appendChild(indicator());return status;}
  window.WePlayLoading={create:create,indicator:indicator};
}());

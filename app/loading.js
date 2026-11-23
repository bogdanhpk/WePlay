/* Shared WePlay loading mark. Motion stays in CSS and never delays real work. */
(function(){
  'use strict';
  function indicator(){
    var mark=document.createElement('span');mark.className='activity-indicator';mark.setAttribute('aria-hidden','true');
    var fill=document.createElement('span');fill.className='activity-fill';mark.appendChild(fill);return mark;
  }
  function create(label){var status=document.createElement('div');status.className='loading-status';status.setAttribute('role','status');status.setAttribute('aria-label',label||'Загрузка');status.appendChild(indicator());return status;}
  window.WePlayLoading={create:create,indicator:indicator};
}());

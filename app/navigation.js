(function () {
  'use strict';
  function items(grid) {
    return Array.prototype.filter.call(grid.children,function(e){return e.classList.contains('focusable')&&!e.disabled&&e.offsetWidth&&e.offsetHeight;});
  }
  function railInfo(rail){
    var list=items(rail),rect=rail.getBoundingClientRect(),scale=rect.width/rail.offsetWidth||1,style=getComputedStyle(rail);
    var gap=parseFloat(style.gridColumnGap)||24,inside=rail.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0);
    var step=list.length>1?(list[1].getBoundingClientRect().left-list[0].getBoundingClientRect().left)/scale:list.length?list[0].getBoundingClientRect().width/scale+gap:inside+gap;
    var count=Math.max(1,Math.floor((inside+gap+.5)/step)),last=Math.max(0,list.length-count);
    return {list:list,step:step,count:count,last:last,first:Math.max(0,Math.min(last,Math.round(rail.scrollLeft/step)))};
  }
  function scrollRail(rail,first,info){
    info=info||railInfo(rail);first=Math.max(0,Math.min(info.last,first));rail.scrollLeft=first*info.step;return first;
  }
  function pageRail(rail,direction){
    var info=railInfo(rail);if(!info.list.length)return false;
    rail._focusIndex=scrollRail(rail,info.first+direction*info.count,info);return true;
  }
  function reveal(e) {
    if(!e)return;
    var rail=e.closest('.home-rail'),viewport=e.closest('.native-menu-scroll')||e.closest('.native-menu')||e.closest('.search-results-scroll')||document.getElementById('content');
    if(rail){
      var info=railInfo(rail),index=info.list.indexOf(e),first=info.first;
      if(index>=0){if(index<first)first=index;else if(index>=first+info.count)first=index-info.count+1;scrollRail(rail,first,info);}
    }
    if(!viewport||!viewport.contains(e))return;
    var r=e.getBoundingClientRect(),v=viewport.getBoundingClientRect(),scale=v.width/viewport.offsetWidth||1,padY=32*scale;
    if(r.top<v.top+padY)viewport.scrollTop+=(r.top-v.top-padY)/scale;
    else if(r.bottom>v.bottom-padY)viewport.scrollTop+=(r.bottom-v.bottom+padY)/scale;
  }
  function remember(e){
    var grid=e&&e.closest('[data-focus-grid]');
    if(grid){var list=items(grid),at=list.indexOf(e);if(at>=0){grid._focusIndex=at;grid._focusColumn=at%(Number(grid.getAttribute('data-focus-grid'))||list.length);}}
  }
  function focus(e,scroll){
    if(!e||e.disabled||!e.isConnected)return;
    try{e.focus({preventScroll:true});}catch(ignore){e.focus();}
    remember(e);if(scroll!==false)reveal(e);
  }
  function move(key){
    var active=document.activeElement,grid=active&&active.closest('[data-focus-grid]');
    if(!grid)return null;
    var list=items(grid),at=list.indexOf(active),columns=Number(grid.getAttribute('data-focus-grid'))||list.length;
    if(at<0)return null;
    var col=at%columns,desired=grid._focusColumn===undefined?col:grid._focusColumn,to=at;
    if(key===37){if(col===0)return 'left';to--;}
    else if(key===39){if(col===columns-1||at===list.length-1)return 'right';to++;}
    else if(key===38){if(at<columns)return 'up';to=(Math.floor(at/columns)-1)*columns+desired;}
    else if(key===40){if(Math.floor(at/columns)===Math.floor((list.length-1)/columns))return 'down';to=Math.min(list.length-1,(Math.floor(at/columns)+1)*columns+desired);}
    else return null;
    focus(list[to]);if(key===38||key===40)grid._focusColumn=desired;return 'moved';
  }
  function page(direction){
    var active=document.activeElement,grid=active&&active.closest('[data-focus-grid]');
    if(!grid)return false;
    var list=items(grid),at=list.indexOf(active),columns=Number(grid.getAttribute('data-focus-grid'))||list.length;
    if(at<0||!list.length)return false;
    var rail=grid.classList.contains('home-rail'),viewport=grid.closest('.native-menu-scroll')||grid.closest('.native-menu')||grid.closest('.search-results-scroll')||document.getElementById('content');
    var steps=rail?railInfo(grid).count:columns*Math.max(1,Math.floor((viewport.clientHeight-64)/(active.offsetHeight+32)));
    var desired=grid._focusColumn===undefined?at%columns:grid._focusColumn;
    var row=Math.max(0,Math.min(Math.floor((list.length-1)/columns),Math.floor(at/columns)+steps/columns*direction));
    var to=rail?Math.max(0,Math.min(list.length-1,at+steps*direction)):Math.min(list.length-1,row*columns+desired);
    if(to===at&&direction>0&&!rail){var more=document.getElementById('load-more');if(more){focus(more);return true;}}
    focus(list[to]);if(!rail)grid._focusColumn=desired;return true;
  }
  window.WePlayFocus={focus:focus,reveal:reveal,remember:remember,items:items,move:move,page:page,pageRail:pageRail};
}());

(function () {
  'use strict';
  function localAsset(path){return window.WePlayRuntime?WePlayRuntime.asset(path):path;}
  var API = 'https://lord.kim/api.php', BASE = 'https://lord.kim/';
  var viewport = document.getElementById('content'),content=null,stage=document.getElementById('stage');
  var nav = document.getElementById('navigation'), overlay = document.getElementById('player');
  var surface = document.getElementById('player-surface'), status = document.getElementById('player-status');
  var toolbar = document.getElementById('player-toolbar'), hint = document.getElementById('player-hint');
  var exitDialog=document.getElementById('exit-confirm'),exitContinue=document.getElementById('exit-continue'),exitLeave=document.getElementById('exit-leave');
  var exitFocus=null,exitResume=false,lastBackAt=0,playingItem=null,playingChoice=null,playingSeason=null,playerFetchAbort=null,playingRestart=false,detailProgressUpdate=null;
  var routes = [], current = {kind:'home'}, generation = 0, cache = {}, categories = [];
  var activeSource = 0, playerGeneration = 0, hideTimer;
  var toastTimer, savedFocus, log = [];
  var pageLoading=null,featuredDispose=null;
  var searchEditor=null;
  var playerLoading=WePlayLoading.create('Загружаем видео');playerLoading.id='player-loading';overlay.appendChild(playerLoading);
  var selectEditing = false;
  var sidebar=document.getElementById('sidebar'),lastContentFocus=null;
  var navIcons=['house','fire','film-slate','television','smiley','television-smiley','squares-four','magnifying-glass','bookmark-simple','sparkle'];
  var entries = [
    ['Поиск','search',null,7], ['Главная','home',null,0], ['Новинки','releases','new-films',9], ['Популярное','catalog',219,1], ['Фильмы','catalog',106,2],
    ['Сериалы','catalog',13,3], ['Мультфильмы','catalog',109,4], ['Мультсериалы','catalog',36,5],
    ['Подборки','collections',null,6], ['Избранное','favorites',null,8]
  ];
  function diagnostic(type, detail) {
    log.push({type:type, detail:String(detail || '').slice(0,240), time:Date.now()});
    if(log.length>50)log.shift();
  }
  window.WePlay = {snapshot:function(){return {route:current.kind,category:current.category,releaseYear:current.kind==='releases'?WePlayCatalog.releaseYear():undefined,player:activeSource,exitConfirmation:!exitDialog.hidden,native:window.WePlayNativePlayer&&WePlayNativePlayer.snapshot(),log:log.slice(),cards:content.querySelectorAll('.movie-card').length};}};
  window.WePlay.open=function(id){if(/^\d+$/.test(String(id)))id=Number(id);if(typeof id==='number'&&id>0&&id===Math.floor(id)||(WePlayCatalog.validId?WePlayCatalog.validId(id):/^(sb|pub)-\d+$/.test(String(id)))){if(!overlay.hidden)closePlayer();push({kind:'detail',id:id});}};
  addEventListener('error',function(e){diagnostic('error',e.message);});
  function fit() {
    var width=innerWidth,height=innerHeight;
    var scale=Math.min(width/1920,height/1080);
    stage.style.transform='scale('+scale+')';
    stage.style.left=((width-1920*scale)/2)+'px'; stage.style.top=((height-1080*scale)/2)+'px';
    viewport.querySelectorAll('.home-rail').forEach(function(rail){if(rail._updateControls)rail._updateControls();});
  }
  addEventListener('resize',fit); fit();
  function element(tag, cls, text) {
    var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;
  }
  function button(text, cls, action, id) {
    var e=element('button','focusable '+(cls||''),text);e.type='button';if(id)e.id=id;
    if(action)e.addEventListener('click',action);return e;
  }
  function icon(name,filled) {
    var e=element('span','icon'),outline=/^(?:x$|plus|check|arrow-|caret-)/.test(name),solid=filled&&!outline&&((window.WEPLAY_NAV_ICONS||{})[name]||(window.WEPLAY_DETAIL_ICONS||{})[name]);e.setAttribute('aria-hidden','true');e.innerHTML=solid||window.WEPLAY_ICONS[name]||'';var svg=e.querySelector('svg');if(svg)svg.setAttribute('data-weight',solid?'fill':'regular');return e;
  }
  function iconButton(label,name,cls,action,id,filled) {
    var b=button('',cls,action,id);b._weplayFilled=!!filled;b.appendChild(icon(name,filled));b.appendChild(element('span','button-label',label));return b;
  }
  function detailIconButton(label,name,cls,action,id){return iconButton(label,name,cls,action,id,true);}
  function text(raw) {
    var doc=new DOMParser().parseFromString(String(raw || ''),'text/html');
    return (doc.body.textContent||'').replace(/\s+/g,' ').trim();
  }
  function xf(item,key) {
    var fields=item.xfields||{};
    if(typeof fields==='string') {try{fields=JSON.parse(fields);}catch(ignore){fields={};}}
    return String(fields[key]||fields['xfvalue_'+key]||'');
  }
  function absolute(raw, poster) {
    raw=text(raw); var match=raw.match(/src\s*=\s*["']([^"']+)["']/i);
    if(match)raw=match[1];if(!raw||raw==='null')return '';
    if(poster&&!/^(https?:)?\//.test(raw))raw='/uploads/posts/'+raw;
    try {var u=new URL(raw,BASE);return /^https?:$/.test(u.protocol)?u.href:'';}catch(ignore){return '';}
  }
  function listOf(j) {
    var d=j.data===undefined?j:j.data;
    return Array.isArray(d)?d:(d.items||d.news||d.list||[]);
  }
  function api(params, retry) {
    return WePlayCatalog.api(params);
  }
  function news(category,page,search,limit) {
    return api({action:'news',do:'list',category:category,page:page||1,limit:limit||60,approve:1,search:search||undefined});
  }
  function focus(e,scroll) {if(WePlaySupport.isOpen()){WePlayFocus.focus(document.getElementById('support-close'),false);return;}WePlayFocus.focus(e,scroll);}
  function firstFocus() {focus(current.kind==='search'&&searchEditor&&searchEditor.initial()||current.kind==='home'&&document.getElementById('featured-open')||current.kind==='detail'&&document.querySelector('#watch:not(:disabled)')||current.kind==='releases'&&content.querySelector('.release-tabs [aria-selected="true"]')||content.querySelector('.error .focusable')||content.querySelector('.focusable:not(.support-action):not(.update-action)')||content.querySelector('.focusable')||nav.querySelector('.current'));}
  function toast(message) {
    var t=document.getElementById('toast');t.textContent=message;t.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.hidden=true;},2600);
  }
  function favorites() {try{var items=JSON.parse(localStorage.getItem('lord.favorites')||'[]');return Array.isArray(items)?WePlayCatalog.dedupe(items):[];}catch(ignore){return [];}}
  function isFavorite(id) {var item=WePlayCatalog.find(id);return favorites().some(function(i){return String(i.id)===String(id)||item&&WePlayCatalog.same(i,item);});}
  function toggleFavorite(item,b) {
    var items=favorites(),exists=isFavorite(item.id);
    items=items.filter(function(i){return !WePlayCatalog.same(i,item);});
    if(!exists)items.unshift(item);
    try{localStorage.setItem('lord.favorites',JSON.stringify(items.slice(0,120)));b.innerHTML='';b.appendChild(icon(exists?'plus':'check',b._weplayFilled));b.appendChild(element('span','button-label',exists?'В избранное':'В избранном'));b.setAttribute('aria-pressed',String(!exists));b.setAttribute('aria-label',exists?'В избранное':'Убрать из избранного');toast(exists?'Убрано из избранного':'Добавлено в избранное');}
    catch(ignore){toast('Не удалось сохранить избранное');}
  }
  function updateNav() {
    nav.innerHTML='';entries.forEach(function(entry,index){
      var selected=current.kind===entry[1]&&(entry[1]!=='catalog'||current.category===entry[2]);
      var b=iconButton(entry[0],navIcons[entry[3]],selected?'current':'',function(){routes=[];setSidebar(false);navigate({kind:entry[1],category:entry[2],title:entry[0]});},'nav-'+entry[3],true);
      b.setAttribute('aria-label',entry[0]);
      if(selected)b.setAttribute('aria-current','page');nav.appendChild(b);
    });
  }
  function header(title,caption) {
    var h=element('header','page-header'),copy=element('div','page-heading');copy.appendChild(element('h1','',title));
    if(caption&&caption!=='WePlay')copy.appendChild(element('p','page-subtitle',caption));h.appendChild(copy);
    var tools=element('div','header-tools');
    appendUpdateControl(tools);tools.appendChild(supportControl());h.appendChild(tools);content.appendChild(h);return h;
  }
  function appendUpdateControl(host){if(window.WePlayUpdatesUI)host.appendChild(WePlayUpdatesUI.control(function(){setSidebar(false);lastBackAt=0;},function(){lastBackAt=Date.now();}));}
  function supportControl(){
    var wrapper=element('span','support-control');
    var b=detailIconButton('Поддержать','currency-rub','primary support-action',function(){
      if(!overlay.hidden)return;
      var active=document.activeElement;if(active&&active.tagName==='INPUT')active.blur();setSidebar(false);
      lastBackAt=0;WePlaySupport.open(b,function(){lastBackAt=Date.now();});
    },'support-open');
    b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-controls','support-modal');b.setAttribute('aria-expanded','false');wrapper.appendChild(b);return wrapper;
  }
  function pageLoader(label) {
    if(pageLoading)pageLoading.remove();
    var view=content,host=WePlayLoading.create(label),stopped=false,timer;host.classList.add('page-loading');view.setAttribute('aria-busy','true');
    var handle={remove:function(){if(stopped)return;stopped=true;clearTimeout(timer);host.remove();if(pageLoading===handle){pageLoading=null;view.removeAttribute('aria-busy');}}};
    pageLoading=handle;timer=setTimeout(function(){if(!stopped&&view===content)stage.appendChild(host);},150);return handle;
  }
  function errorBox(message,retry) {
    var box=element('div','error');box.appendChild(element('h2','','Не удалось загрузить'));
    box.appendChild(element('p','',message));box.appendChild(button('Попробовать ещё','primary',retry));content.appendChild(box);firstFocus();
    diagnostic('networkError',message);
  }
  function emptyBox(message) {
    var box=element('div','empty');box.appendChild(icon('film-slate'));box.appendChild(element('h2','','Здесь пока ничего нет'));
    box.appendChild(element('p','',message));return box;
  }
  function score(item,key){
    var raw=text(xf(item,key)).replace(/,/g,'.'),m=raw.match(/(?:^|\s)(\d{1,2}(?:\.\d+)?)(?=\s|$)/),value=m?Number(m[1]):NaN;
    return isFinite(value)&&value>0&&value<=10?value:null;
  }
  function scores(item){return [{key:'kp_rating',name:'Кинопоиск',short:'КП',brand:'kp'},{key:'imdb_rating',name:'IMDb',short:'IMDb',brand:'imdb'}].map(function(s){s.value=score(item,s.key);return s;}).filter(function(s){return s.value!==null;});}
  function genres(item){
    var list=text(xf(item,'janre')).split(/[,/|]+/).map(function(v){return v.trim();}).filter(Boolean),known=/^(боевик|биограф|вестерн|военн|детектив|документ|драм|истори|комеди|короткометр|криминал|мелодрам|мультфильм|мюзикл|музык|приключен|семейн|спорт|триллер|ужас|фантаст|фэнтези|аниме|реалити|ток.шоу)/i;
    var clean=list.filter(function(v){return known.test(v);});return clean.length?clean:list.filter(function(v){return !/^(фильмы|сериалы|мультфильмы|мультсериалы|премьеры|(?:19|20)\d{2})$/i.test(v);});
  }
  function ratings(item,kind){
    var group=element('div','ratings ratings-'+kind);group.setAttribute('aria-label','Рейтинги зрителей');
    scores(item).forEach(function(s){var chip=element('span','rating-chip rating-'+s.brand+(s.value>=7?' score-good':s.value<5?' score-low':' score-neutral'));chip.setAttribute('aria-label',s.name+': '+s.value.toFixed(1)+' из 10');chip.appendChild(element('span','rating-brand',kind==='card'?s.short:s.name));chip.appendChild(element('strong','rating-value',s.value.toFixed(1)));group.appendChild(chip);});
    group.hidden=!group.children.length;return group;
  }
  function isSeries(item){return WePlayCatalogUnion.kind(item)==='series';}
  function metadata(item){
    var row=element('div','metadata');[xf(item,'year'),genres(item).slice(0,2).join(' · '),xf(item,'strana')].filter(Boolean).forEach(function(value){row.appendChild(element('span','meta-part',text(value)));});
    ['quality','age'].forEach(function(key){var value=text(xf(item,key));if(value)row.appendChild(element('span','media-tag',value));});return row;
  }
  function card(item,suffix,portrait) {
    WePlayCatalog.remember(item);
    cache['item-'+item.id]=item;
    var b=button('','movie-card',function(){push({kind:'detail',id:item.id});},'movie-'+item.id+(suffix?'-'+suffix:''));
    b._weplayItem=item;
    b.setAttribute('aria-label',text(item.title));b.setAttribute('data-content-id',item.id);var wrap=element('div','poster-wrap'),img=element('img');
    img.alt=text(item.title);wrap.appendChild(img);WePlayArtwork.observe(img,item,portrait?'poster':'preview');
    wrap.appendChild(ratings(item,'card'));b.appendChild(wrap);
    b.appendChild(element('div','movie-title',text(item.title)));
    var progress=WePlayProgress.get(item),continuing=suffix==='home-continue'&&WePlayProgress.canResume(progress);
    if(progress&&progress.duration>0&&!progress.completed){var track=element('div','watch-progress'),fill=element('span');fill.style.transform='scaleX('+WePlayProgress.ratio(progress)+')';track.appendChild(fill);track.setAttribute('aria-hidden','true');wrap.appendChild(track);}
    b.appendChild(element('div','movie-meta',continuing?WePlayProgress.label(progress):[xf(item,'year'),genres(item)[0]||xf(item,'quality')].filter(Boolean).join(' · ')));
    if(continuing){b.setAttribute('aria-label',text(item.title)+'. Продолжить: '+WePlayProgress.label(progress));WePlayContinue.bind(b,item,removeContinueCard);}
    return b;
  }
  function removeContinueCard(item,trigger){
    var rail=trigger.closest('.home-rail');if(!rail)return;
    var section=rail.closest('.home-section'),list=WePlayFocus.items(rail),at=list.indexOf(trigger);
    list.forEach(function(card){if(!WePlayProgress.canResume(WePlayProgress.get(card._weplayItem))){WePlayArtwork.release(card);card.remove();}});
    content.querySelectorAll('.movie-card').forEach(function(card){if(card._weplayItem&&!WePlayProgress.canResume(WePlayProgress.get(card._weplayItem))){var bar=card.querySelector('.watch-progress');if(bar)bar.remove();}});
    list=WePlayFocus.items(rail);
    if(list.length){rail._focusIndex=Math.max(0,Math.min(at,list.length-1));focus(list[rail._focusIndex]);if(rail._updateControls)rail._updateControls();}
    else{var next=section.nextElementSibling;section.remove();if(!railFocus(next))focus(document.getElementById('featured-open')||document.getElementById('home-menu'));}
    toast('Убрано из просмотра. Прогресс сброшен');
  }
  function gridOf(items,suffix,portrait,reuse) {var g=element('div','grid'+(portrait?' poster-grid':''));g.setAttribute('data-focus-grid',portrait?'6':'4');items.forEach(function(i){var existing=reuse&&reuse[WePlayCatalogUnion.canonical(i.id)];if(existing){existing.id='movie-'+i.id+(suffix?'-'+suffix:'');existing.setAttribute('data-content-id',i.id);g.appendChild(existing);}else g.appendChild(card(i,suffix,portrait));});return g;}
  function imageNodes(root){var map={};root.querySelectorAll('.movie-card').forEach(function(card){map[WePlayCatalogUnion.canonical(card.getAttribute('data-content-id'))]=card;});return map;}
  function restoreRailState(rail,route,index){
    var states=route.rails||[],saved=states.filter(function(state){return state.id===rail.id;})[0]||(states[index]&&!states[index].id?states[index]:null);if(!saved)return;
    var list=WePlayFocus.items(rail),at=Math.max(0,Math.min(list.length-1,Number(saved.index)||0));
    if(saved.contentId){var canonical=WePlayCatalogUnion.canonical(saved.contentId);list.some(function(card,i){if(WePlayCatalogUnion.canonical(card.getAttribute('data-content-id'))===canonical){at=i;return true;}return false;});}
    rail.scrollLeft=saved.left||0;rail._focusIndex=at;rail.dispatchEvent(new Event('scroll'));
  }
  function contentTop(node){var top=0;while(node&&node!==viewport){top+=node.offsetTop||0;node=node.offsetParent;}return top;}
  function restorePosition(route){
    var restored;
    function scroll(){content.querySelectorAll('.home-rail').forEach(function(rail,index){restoreRailState(rail,route,index);});viewport.scrollTop=route.kind==='home'&&restored&&typeof route.focusY==='number'?contentTop(restored)-route.focusY:route.scroll||0;if(route.kind==='search'){var searchScroll=document.getElementById('search-results');if(searchScroll)searchScroll.scrollTop=route.searchScroll||0;}}
    restored=document.getElementById(route.focus);
    if(!restored&&route.contentId){var canonical=WePlayCatalogUnion.canonical(route.contentId),matches=Array.prototype.filter.call(content.querySelectorAll('.movie-card'),function(b){return WePlayCatalogUnion.canonical(b.getAttribute('data-content-id'))===canonical;});restored=matches.filter(function(b){var rail=b.closest('.home-rail');return rail&&rail.id===route.focusRail;})[0]||matches[0];}
    if(!restored&&route.kind==='home'&&route.focusRail){var fallback=document.getElementById(route.focusRail)||content.querySelector('.home-rail'),list=fallback&&WePlayFocus.items(fallback),saved=(route.rails||[]).filter(function(r){return r.id===route.focusRail;})[0];if(list&&list.length)restored=list[Math.min(list.length-1,saved&&saved.index||0)];}
    scroll();focus(restored||content.querySelector('.focusable'),false);scroll();lastBackAt=Date.now();
    // Some TV engines scroll a focused element despite preventScroll.
    var view=content,focused=document.activeElement;requestAnimationFrame(function(){if(content===view&&document.activeElement===focused){scroll();lastBackAt=Date.now();}});
  }
  function navigate(route,restore) {
    WePlayContinue.cancelPress();WePlayContinue.close(false);
    WePlaySupport.close(false);if(window.WePlayUpdatesUI)WePlayUpdatesUI.close(false);detailProgressUpdate=null;
    if(searchEditor){searchEditor.dispose();searchEditor=null;}
    if(featuredDispose){featuredDispose();featuredDispose=null;}
    if(pageLoading)pageLoading.remove();
    var previous=content,oldScroll=viewport.scrollTop,wasWide=current.kind==='home'||current.kind==='detail';
    current=route;var g=++generation;viewport.className='route-'+route.kind;stage.classList.toggle('home-screen',route.kind==='home');stage.classList.toggle('detail-screen',route.kind==='detail');
    content=element('div','page-view view-'+route.kind);viewport.appendChild(content);
    if(previous){
      WePlayArtwork.release(previous);previous.setAttribute('aria-hidden','true');previous.querySelectorAll('[id]').forEach(function(e){e.removeAttribute('id');});
      previous.querySelectorAll('.focusable').forEach(function(e){e.classList.remove('focusable');e.disabled=true;});
      previous.classList.add('route-leaving');previous.style.left=(wasWide?0:176)+'px';previous.style.top=((wasWide?0:64)-oldScroll)+'px';previous.style.width=(wasWide?1920:1680)+'px';stage.appendChild(previous);
      content.classList.add('route-entering');var entering=content;
      requestAnimationFrame(function(){requestAnimationFrame(function(){previous.classList.add('route-out');entering.classList.remove('route-entering');});});
      setTimeout(function(){previous.remove();},220);
    }
    viewport.scrollTop=0;updateNav();
    var promise;
    if(route.kind==='home')promise=home(g,restore);
    else if(route.kind==='catalog'||route.kind==='releases')promise=catalog(g);
    else if(route.kind==='search')promise=searchPage(g);
    else if(route.kind==='collections')promise=collections(g);
    else if(route.kind==='detail')promise=detail(g);
    else if(route.kind==='favorites')promise=favoritesPage();
    Promise.resolve(promise).then(function(){
      if(g!==generation)return;
      if(route.play&&route.kind==='detail'){route.play=false;var watch=document.getElementById('watch');if(watch&&!watch.disabled){focus(watch);watch.click();return;}}
      if(restore)restorePosition(route);
      else firstFocus();
    });
  }
  function push(route) {
    if(current.kind==='search'&&searchEditor){if(route.kind==='detail')searchEditor.commit();var resultScroll=document.getElementById('search-results');current.searchScroll=resultScroll?resultScroll.scrollTop:0;}
    current.scroll=viewport.scrollTop;current.focus=document.activeElement.id;current.contentId=document.activeElement.getAttribute('data-content-id');var focusedRail=document.activeElement.closest('.home-rail');current.focusRail=focusedRail&&focusedRail.id;
    current.rails=Array.prototype.map.call(content.querySelectorAll('.home-rail'),function(rail){var index=rail._focusIndex||0,selected=WePlayFocus.items(rail)[index];return {id:rail.id,left:rail.scrollLeft,index:index,contentId:selected&&selected.getAttribute('data-content-id')};});
    if(current.kind==='home'){current.focusY=content.contains(document.activeElement)?contentTop(document.activeElement)-viewport.scrollTop:null;var promo=content.querySelector('.featured');current.homePromo=promo&&promo.navigationState();}
    routes.push(current);navigate(route);
  }
  function back() {
    if(WePlaySupport.isOpen()){WePlaySupport.close(true);return;}
    if(!exitDialog.hidden){cancelExit();return;}
    if(!overlay.hidden){if(window.WePlayNativePlayer&&WePlayNativePlayer.active&&WePlayNativePlayer.key(10009))return;requestExit();return;}
    if(sidebar.contains(document.activeElement)&&sidebar.classList.contains('expanded')){leaveSidebar();return;}
    if(searchEditor&&searchEditor.back&&searchEditor.back())return;
    if(routes.length){navigate(routes.pop(),true);return;}
    if(current.kind!=='home'){navigate({kind:'home'});return;}
    try{tizen.application.getCurrentApplication().exit();}catch(ignore){toast('Вы уже на главной');}
  }
  function home(g,restore) {
    var route=current,promoState=restore&&route.homePromo;
    var promoKey='home-promo-'+WePlayCatalog.releaseYear();
    var top=element('header','home-topbar');var menu=button('','home-menu',openSidebar,'home-menu'),brandLogo=element('img','brand-logo');brandLogo.src=localAsset('assets/weplay-mark.png');brandLogo.alt='';brandLogo.width=32;brandLogo.height=32;brandLogo.setAttribute('aria-hidden','true');brandLogo.draggable=false;menu.appendChild(brandLogo);menu.appendChild(element('span','button-label','WePlay'));menu.setAttribute('aria-label','Открыть меню WePlay');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-controls','sidebar');top.appendChild(menu);var headerActions=element('div','home-header-actions');appendUpdateControl(headerActions);headerActions.appendChild(supportControl());top.appendChild(headerActions);content.appendChild(top);var loading=pageLoader('Загружаем главную');
    var specs=[['Популярное',219],['Фильмы',106],['Сериалы',13]];
    return Promise.all(specs.map(function(spec){
      var key='home-'+spec[1];return cache[key]?Promise.resolve(cache[key]):news(spec[1],1,null,18).then(function(j){cache[key]=listOf(j);return cache[key];});
    })).then(function(rows){if(g!==generation)return rows;var seed=promoState&&promoState.items||cache[promoKey]||WePlayPromo.select({popular:rows[0],films:rows[1],series:rows[2]},WePlayCatalog.releaseYear(),12),artSeed=promoState?seed.slice(promoState.index).concat(seed.slice(0,promoState.index)):seed;return Promise.all([WePlayArtwork.prepare(artSeed,true,true,2),WePlayArtwork.prepare(rows[0],true,false,5)]).then(function(){return rows;});}).then(function(rows){
      if(g!==generation)return;loading.remove();
      var pool={popular:rows[0],films:rows[1],series:rows[2],cartoons:[]},promo=featured(promoState&&promoState.items||cache[promoKey]||WePlayPromo.select(pool,WePlayCatalog.releaseYear(),12),promoState?promoState.ready:!!cache[promoKey],promoState);content.appendChild(promo);
      function commitPromo(selected){var frozen=promo.updateItems(selected,true);if(frozen&&frozen.length)cache[promoKey]=frozen;}
      var continuing=WePlayProgress.list().map(function(record){return WePlayCatalog.find(record.item.id)||record.item;});if(continuing.length)content.appendChild(homeRail(continuing,['Продолжить просмотр','continue'],'continue'));
      rows.forEach(function(items,index){content.appendChild(homeRail(items,specs[index],index));});diagnostic('homeReady',rows.map(function(r){return r.length;}).join(','));
      var releases=WePlayCatalog.releaseSections(),note=WePlayLoading.create('Загружаем новинки');note.classList.add('inline-loading');content.appendChild(note);
      var waitForRows=restore&&((route.focusRail&&!document.getElementById(route.focusRail))||(route.scroll||0)>Math.max(0,viewport.scrollHeight-viewport.clientHeight)+1);
      var releaseTask=Promise.all(releases.map(function(spec){var key='home-'+spec.id+'-'+WePlayCatalog.releaseYear();return (cache[key]?Promise.resolve(cache[key]):news(spec.id,1,null,18).then(function(j){cache[key]=listOf(j);return cache[key];})).then(function(items){return{spec:spec,items:items};},function(error){return{spec:spec,items:[],error:error};});})).then(function(results){if(g!==generation)return;results.forEach(function(result,index){var section=homeRail(result.items,[result.spec.title,result.spec.id],specs.length+index);section.setAttribute('data-release-section',result.spec.id);if(!result.items.length)section.appendChild(element('p','home-release-empty',result.error?'Не удалось загрузить новинки. Откройте раздел и попробуйте ещё раз.':'Премьеры '+WePlayCatalog.releaseYear()+' года пока не найдены.'));content.appendChild(section);if(restore)restoreRailState(section.querySelector('.home-rail'),route,specs.length+index);var key=result.spec.id==='new-series'?'series':result.spec.id==='new-cartoons'?'cartoons':'films';pool[key]=pool[key].concat(result.items);});note.remove();var selected=WePlayPromo.select(pool,WePlayCatalog.releaseYear(),12);promo.updateItems(selected,false);diagnostic('releasesReady',results.map(function(result){return result.items.length;}).join(','));
        if(selected.length>=12&&['films','cartoons','series'].every(function(type){return selected.some(function(i){return i._promoKind===type;});})){commitPromo(selected);return;}
        Promise.all(releases.map(function(spec){return news(spec.id,2,null,18).then(function(j){return{key:spec.id==='new-series'?'series':spec.id==='new-cartoons'?'cartoons':'films',items:listOf(j)};},function(){return{key:'films',items:[]};});}).concat([news(109,1,null,18).then(function(j){return{key:'cartoons',items:listOf(j)};},function(){return{key:'cartoons',items:[]};})])).then(function(extra){if(g!==generation)return;extra.forEach(function(result){pool[result.key]=pool[result.key].concat(result.items);});commitPromo(WePlayPromo.select(pool,WePlayCatalog.releaseYear(),12));});
      });
      if(waitForRows)return releaseTask;
    }).catch(function(e){if(g===generation){loading.remove();errorBox(e.message,function(){navigate(current);});}});
  }
  function homeRail(items,spec,index){
    items=WePlayCatalog.dedupe(items);
    var section=element('section','home-section'),heading=element('div','section-heading'),controls=element('div','rail-controls');
    heading.appendChild(element('h2','',spec[0]));
    var rail=gridOf(items,'home-'+index);rail.classList.add('home-rail');rail.setAttribute('data-focus-grid','0');rail.id='home-rail-'+index;rail.setAttribute('aria-label',spec[0]);
    if(index!=='continue'){
      var all=button('','movie-card rail-all-card',function(){push({kind:WePlayCatalog.isReleaseCategory(spec[1])?'releases':'catalog',title:WePlayCatalog.isReleaseCategory(spec[1])?'Новинки':spec[0],category:spec[1]});},'rail-all-'+index),wrap=element('div','poster-wrap'),art=element('div','rail-all-art');
      art.appendChild(icon('caret-right'));wrap.appendChild(art);all.appendChild(wrap);all.appendChild(element('div','movie-title','Смотреть все'));all.appendChild(element('div','movie-meta',spec[0]));all.setAttribute('aria-label','Смотреть все: '+spec[0]);rail.appendChild(all);
    }
    var arrows=[];
    [-1,1].forEach(function(direction){
      var b=iconButton(direction<0?'Листать назад':'Листать вперёд',direction<0?'caret-left':'caret-right','circle-button rail-arrow',function(){
        WePlayFocus.pageRail(rail,direction);update();
      },'rail-'+(direction<0?'prev-':'next-')+index);b.setAttribute('aria-label',direction<0?'Листать назад: '+spec[0]:'Листать вперёд: '+spec[0]);b.setAttribute('aria-controls',rail.id);controls.appendChild(b);arrows.push(b);
    });
    function update(){
      if(index==='continue'){var fits=rail.scrollWidth<=rail.clientWidth+2;if(fits&&controls.contains(document.activeElement))focus(rail.querySelector('.movie-card'),false);controls.hidden=fits;arrows.forEach(function(arrow){arrow.disabled=fits;});}
      arrows[0].setAttribute('aria-disabled',String(rail.scrollLeft<8));arrows[1].setAttribute('aria-disabled',String(rail.scrollLeft>=rail.scrollWidth-rail.clientWidth-8));
    }
    if(index==='continue')controls.hidden=true;rail._updateControls=update;rail.addEventListener('scroll',update);heading.appendChild(controls);section.appendChild(heading);section.appendChild(rail);requestAnimationFrame(update);return section;
  }
  function featured(items,ready,resume) {
    function unique(list){var seen={};return list.filter(function(item){var id=WePlayCatalogUnion.canonical(item.id);if(seen[id])return false;seen[id]=true;return true;}).slice(0,12);}
    // Keep the first cover visible while curating, then freeze one complete playback order.
    ready=!!ready;items=unique(items);if(!ready)items=items.slice(0,1);
    var host=element('section','featured'),index=0;host.setAttribute('aria-label','Новое с высоким рейтингом');host.setAttribute('aria-roledescription','карусель');host.setAttribute('aria-live','off');host.setAttribute('data-promo-ready',String(ready));host.setAttribute('aria-busy',String(!ready));
    var pager=element('div','featured-pager'),position=element('span','featured-position'),dots=element('div','featured-dots');pager.appendChild(position);host.appendChild(dots);dots.setAttribute('aria-hidden','true');
    var DWELL=8000,remaining=DWELL,lastTick=Date.now(),interacted=false,disposed=false,ticker;
    if(resume&&items.length){var selected=-1;items.some(function(item,i){if(WePlayCatalogUnion.canonical(item.id)===WePlayCatalogUnion.canonical(resume.id)){selected=i;return true;}return false;});index=selected>=0?selected:Math.max(0,Math.min(items.length-1,Number(resume.index)||0));}
    function paused(){return !ready||items.length<2||document.hidden||!overlay.hidden||WePlaySupport.isOpen()||WePlayContinue.isOpen()||window.WePlayUpdatesUI&&WePlayUpdatesUI.isOpen()||sidebar.classList.contains('expanded')||viewport.scrollTop>160||interacted&&!host.contains(document.activeElement);}
    function paintDots(){dots.innerHTML='';items.forEach(function(item,i){var dot=element('span',i===index?'active':'');if(i===index)dot.appendChild(element('span','featured-progress'));dots.appendChild(dot);});pager.querySelectorAll('button').forEach(function(b){b.disabled=items.length<2;});host.setAttribute('data-featured-count',String(items.length));host.setAttribute('data-featured-index',String(index));}
    function paintClock(){host.setAttribute('data-autoplay-state',paused()?'paused':'running');host.setAttribute('data-remaining-ms',String(Math.round(remaining)));var progress=dots.querySelector('.featured-progress');if(progress)progress.style.transform='scaleX('+Math.max(0,Math.min(1,1-remaining/DWELL))+')';}
    function interact(){if(disposed)return;remaining=DWELL;lastTick=Date.now();interacted=true;paintClock();}
    function visibility(){lastTick=Date.now();paintClock();}
    function cancelSlideCleanup(slide){clearTimeout(slide._leaveTimer);if(slide._leaveEnd)slide.removeEventListener('transitionend',slide._leaveEnd);slide._leaveTimer=null;slide._leaveEnd=null;}
    function removeSlide(slide){cancelSlideCleanup(slide);slide.remove();}
    function tick(){if(disposed||!host.isConnected)return;var now=Date.now(),delta=Math.max(0,now-lastTick);lastTick=now;if(!paused()){remaining=Math.max(0,remaining-delta);if(remaining<=0){index=(index+1)%items.length;draw(1);}}paintClock();}
    document.addEventListener('keydown',interact,true);document.addEventListener('mousedown',interact,true);document.addEventListener('visibilitychange',visibility);viewport.addEventListener('scroll',visibility);
    featuredDispose=function(){disposed=true;clearInterval(ticker);host.querySelectorAll('.featured-slide').forEach(cancelSlideCleanup);document.removeEventListener('keydown',interact,true);document.removeEventListener('mousedown',interact,true);document.removeEventListener('visibilitychange',visibility);viewport.removeEventListener('scroll',visibility);};ticker=setInterval(tick,250);
    [['Предыдущая карточка','caret-left',-1,'featured-prev'],['Следующая карточка','caret-right',1,'featured-next']].forEach(function(spec){var b=iconButton(spec[0],spec[1],'circle-button',function(){if(!items.length)return;interacted=false;index=(index+spec[2]+items.length)%items.length;draw(spec[2],true);},spec[3]);b.setAttribute('aria-label',spec[0]);pager.appendChild(b);});host.appendChild(pager);
    function draw(direction,manual) {
      if(!items.length){paintDots();paintClock();return;}var empty=host.querySelector('.featured-empty');if(empty)empty.remove();
      var focused=host.contains(document.activeElement)?document.activeElement.id:null;
      var old=null,visible=-1,item=items[index],skipMotion=manual&&!!host.querySelector('.slide-leaving');cache['item-'+item.id]=item;
      // Rapid skips stay immediate instead of restarting a half-finished dissolve.
      if(!skipMotion)host.querySelectorAll('.featured-slide').forEach(function(candidate){var opacity=Number(getComputedStyle(candidate).opacity.replace(',','.'));if(opacity>visible){old=candidate;visible=opacity;}});
      host.querySelectorAll('.featured-slide').forEach(function(candidate){if(candidate!==old)removeSlide(candidate);});if(old)cancelSlideCleanup(old);
      if(old){old.classList.add('slide-leaving');old.setAttribute('aria-hidden','true');old.querySelectorAll('[id]').forEach(function(e){e.removeAttribute('id');});old.querySelectorAll('button').forEach(function(e){e.disabled=true;e.classList.remove('focusable');});}
      var slide=element('div','featured-slide'+(text(item.title).length>30?' long-title':''));slide.setAttribute('data-content-id',String(item.id));slide.setAttribute('data-media-kind',WePlayPromo.kind(item));host.setAttribute('data-current-id',String(item.id));
      var body=element('div','featured-body');body.appendChild(element('p','eyebrow',WePlayPromo.kind(item)==='series'?'Новый сериал':WePlayPromo.kind(item)==='cartoons'?'Новый мультфильм':'Новое кино'));
      body.appendChild(element('h2','featured-title',text(item.title)));
      body.appendChild(element('p','featured-meta',[xf(item,'year'),genres(item).slice(0,2).join(' · ')].filter(Boolean).join(' · ')));body.appendChild(ratings(item,'inline'));
      var summary=text(item.short_story||item.full_story||item.descr),description=element('p','featured-description',summary);description.hidden=!summary;body.appendChild(description);
      if(!summary&&item._source)WePlayCatalog.info(item).then(function(full){if(slide.isConnected){description.textContent=text(full.full_story||full.short_story);description.hidden=!description.textContent;}}).catch(function(){});
      var actions=element('div','actions');actions.appendChild(iconButton('Смотреть','play','primary',function(){push({kind:'detail',id:item.id,play:true});},'featured-open',true));
      var fav=iconButton(isFavorite(item.id)?'В избранном':'В избранное',isFavorite(item.id)?'check':'plus','secondary favorite-action',function(){toggleFavorite(item,fav);},'featured-favorite');fav.setAttribute('aria-label',isFavorite(item.id)?'Убрать из избранного':'В избранное');fav.setAttribute('aria-pressed',String(isFavorite(item.id)));actions.appendChild(fav);
      var info=iconButton('О фильме','info','secondary favorite-action',function(){push({kind:'detail',id:item.id});},'featured-info');info.setAttribute('aria-label','О фильме');actions.appendChild(info);body.appendChild(actions);
      var art=element('div','featured-art'),image=element('img');image.alt='';art.appendChild(image);requestAnimationFrame(function(){WePlayArtwork.attach(image,item,'backdrop');});slide.appendChild(art);slide.appendChild(element('div','featured-scrim'));slide.appendChild(body);
      if(old){slide.style.opacity='0';slide.style.transform='translateX('+(direction*8)+'px)';}
      host.insertBefore(slide,dots);position.textContent=(index+1)+' / '+items.length;paintDots();remaining=DWELL;lastTick=Date.now();paintClock();
      if(old){requestAnimationFrame(function(){requestAnimationFrame(function(){
        if(disposed||!slide.isConnected||slide.classList.contains('slide-leaving'))return;
        function finish(){
          clearTimeout(old._leaveTimer);
          if(disposed||!old.isConnected||!slide.isConnected){removeSlide(old);return;}
          var before=Number(getComputedStyle(old).opacity.replace(',','.')),after=Number(getComputedStyle(slide).opacity.replace(',','.'));
          if(before<=.001||after>=.999)removeSlide(old);else old._leaveTimer=setTimeout(finish,100);
        }
        old._leaveEnd=function(event){if(event.target===old&&event.propertyName==='opacity')finish();};old.addEventListener('transitionend',old._leaveEnd);
        old.style.opacity='0';old.style.transform='translateX('+(-direction*8)+'px)';slide.style.opacity='1';slide.style.transform='translateX(0)';
        var timing=getComputedStyle(old).transitionDuration.match(/(\d+(?:[.,]\d+)?|[.,]\d+)\s*(ms|s)/),duration=timing?Number(timing[1].replace(',','.'))*(timing[2]==='ms'?1:1000):600;old._leaveTimer=setTimeout(finish,duration+100);
      });});}
      if(focused)focus(document.getElementById(focused));WePlayArtwork.prefetch([items[(index+1)%items.length]],true,true,1);
    }
    host.updateItems=function(next,done){
      if(disposed)return null;if(ready)return items.slice();if(!done)return null;
      var first=items[0],hadItems=items.length;next=unique(next);items=unique(first?[first].concat(next):next);index=0;ready=true;remaining=DWELL;lastTick=Date.now();host.setAttribute('data-promo-ready','true');host.setAttribute('aria-busy','false');
      if(!hadItems&&items.length)draw(0);else{position.textContent=items.length?'1 / '+items.length:'';paintDots();paintClock();}var empty=host.querySelector('.featured-empty');if(!items.length&&empty)empty.textContent='Пока нет новинок с рейтингом от 7';if(items.length>1)WePlayArtwork.prefetch([items[1]],true,true,1);diagnostic('promoReady',items.length);return items.slice();
    };
    host.navigationState=function(){return{items:items.slice(),ready:ready,index:index,id:items[index]&&items[index].id,remaining:remaining,interacted:interacted};};
    host.promoSnapshot=function(){return items.map(function(item){return{id:item.id,kind:WePlayPromo.kind(item),year:WePlayPromo.year(item),score:WePlayPromo.score(item)};});};
    if(!items.length)host.appendChild(element('p','featured-empty','Подбираем новинки с высоким рейтингом…'));draw(0);if(resume){remaining=Math.max(0,Math.min(DWELL,Number(resume.remaining)||DWELL));interacted=!!resume.interacted;lastTick=Date.now();paintClock();}return host;
  }
  function filterBar(state,onChange) {
    var row=element('div','filters');
    [['Жанр','janre'],['Год','year'],['Страна','strana'],['Рейтинг от','rating']].forEach(function(spec){
      var label=element('label','',spec[0]),s=element('select','focusable');s.setAttribute('aria-label',spec[0]);
      s.id='filter-'+spec[1];
      var options=spec[1]==='rating'?['','5','6','7','8','9']:[''];
      if(spec[1]!=='rating')state.items.forEach(function(item){(spec[1]==='janre'?genres(item):xf(item,spec[1]).split(/[,/]/)).forEach(function(v){v=v.trim();if(v&&options.indexOf(v)<0)options.push(v);});});
      if(spec[1]==='year')options=options.slice(0,1).concat(options.slice(1).sort().reverse());
      else if(spec[1]!=='rating')options=options.slice(0,1).concat(options.slice(1).sort());
      options.forEach(function(v){var o=element('option','',v||'Все');o.value=v;s.appendChild(o);});
      s.value=state.filters[spec[1]]||'';
      s.addEventListener('change',function(){selectEditing=false;state.filters[spec[1]]=s.value;onChange();});label.appendChild(s);row.appendChild(label);
    });return row;
  }
  function catalog(g) {
    var route=current,isReleases=route.kind==='releases';header(route.title||'Каталог',isReleases?'Премьеры '+WePlayCatalog.releaseYear()+' года':null);
    if(isReleases){var sections=WePlayCatalog.releaseSections(),tabs=element('div','library-toolbar release-tabs');route.category=route.category||sections[0].id;route.catalogs=route.catalogs||{};route.data=route.catalogs[route.category]||(route.catalogs[route.category]={items:[],page:0,total:0,more:true,filters:{}});tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Раздел новинок');sections.forEach(function(spec){var selected=route.category===spec.id,b=button(spec.label,'library-tab'+(selected?' selected':''),function(){if(route.category===spec.id)return;route.category=spec.id;navigate(route);},'releases-tab-'+spec.id);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(selected));b.setAttribute('aria-controls','releases-results');tabs.appendChild(b);});content.appendChild(tabs);}
    if(!route.data)route.data={items:[],page:0,total:0,more:true,filters:{}};
    var state=route.data, filters=element('div'),results=element('div'),footer=element('div','load-more'),pending=false;if(isReleases){results.id='releases-results';results.setAttribute('role','tabpanel');results.setAttribute('aria-labelledby','releases-tab-'+route.category);}
    content.appendChild(filters);content.appendChild(results);content.appendChild(footer);
    function draw() {
      if(g!==generation)return;var activeId=document.activeElement&&document.activeElement.id,reuse=imageNodes(results);
      results.innerHTML='';filters.innerHTML='';filters.appendChild(filterBar(state,draw));
      var found=state.items.filter(function(i){return Object.keys(state.filters).every(function(k){var v=state.filters[k];if(!v)return true;
        if(k==='rating')return (score(i,'kp_rating')||score(i,'imdb_rating')||0)>=Number(v);
        return xf(i,k).toLowerCase().indexOf(v.toLowerCase())>=0;});});
      results.appendChild(found.length?gridOf(found,null,false,reuse):emptyBox(isReleases?'Премьеры '+WePlayCatalog.releaseYear()+' года пока не найдены. Смените фильтры или загрузите ещё.':'Смените фильтры или загрузите ещё фильмы.'));
      footer.innerHTML='';footer.appendChild(element('p','count','Загружено '+state.items.length+(typeof state.total==='number'?' из '+state.total:'')));
      if(state.more)footer.appendChild(button('Загрузить ещё','secondary',loadMore,'load-more'));
      if(activeId)focus(document.getElementById(activeId));
    }
    function loadMore() {
      if(pending)return Promise.resolve();pending=true;
      var fromFooter=footer.contains(document.activeElement),oldIds=state.items.map(function(i){return String(i.id);});
      footer.setAttribute('aria-busy','true');var more=footer.querySelector('button');if(more){more.style.minWidth=more.offsetWidth+'px';more.textContent='';more.appendChild(WePlayLoading.indicator());more.setAttribute('aria-label','Загружаем фильмы');more.setAttribute('aria-disabled','true');}
      else{footer.innerHTML='';}
      return news(route.category,state.page+1).then(function(j){if(g!==generation)return j;return WePlayArtwork.prepare(listOf(j),true,false,8).then(function(){return j;});}).then(function(j){
        if(g!==generation)return;var list=listOf(j),seen={};state.items.forEach(function(i){seen[i.id]=true;});
        state.items=WePlayCatalog.dedupe(state.items.concat(list));state.page++;
        var pagination=j.data&&j.data.pagination;state.total=pagination?pagination.total:state.items.length;
        state.more=pagination?state.page<pagination.pages:list.length===60;draw();
        diagnostic('catalogReady',route.category+':'+state.items.length);
        if(state.page>1&&fromFooter){var added=list.filter(function(i){return oldIds.indexOf(String(i.id))<0;}).map(function(i){return document.getElementById('movie-'+i.id);}).filter(Boolean);focus(added[0]||document.getElementById('load-more')||results.querySelector('.focusable'));}
      }).catch(function(e){if(g===generation){var hadFocus=footer.contains(document.activeElement);footer.innerHTML='';footer.appendChild(element('p','count',e.message));footer.appendChild(button('Повторить','secondary',loadMore,'load-more'));if(hadFocus||!state.items.length)focus(footer.querySelector('.focusable'));}}).finally(function(){pending=false;footer.removeAttribute('aria-busy');});
    }
    if(state.items.length){draw();return Promise.resolve();}
    var loading=pageLoader(isReleases?'Загружаем новинки':'Загружаем каталог');return loadMore().finally(function(){loading.remove();});
  }
  function searchPage(g) {
    var route=current;header('Поиск','Фильмы и сериалы в одном месте');
    var form=element('form','search-form'),input=button('','search-query-display',null,'query'),results=element('div','search-results-scroll'),workspace=element('div','search-workspace'),panel=element('div','search-input-panel'),resultsPanel=element('section','search-results-panel');results.id='search-results';resultsPanel.setAttribute('aria-label','Результаты поиска');
    var field=element('div','search-field');field.appendChild(icon('magnifying-glass'));field.appendChild(input);form.appendChild(field);
    var clear=iconButton('Очистить поиск','x','search-clear',function(){keyboard.clear();keyboard.focus();},'search-clear');clear.setAttribute('aria-label','Очистить поиск');field.appendChild(clear);
    var submit=button('Найти','primary',null,'search-submit');submit.type='submit';
    var requestId=0,pendingQuery='',pendingSearch=null,searchAbort=null,activeLoading=null,takeResultsFocus=false,autoTimer=null;
    var keyboard=WePlayKeyboard.create({display:input,clear:clear,submit:submit,value:route.draft===undefined?route.query||'':route.draft,state:route.keyboard,focus:focus,active:function(){return g===generation&&overlay.hidden&&exitDialog.hidden&&!WePlaySupport.isOpen()&&!sidebar.contains(document.activeElement);},onState:function(state){route.keyboard=state;},onChange:changed,onSubmit:function(){run(false,false);},onLeft:openSidebar,onRight:toResults});
    form.appendChild(keyboard.root);form.appendChild(submit);panel.appendChild(form);resultsPanel.appendChild(results);workspace.appendChild(panel);workspace.appendChild(resultsPanel);content.appendChild(workspace);clear.hidden=!input.value;submit.disabled=!WePlaySearch.normal(input.value);
    function toResults(){var previous=document.getElementById(route.searchResultFocus),target=previous&&results.contains(previous)?previous:results.querySelector('.movie-card')||results.querySelector('.focusable:not(:disabled)');if(target){focus(target);return true;}return false;}
    function searchKey(e,k){
      var active=document.activeElement;
      if(results.contains(active)){
        var grid=active.closest('[data-focus-grid]'),list=grid&&WePlayFocus.items(grid),at=list&&list.indexOf(active),columns=grid&&(Number(grid.getAttribute('data-focus-grid'))||list.length),tabs=active.closest('.search-tabs,.query-list'),buttons=tabs&&Array.prototype.slice.call(tabs.querySelectorAll('.focusable'));
        if(k===37&&(grid&&at%columns===0||tabs&&buttons[0]===active||!grid&&!tabs)){keyboard.focus();e.preventDefault();return true;}
        var up=k===38||k===33||k===427,down=k===40||k===34||k===428,more=results.querySelector('#load-more'),retry=results.querySelector('#search-retry');
        if(down&&grid&&at>=0&&Math.floor(at/columns)===Math.floor((list.length-1)/columns)){focus(more||retry||active);e.preventDefault();return true;}
        if((up||down)&&(active===more||active===retry)){
          var cards=results.querySelector('#search-result-list [data-focus-grid]'),items=cards&&WePlayFocus.items(cards),remembered=cards&&cards._focusIndex,target;
          if(up)target=(active===retry&&more?more:items&&items[Math.min(items.length-1,remembered===undefined?items.length-1:remembered)])||results.querySelector('.search-tabs [aria-selected="true"]');
          else if(active===more)target=retry;
          focus(target||active);e.preventDefault();return true;
        }
      }
      return keyboard.key(e,k);
    }
    var editor={editing:false,initial:keyboard.initial,key:searchKey,back:function(){if(results.contains(document.activeElement)){keyboard.focus();return true;}return false;},commit:function(){rememberQuery(route.query);},dispose:function(){clearTimeout(autoTimer);cancel();keyboard.dispose();}};
    searchEditor=editor;
    results.addEventListener('focusin',function(e){if(e.target.classList.contains('movie-card'))route.searchResultFocus=e.target.id;});
    function rememberQuery(query){query=WePlaySearch.clean(query);if(!WePlaySearch.normal(query))return;var history=searchHistory().filter(function(q){return WePlaySearch.normal(q)!==WePlaySearch.normal(query);});history.unshift(query);try{localStorage.setItem('lord.search-history.v1',JSON.stringify(history.slice(0,8)));}catch(ignore){}}
    function cancel(){requestId++;if(route.searchState&&route.searchState.pending){route.searchState.pending=false;route.searchState.cancelled=true;}if(searchAbort)searchAbort.abort();searchAbort=null;pendingSearch=null;pendingQuery='';if(activeLoading)activeLoading.remove();activeLoading=null;}
    function changed(value){
      if(g!==generation)return;route.draft=value;clear.hidden=!value;submit.disabled=!WePlaySearch.normal(value);clearTimeout(autoTimer);cancel();var query=WePlaySearch.clean(value);results.scrollTop=0;route.searchScroll=0;route.searchLimit=36;if(WePlaySearch.normal(query)!==WePlaySearch.normal(route.query)){route.searchFilter='all';delete route.searchResultFocus;}
      if(!WePlaySearch.normal(query)){route.query='';delete route.items;delete route.searchState;draw();return;}
      route.query=query;route.items=WePlaySearch.normal(query).length>=2?WePlaySearch.rank(WePlayCatalog.searchKnown(),query).slice(0,120):[];route.searchState={pending:true,typing:true,short:WePlaySearch.normal(query).length<2};draw();
      if(WePlaySearch.normal(query).length>=2)autoTimer=setTimeout(function(){autoTimer=null;run(false,true);},600);
    }
    function loader(label){var host=WePlayLoading.create(label),stopped=false;host.classList.add('search-panel-loading');var timer=setTimeout(function(){if(!stopped&&g===generation)resultsPanel.appendChild(host);},150);return{remove:function(){if(stopped)return;stopped=true;clearTimeout(timer);host.remove();}};}
    function run(force,stay) {
      clearTimeout(autoTimer);autoTimer=null;var query=WePlaySearch.clean(input.value);if(!WePlaySearch.normal(query)){keyboard.focus();return;}
      takeResultsFocus=!stay;if(!stay){focus(submit,false);rememberQuery(query);}if(pendingSearch&&pendingQuery===query){if(!stay&&results.querySelector('.movie-card')){toResults();takeResultsFocus=false;}return pendingSearch;}
      cancel();var id=++requestId,controller=new AbortController();searchAbort=controller;pendingQuery=query;route.query=query;route.draft=input.value;route.items=WePlaySearch.rank(WePlayCatalog.searchKnown(),query).slice(0,120);route.searchFilter=route.searchFilter||'all';route.searchLimit=36;route.searchState={pending:true};results.scrollTop=0;
      draw();var loading=loader('Ищем «'+query+'»');activeLoading=loading;
      function apply(state){
        if(g!==generation||id!==requestId||controller.signal.aborted)return;route.items=state.items;route.searchState=state;draw();
        if(state.items.length||!state.pending){loading.remove();if(activeLoading===loading)activeLoading=null;}
        if(takeResultsFocus&&document.activeElement===submit&&WePlaySearch.clean(input.value)===query){var first=results.querySelector('.movie-card');if(first){focus(first);takeResultsFocus=false;}else if(!state.pending)focus(submit,false);}
      }
      pendingSearch=Promise.resolve().then(function(){return WePlaySearch.search(query,{signal:controller.signal,force:force===true,onUpdate:apply});}).then(function(state){if(g!==generation||id!==requestId||controller.signal.aborted)return;apply(state);diagnostic('searchReady',state.items.length);}).catch(function(error){if(g!==generation||id!==requestId||controller.signal.aborted||error.name==='AbortError')return;route.searchState={error:true,pending:false};draw();}).finally(function(){loading.remove();if(activeLoading===loading)activeLoading=null;if(id===requestId){pendingSearch=null;pendingQuery='';searchAbort=null;}});
      return pendingSearch;
    }
    function resultTop(node){var top=0;while(node&&node!==results){top+=node.offsetTop||0;node=node.offsetParent;}return top;}
    function draw(){
      var active=document.activeElement,focused=results.contains(active)?active.id:null,focusY=focused?resultTop(active)-results.scrollTop:null,reuse=imageNodes(results),scroll=results.scrollTop;results.innerHTML='';
      if(!route.query){discovery();return;}
      var state=route.searchState||{},all=route.items||[],filter=route.searchFilter||'all',found=all.filter(function(item){return filter==='all'||WePlayCatalogUnion.kind(item)===filter;}),limit=route.searchLimit||36;
      var heading=element('div','section-heading');heading.appendChild(element('h2','','Результаты поиска'));heading.appendChild(element('span','count',String(found.length)));results.appendChild(heading);
      results.appendChild(element('p','search-query-caption','По запросу «'+route.query+'»'));
      var tabs=element('div','library-toolbar search-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Тип контента');
      [['all','Все'],['movie','Фильмы'],['series','Сериалы']].forEach(function(spec){var selected=filter===spec[0],b=button(spec[1],'library-tab'+(selected?' selected':''),function(){route.searchFilter=spec[0];route.searchLimit=36;results.scrollTop=0;draw();focus(document.getElementById('search-filter-'+spec[0]),false);},'search-filter-'+spec[0]);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(selected));b.setAttribute('aria-controls','search-result-list');tabs.appendChild(b);});results.appendChild(tabs);
      var note=element('p','search-help search-status');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
      if(state.short)note.textContent='Введите ещё символ или нажмите «Найти».';else if(state.pending&&all.length)note.textContent='Ищем во всех источниках…';else if(state.partial&&all.length)note.textContent=state.cached?'Источники не ответили. Показаны сохранённые результаты.':'Часть источников не ответила. Показаны доступные результаты.';else if(state.cancelled&&!all.length)note.textContent='Нажмите «Найти», чтобы выполнить новый поиск.';
      note.hidden=!note.textContent;results.appendChild(note);
      var list=element('div');list.id='search-result-list';list.setAttribute('role','tabpanel');list.setAttribute('aria-labelledby','search-filter-'+filter);list.setAttribute('aria-busy',String(!!state.pending));results.appendChild(list);
      if(found.length){var cards=gridOf(found.slice(0,limit),null,false,reuse);cards.setAttribute('data-focus-grid','3');list.appendChild(cards);if(found.length>limit){var footer=element('div','load-more');footer.appendChild(button('Показать ещё','secondary',function(){var from=document.activeElement.id==='load-more',next=found[limit];route.searchLimit=limit+36;draw();if(from&&next)focus(document.getElementById('movie-'+next.id));},'load-more'));list.appendChild(footer);}}
      else if(!state.pending&&!state.cancelled){
        var message=state.error||state.failed&&state.failed.length&&!(state.sources||[]).length?'Не удалось выполнить поиск. Проверьте подключение и попробуйте ещё раз.':filter!=='all'&&all.length?'В этом разделе ничего нет. Выберите «Все».':state.partial?'В доступных каталогах ничего не найдено. Часть источников не ответила.':'По этому названию ничего не найдено. Проверьте написание или введите часть названия.';
        list.appendChild(emptyBox(message));
      }
      if(!state.pending&&(state.error||state.partial)){var retry=button('Повторить поиск','secondary',function(){run(true);},'search-retry');results.appendChild(retry);}
      if(focused){var restored=document.getElementById(focused);if(!restored){var canon=active.getAttribute('data-content-id');restored=Array.prototype.filter.call(results.querySelectorAll('.movie-card'),function(card){return canon&&WePlayCatalog.same(WePlayCatalog.find(canon),WePlayCatalog.find(card.getAttribute('data-content-id')));})[0];}if(restored){focus(restored,false);results.scrollTop=focusY===null?scroll:resultTop(restored)-focusY;}else results.scrollTop=scroll;}else results.scrollTop=scroll;
    }
    function discovery(){
      var history=searchHistory();if(history.length){var recent=element('section','search-recent');recent.appendChild(element('h2','','Недавние запросы'));var queries=element('div','query-list');history.forEach(function(q,index){queries.appendChild(button(q,'secondary query-chip',function(){keyboard.set(q);run(false,false);},'recent-query-'+index));});recent.appendChild(queries);results.appendChild(recent);}
      var discovery=element('section','search-discovery');discovery.appendChild(element('h2','','Что посмотреть'));var grid=element('div','browse-grid');grid.setAttribute('data-focus-grid','3');[['Фильмы',106,'film-slate'],['Сериалы',13,'television'],['Мультфильмы',109,'smiley']].forEach(function(spec,index){var b=button('','browse-tile',function(){push({kind:'catalog',title:spec[0],category:spec[1]});},'browse-'+index);b.appendChild(icon(spec[2],spec[1]===109));b.appendChild(element('span','',spec[0]));b.setAttribute('aria-label',spec[0]);grid.appendChild(b);});discovery.appendChild(grid);results.appendChild(discovery);
    }
    form.addEventListener('submit',function(e){e.preventDefault();run(false,false);});draw();return Promise.resolve();
  }
  function searchHistory(){try{var list=JSON.parse(localStorage.getItem('lord.search-history.v1')||'[]');return Array.isArray(list)?list.filter(function(q){return typeof q==='string'&&q.length<=160;}).slice(0,8):[];}catch(ignore){return [];}}
  function favoritesPage(){
    var route=current,all=favorites(),view=content;header('Избранное',all.length?'Сохранено: '+all.length:'Ваша коллекция фильмов и сериалов');
    if(!all.length){var empty=emptyBox('Добавьте фильм или сериал с помощью кнопки с плюсом.');empty.querySelector('h2').textContent='Сохраните на потом';empty.appendChild(iconButton('Найти фильм','magnifying-glass','primary',function(){push({kind:'search'});},'favorites-search'));content.appendChild(empty);return Promise.resolve();}
    var tabs=element('div','library-toolbar'),results=element('div');route.sort=route.sort||'recent';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Сортировка избранного');
    [['recent','Недавно добавленные'],['title','По названию'],['rating','По рейтингу']].forEach(function(spec){var b=button(spec[1],'library-tab',function(){route.sort=spec[0];draw();focus(b);},'favorites-'+spec[0]);b.setAttribute('role','tab');tabs.appendChild(b);});content.appendChild(tabs);content.appendChild(results);
    function draw(){var list=all.slice(),reuse=imageNodes(results);if(route.sort==='title')list.sort(function(a,b){return text(a.title).localeCompare(text(b.title),'ru');});if(route.sort==='rating')list.sort(function(a,b){return (score(b,'kp_rating')||score(b,'imdb_rating')||0)-(score(a,'kp_rating')||score(a,'imdb_rating')||0);});
      tabs.querySelectorAll('button').forEach(function(b){var selected=b.id==='favorites-'+route.sort;b.classList.toggle('selected',selected);b.setAttribute('aria-selected',String(selected));});results.innerHTML='';results.appendChild(gridOf(list,null,true,reuse));}
    var loading=pageLoader('Загружаем избранное');return WePlayArtwork.prepare(all,false,false,6).then(function(){if(view===content)draw();}).finally(function(){loading.remove();});
  }
  function collections(g) {
    header('Подборки','Истории под настроение');var loading=pageLoader('Загружаем подборки');
    return (categories.length?Promise.resolve(categories):api({action:'categories'}).then(function(j){categories=listOf(j);return categories;})).then(function(cats){
      if(g!==generation)return;loading.remove();var grid=element('div','collection-grid');grid.setAttribute('data-focus-grid','3');
      cats.filter(function(c){return Number(c.parentid||c.parent_id)===38;}).forEach(function(c){
        var name=text(c.name),glyph=/мультсериал/i.test(name)?'television-smiley':/мульт/i.test(name)?'smiley':/сериал|netflix|hbo/i.test(name)?'television':/семейн|детск|фантаст/i.test(name)?'sparkle':/наград|лучш|топ|преми/i.test(name)?'stack':'film-slate',b=button('','collection',function(){push({kind:'catalog',category:c.id,title:name});},'collection-'+c.id),top=element('span','collection-top'),symbol=element('span','collection-symbol'),arrow=element('span','collection-arrow');
        b.setAttribute('aria-label',name);top.setAttribute('aria-hidden','true');
        var brand=collectionBrand(name);
        if(brand){
          symbol.classList.add('collection-brand');if(brand==='dc')symbol.classList.add('collection-brand-square');symbol.setAttribute('data-brand',brand);
          var logo=element('img','collection-brand-logo');logo.alt='';logo.draggable=false;logo.src=localAsset('assets/brands/'+brand+'.svg');
          logo.onerror=function(){symbol.classList.remove('collection-brand','collection-brand-square');symbol.removeAttribute('data-brand');symbol.textContent='';symbol.appendChild(icon(glyph,true));};symbol.appendChild(logo);
        }else symbol.appendChild(icon(glyph,true));
        arrow.appendChild(icon('caret-right'));top.appendChild(symbol);top.appendChild(arrow);b.appendChild(top);
        var label=element('span','collection-name'),words=name.split(' ');if(words.length>2){label.appendChild(document.createTextNode(words.slice(0,-2).join(' ')+' '));label.appendChild(element('span','collection-tail',words.slice(-2).join(' ')));}else label.textContent=name;b.appendChild(label);grid.appendChild(b);
      });
      content.appendChild(grid.children.length?grid:emptyBox('Подборки пока недоступны. Попробуйте позже или откройте раздел «Фильмы».'));diagnostic('collectionsReady',grid.children.length);
    }).catch(function(e){if(g===generation){loading.remove();errorBox(e.message,function(){navigate(current);});}});
  }
  function collectionBrand(name){
    var brands=[['netflix',/\bnetflix\b|нетфликс/i],['appletv',/\bapple\s*tv\b|эппл\s*тв/i],['hbo',/\bhbo\b/i],['hulu',/\bhulu\b|хулу/i],['marvel',/\bmarvel\b|марвел/i],['dc',/\bdc\b|диси/i]];
    for(var i=0;i<brands.length;i++)if(brands[i][1].test(name))return brands[i][0];return null;
  }
  function detail(g) {
    var route=current,known=cache['full-'+route.id];var loading=pageLoader('Загружаем фильм');
    return (known?Promise.resolve(known):api({action:'news',do:'get',id:route.id}).then(function(j){
      var d=j.data,item=Array.isArray(d)?d[0]:(d.item||d.news||d);if(!item||!item.id)throw new Error('Фильм не найден');cache['full-'+route.id]=item;return item;
    })).then(function(item){if(g!==generation)return item;return WePlayArtwork.prepare([item],true,true,1).then(function(){return item;});}).then(function(item){
      if(g!==generation)return;loading.remove();
      var top=element('header','detail-topbar');top.appendChild(detailIconButton('Назад','arrow-left','secondary detail-back',back,'detail-back'));var headerActions=element('div','detail-header-actions');appendUpdateControl(headerActions);headerActions.appendChild(supportControl());top.appendChild(headerActions);content.appendChild(top);
      var wrap=element('article','detail'),hero=element('section','detail-hero'),art=element('div','detail-art'),background=element('img'),serial=isSeries(item);
      background.alt='';art.appendChild(background);hero.appendChild(art);hero.appendChild(element('div','detail-scrim'));requestAnimationFrame(function(){WePlayArtwork.attach(background,item,'backdrop');});
      var body=element('div','detail-content');body.appendChild(element('p','eyebrow',serial?'Сериал':'Фильм'));var title=element('h1','',text(item.title));title.id='detail-title';body.appendChild(title);hero.setAttribute('aria-labelledby','detail-title');
      var original=xf(item,'original_title');if(original)body.appendChild(element('p','original-title',original));
      var detailMeta=metadata(item),durationMeta=element('span','meta-part detail-duration');durationMeta.id='detail-duration';durationMeta.hidden=true;durationMeta.setAttribute('aria-live','polite');detailMeta.insertBefore(durationMeta,detailMeta.children[xf(item,'year')?1:0]||null);body.appendChild(detailMeta);body.appendChild(ratings(item,'inline'));
      var seasonsMeta=null,seriesStatusMeta=null;if(serial){seasonsMeta=element('span','meta-part');seasonsMeta.id='detail-seasons';seasonsMeta.hidden=true;seasonsMeta.setAttribute('aria-live','polite');detailMeta.insertBefore(seasonsMeta,durationMeta.nextSibling);seriesStatusMeta=element('span','media-tag');seriesStatusMeta.id='detail-series-status';seriesStatusMeta.hidden=true;seriesStatusMeta.setAttribute('aria-live','polite');detailMeta.insertBefore(seriesStatusMeta,seasonsMeta.nextSibling);}
      var story=text(item.full_story||item.fullStory||item.short_story||item.descr);if(story)body.appendChild(element('p','detail-summary',story));
      var actions=element('div','actions');
      var watch=detailIconButton('Смотреть','play','primary',function(){openPlayer(item,null);},'watch');watch.disabled=!xf(item,'film');actions.appendChild(watch);
      var restart=detailIconButton('Сначала','arrow-counter-clockwise','secondary',function(){openPlayer(item,null,null,true);},'detail-restart');restart.setAttribute('aria-label','Смотреть сначала');restart.disabled=watch.disabled;restart.hidden=true;actions.appendChild(restart);
      function returnToPlay(){viewport.scrollTop=0;focus(watch.disabled?document.getElementById('detail-back'):watch,false);}
      var fav=detailIconButton(isFavorite(item.id)?'В избранном':'В избранное',isFavorite(item.id)?'check':'plus','secondary detail-favorite',function(){toggleFavorite(item,fav);},'detail-favorite');fav.setAttribute('aria-pressed',String(isFavorite(item.id)));fav.setAttribute('aria-label',isFavorite(item.id)?'Убрать из избранного':'В избранное');actions.appendChild(fav);
      actions.appendChild(detailIconButton('Подробнее','info','secondary',function(){viewport.scrollTop=about.offsetTop;focus(document.getElementById('detail-return'),false);},'detail-more'));body.appendChild(actions);
      var resumeInfo=element('div','detail-resume');resumeInfo.id='detail-resume';resumeInfo.hidden=true;var resumeLabel=element('p','detail-resume-label'),resumeTrack=element('div','detail-resume-track'),resumeFill=element('span');resumeTrack.appendChild(resumeFill);resumeTrack.setAttribute('aria-hidden','true');resumeInfo.appendChild(resumeLabel);resumeInfo.appendChild(resumeTrack);body.appendChild(resumeInfo);
      detailProgressUpdate=function(){if(g!==generation||!watch.isConnected)return;var record=WePlayProgress.get(item),canResume=WePlayProgress.canResume(record);watch.querySelector('.button-label').textContent=canResume?'Продолжить':'Смотреть';watch.setAttribute('aria-label',canResume?'Продолжить: '+WePlayProgress.label(record):'Смотреть');restart.hidden=!canResume;resumeInfo.hidden=!canResume;resumeLabel.textContent=canResume?WePlayProgress.label(record):'';resumeTrack.hidden=!canResume||!record.duration;resumeFill.style.transform='scaleX('+WePlayProgress.ratio(record)+')';if(!canResume&&document.activeElement===restart)focus(watch,false);};
      if(!xf(item,'film'))body.appendChild(element('p','source-caption','Видео для этого фильма пока недоступно.'));
      hero.appendChild(body);wrap.appendChild(hero);
      var seasonSection=null,seasonResults=null,seasonRetry=null,seasonRequest=0;
      if(serial){
        seasonSection=element('section','detail-seasons-section');seasonSection.id='detail-season-section';seasonSection.setAttribute('aria-labelledby','detail-season-heading');var seasonHeading=element('div','section-heading'),seasonTitle=element('h2','','Сезоны');seasonTitle.id='detail-season-heading';seasonHeading.appendChild(seasonTitle);seasonRetry=button('Повторить','text-button',function(){updateAvailableSeasons(true);},'detail-seasons-retry');seasonRetry.hidden=true;seasonHeading.appendChild(seasonRetry);seasonSection.appendChild(seasonHeading);seasonSection.appendChild(element('p','detail-seasons-help','Выберите сезон — начнём с первой доступной серии.'));seasonResults=element('div');seasonSection.appendChild(seasonResults);wrap.appendChild(seasonSection);
      }
      function updateAvailableSeasons(force){
        var request=++seasonRequest;seasonResults.innerHTML='';var pending=WePlayLoading.create('Загружаем сезоны');pending.classList.add('inline-loading');seasonResults.appendChild(pending);seasonResults.setAttribute('aria-busy','true');seasonRetry.setAttribute('aria-disabled','true');
        WePlayCatalog.seasons(item,null,force).then(function(seasons){
          if(g!==generation||request!==seasonRequest||!seasonSection.isConnected)return;seasonResults.innerHTML='';
          if(!seasons.length)seasonResults.appendChild(element('p','detail-seasons-empty','Список сезонов пока недоступен. Начните просмотр кнопкой «Смотреть».'));
          else{var grid=element('div','detail-season-grid');grid.id='detail-season-grid';grid.setAttribute('data-focus-grid','4');grid.setAttribute('aria-label','Доступные сезоны');seasons.forEach(function(season){var label='Сезон '+season.number,b=button('','detail-season-card',function(){openPlayer(item,null,season.number);},'detail-season-'+season.number),copy=element('span','detail-season-copy');copy.appendChild(element('strong','',label));copy.appendChild(element('span','',WePlaySeasons.countLabel(season.count)));b.appendChild(copy);b.appendChild(icon('play',true));b.setAttribute('data-season',String(season.number));b.setAttribute('aria-label',label+', '+WePlaySeasons.countLabel(season.count)+(season.firstEpisode?', начать с серии '+season.firstEpisode:', начать просмотр'));grid.appendChild(b);});seasonResults.appendChild(grid);}
          if(document.activeElement===seasonRetry)focus(seasonResults.querySelector('.focusable')||watch);seasonRetry.hidden=true;
        }).catch(function(){if(g!==generation||request!==seasonRequest||!seasonSection.isConnected)return;seasonResults.innerHTML='';seasonResults.appendChild(element('p','detail-seasons-empty','Не удалось загрузить сезоны. Попробуйте ещё раз.'));seasonRetry.hidden=false;
        }).finally(function(){if(request===seasonRequest){seasonResults.removeAttribute('aria-busy');seasonRetry.removeAttribute('aria-disabled');}});
      }
      var about=element('section','detail-about'),heading=element('div','section-heading');heading.appendChild(element('h2','',serial?'О сериале':'О фильме'));heading.appendChild(button('К просмотру','text-button',returnToPlay,'detail-return'));about.appendChild(heading);
      var panels=element('div','detail-info-grid'),overview=element('section','info-panel about-overview');overview.appendChild(element('h3','',text(item.title)));
      var description=element('p','description',story||'Описание в этом каталоге пока не добавлено.');overview.appendChild(description);
      if(story.length>500){overview.classList.add('description-collapsed');var more=button('Читать полностью','text-button',function(){var expanded=overview.classList.toggle('description-expanded');more.textContent=expanded?'Свернуть':'Читать полностью';more.setAttribute('aria-expanded',String(expanded));},'description-more');more.setAttribute('aria-expanded','false');overview.appendChild(more);}
      panels.appendChild(overview);
      var ratingPanel=element('section','info-panel ratings-panel');ratingPanel.appendChild(element('h3','','Рейтинги'));var values=scores(item);
      values.forEach(function(s){var row=element('div','rating-stat rating-'+s.brand+(s.value>=7?' score-good':s.value<5?' score-low':' score-neutral')),value=element('div','rating-stat-value');value.appendChild(element('strong','',s.value.toFixed(1)));value.appendChild(element('span','','/ 10'));row.appendChild(value);row.appendChild(element('div','rating-stat-source',s.name));ratingPanel.appendChild(row);});
      if(!values.length)ratingPanel.appendChild(element('p','rating-empty','Пока нет оценок'));else ratingPanel.appendChild(element('p','rating-note','Оценки зрителей по данным каталога'));panels.appendChild(ratingPanel);
      var info=element('section','info-panel film-information');info.appendChild(element('h3','','Информация'));var facts=element('dl','film-facts');
      var durationLabel=element('dt','',serial?'Длительность серии':'Длительность'),durationValue=element('dd','','Уточняем…'),durationRequest=0;durationValue.id='detail-duration-value';facts.appendChild(durationLabel);facts.appendChild(durationValue);
      function paintDuration(runtime,pending){durationMeta.textContent=WePlayDuration.format(runtime,true);durationMeta.hidden=!runtime;durationLabel.textContent=runtime&&runtime.episode||!runtime&&serial?'Длительность серии':'Длительность';durationValue.textContent=pending?'Уточняем…':runtime?WePlayDuration.format(runtime,false):'Нет данных';}
      function updateDuration(preferred){var request=++durationRequest,initial=WePlayDuration.stated(item,preferred);paintDuration(initial,!initial);WePlayDuration.get(item,preferred).then(function(runtime){if(g!==generation||request!==durationRequest||!durationMeta.isConnected)return;paintDuration(runtime,false);});}
      if(serial){var seasonsValue=element('dd'),seriesStatusValue=element('dd');seasonsValue.id='detail-seasons-value';seriesStatusValue.id='detail-series-status-value';facts.appendChild(element('dt','','Количество сезонов'));facts.appendChild(seasonsValue);facts.appendChild(element('dt','','Статус'));facts.appendChild(seriesStatusValue);}
      function paintSeries(value,pending){var count=value&&value.seasons,state=WePlaySeries.label(value&&value.status);seasonsMeta.textContent=WePlaySeries.formatCount(count);seasonsMeta.hidden=!count;seriesStatusMeta.textContent=state;seriesStatusMeta.hidden=!state;seriesStatusMeta.setAttribute('aria-label','Статус сериала: '+state);seasonsValue.textContent=count?String(count):pending?'Уточняем…':'Нет данных';seriesStatusValue.textContent=state|| (pending?'Уточняем…':'Нет данных');}
      function updateSeries(){var stated=WePlaySeries.fromItem(item),initial=WePlaySeries.merge(stated,WePlayArtwork.cachedSeries(item));paintSeries(initial,true);WePlayArtwork.series(item).then(function(info){if(g!==generation||!seasonsMeta.isConnected)return;paintSeries(WePlaySeries.merge(stated,info),false);});}
      [['Год выхода','year'],['Страна','strana'],['Жанр','janre'],['Режиссёр','director'],['Озвучка','postproduction'],['Качество','quality']].forEach(function(spec){var value=spec[1]==='janre'?genres(item).join(', '):text(xf(item,spec[1]));if(value){facts.appendChild(element('dt','',spec[0]));facts.appendChild(element('dd','',value));}});if(!facts.children.length)info.appendChild(element('p','rating-empty','Данные появятся позже'));else info.appendChild(facts);panels.appendChild(info);about.appendChild(panels);
      var cast=text(xf(item,'rolax')),crew=element('section','cast-section');crew.appendChild(element('h2','','В ролях'));var people=element('div','cast-list');crew.appendChild(people);about.appendChild(crew);
      function fillCast(records){people.innerHTML='';var oldCredit=crew.querySelector('.cast-credit');if(oldCredit)oldCredit.remove();var mazeActor=records.filter(function(actor){return actor.source==='TVmaze';})[0];if(mazeActor&&/^https:\/\/www\.tvmaze\.com\/(?:shows|people)\/\d+$/.test(mazeActor.sourceURL||'')){var photoCredit=element('a','cast-credit','Фото: TVmaze');photoCredit.href=mazeActor.sourceURL;photoCredit.tabIndex=-1;crew.appendChild(photoCredit);}crew.hidden=!records.length;records.slice(0,12).forEach(function(actor){var person=element('div','cast-person'),avatar=element('div','cast-initials cast-avatar',actor.name.split(/\s+/).slice(0,2).map(function(part){return part[0];}).join(''));avatar.setAttribute('aria-hidden','true');if(actor.id)person.setAttribute('data-person-id',actor.id);person.appendChild(avatar);person.appendChild(element('p','',actor.name));people.appendChild(person);if(actor.image){var photo=element('img');photo.alt='';avatar.appendChild(photo);WePlayArtwork.profile(photo,actor);}});}
      var initialCast=WePlayArtwork.cachedCast(item);fillCast(initialCast.length?initialCast:cast.split(/,|;/).map(function(name){return{name:name.trim()};}).filter(function(actor){return actor.name;}));
      WePlayArtwork.resolve(item,{actors:true}).then(function(media){if(g===generation&&crew.isConnected&&media.actors.length&&media.actors!==initialCast)fillCast(media.actors);});
      var credits=element('section','metadata-attribution');credits.setAttribute('aria-label','Источники данных');var tmdbLogo=element('img');tmdbLogo.src=localAsset('assets/tmdb.svg');tmdbLogo.alt='TMDB';credits.appendChild(tmdbLogo);credits.appendChild(element('p','','Изображения и данные: TMDB. Дополнительные изображения сериалов: TVmaze.'));credits.appendChild(element('p','','This product uses the TMDB API but is not endorsed or certified by TMDB.'));about.appendChild(credits);
      var bottom=detailIconButton('К просмотру','arrow-left','secondary detail-return-bottom',returnToPlay,'detail-return-bottom');about.appendChild(bottom);wrap.appendChild(about);content.appendChild(wrap);detailProgressUpdate();updateDuration(null);if(serial){updateSeries();updateAvailableSeasons();}diagnostic('detailReady',item.id);
    }).catch(function(e){if(g===generation){loading.remove();errorBox(e.message,function(){navigate(current);});}});
  }
  function showPlayerTools() {
    toolbar.hidden=false;hint.hidden=false;clearTimeout(hideTimer);
  }
  function openPlayer(item,preferred,season,restart) {
    if(playerFetchAbort)playerFetchAbort.abort();playerFetchAbort=null;playingItem=item;playingChoice=preferred||null;playingSeason=WePlaySeasons.number(season);
    exitDialog.hidden=true;overlay.removeAttribute('aria-hidden');exitResume=false;exitFocus=null;
    if(window.WePlayNativePlayer)WePlayNativePlayer.close();
    playingRestart=!!restart;var progress=WePlayProgress.get(item),resume=!playingSeason&&!restart&&WePlayProgress.canResume(progress)?progress:null,resetOnStart=!!restart;
    var id=++playerGeneration;activeSource=2;
    if(overlay.hidden)savedFocus=document.activeElement;
    document.body.classList.add('playback-open');stage.scrollTop=0;stage.scrollLeft=0;
    overlay.hidden=false;overlay.classList.add('player-resolving');surface.innerHTML='';
    document.getElementById('player-title').textContent=text(item.title);status.textContent='Загружаем видео…';document.getElementById('player-retry').hidden=true;hint.textContent='Подождите немного · Назад — вернуться к фильму';
    document.getElementById('player-back').focus();showPlayerTools();
    WePlayCatalog.player(item,playingChoice,playingSeason,resume).then(function(resolved){
      if(id!==playerGeneration)return;diagnostic('playerSource',resolved.source);overlay.classList.remove('player-resolving');
      WePlayNativePlayer.start(resolved.payload,{surface:surface,status:status,hint:hint,log:diagnostic,title:text(item.title),mediaItem:item,mediaKind:WePlayCatalogUnion.kind(item),nextMedia:function(signal){return WePlayNextMedia.resolve(item,{signal:signal});},onNextMedia:function(next){if(id!==playerGeneration)return;closePlayer();push({kind:'detail',id:next.id,play:true});},onExit:requestExit,transport:resolved.transport,resolveEpisode:resolved.resolveEpisode,startSeason:playingSeason,resume:resume,onStarted:function(){if(resetOnStart){WePlayProgress.reset(item);resetOnStart=false;}},onProgress:function(sample){sample.sourceId=resolved.versionId;WePlayProgress.update(item,sample);}});toolbar.hidden=true;
      if(!exitDialog.hidden)exitResume=WePlayNativePlayer.suspendForExit();
    }).catch(function(e){if(id===playerGeneration){overlay.classList.remove('player-resolving');status.textContent=e.name==='AbortError'?'Видео не ответило вовремя. Попробуйте ещё раз.':resume?'Не удалось продолжить просмотр. Попробуйте ещё раз или выберите «Сначала».':playingSeason?'Не удалось запустить выбранный сезон. Попробуйте ещё раз.':'Не удалось загрузить видео. Попробуйте ещё раз или вернитесь к фильму.';document.getElementById('player-retry').hidden=false;hint.textContent='OK — нажать выбранную кнопку · Назад — вернуться к фильму';showPlayerTools();if(exitDialog.hidden)document.getElementById('player-retry').focus();diagnostic('playerFetchError',e.message);}});
  }
  function requestExit(){
    if(overlay.hidden||!exitDialog.hidden)return;
    exitFocus=document.activeElement;exitResume=!!(window.WePlayNativePlayer&&WePlayNativePlayer.active&&WePlayNativePlayer.suspendForExit());
    overlay.setAttribute('aria-hidden','true');exitDialog.hidden=false;exitContinue.focus();diagnostic('exitConfirmation');
  }
  function cancelExit(){
    if(exitDialog.hidden)return;exitDialog.hidden=true;overlay.removeAttribute('aria-hidden');
    if(window.WePlayNativePlayer&&WePlayNativePlayer.active)WePlayNativePlayer.restoreAfterExit(exitResume);
    var previous=exitFocus;exitFocus=null;exitResume=false;
    if(previous&&previous.isConnected&&previous.offsetWidth&&previous.offsetHeight&&!previous.disabled)previous.focus();else overlay.focus();diagnostic('exitCancelled');
  }
  // Count from the end of a synchronous redraw: queued Samsung Back events belong to the same press.
  function handleBack(){var now=Date.now();if(now-lastBackAt<220)return;lastBackAt=now;try{back();}finally{lastBackAt=Date.now();}}
  function exitKey(e,k){
    if(k===10009||k===27){if(!e.repeat)handleBack();}
    else if(k===37||k===38)exitContinue.focus();
    else if(k===39||k===40)exitLeave.focus();
    else if(k===9)(document.activeElement===exitContinue?exitLeave:exitContinue).focus();
    else if(k===13&&!e.repeat){if(document.activeElement===exitLeave)closePlayer();else cancelExit();}
    if([9,13,27,32,37,38,39,40,10009,413,412,417,415,19,10252,457,403].indexOf(k)>=0)e.preventDefault();
  }
  function closePlayer() {
    document.body.classList.remove('playback-open');
    exitDialog.hidden=true;overlay.removeAttribute('aria-hidden');exitResume=false;exitFocus=null;
    if(playerFetchAbort)playerFetchAbort.abort();playerFetchAbort=null;playingItem=null;playingChoice=null;playingSeason=null;
    if(window.WePlayNativePlayer)WePlayNativePlayer.close();
    if(detailProgressUpdate)detailProgressUpdate();
    ++playerGeneration;surface.innerHTML='';activeSource=0;overlay.hidden=true;overlay.classList.remove('player-resolving');clearTimeout(hideTimer);focus(savedFocus&&savedFocus.isConnected&&!savedFocus.hidden?savedFocus:document.getElementById('watch'));diagnostic('playerClosed');
  }
  var playerBack=document.getElementById('player-back');playerBack.appendChild(icon('arrow-left'));playerBack.onclick=requestExit;
  document.getElementById('player-retry').onclick=function(){if(playingItem)openPlayer(playingItem,playingChoice,playingSeason,playingRestart);};
  exitContinue.onclick=cancelExit;exitLeave.onclick=closePlayer;
  function setSidebar(open){sidebar.classList.toggle('expanded',open);stage.classList.toggle('sidebar-open',open);var trigger=document.getElementById('home-menu');if(trigger){trigger.setAttribute('aria-expanded',String(open));trigger.setAttribute('aria-controls','sidebar');}}
  function leaveSidebar(){setSidebar(false);focus(lastContentFocus&&lastContentFocus.isConnected?lastContentFocus:content.querySelector('.focusable')||viewport);}
  function openSidebar(){setSidebar(true);focus(nav.querySelector('.current')||nav.firstElementChild);}
  document.getElementById('sidebar-scrim').onclick=leaveSidebar;
  function updateSidebarClock(){var date=new Date();document.getElementById('sidebar-clock').textContent=String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');}
  updateSidebarClock();setInterval(updateSidebarClock,60000);
  document.addEventListener('focusin',function(e){
    if(!exitDialog.hidden&&!exitDialog.contains(e.target)){exitContinue.focus();return;}
    if(sidebar.contains(e.target))setSidebar(true);
    else {setSidebar(false);if(content.contains(e.target))lastContentFocus=e.target;}
    WePlayFocus.remember(e.target);
  });
  function railFocus(section){
    if(!section)return false;var rail=section.querySelector('.home-rail'),list=WePlayFocus.items(rail);
    focus(list[Math.min(list.length-1,rail._focusIndex||0)]);return true;
  }
  function contentKey(k){
    var active=document.activeElement,rail=active.closest&&active.closest('.home-rail'),section=active.closest&&active.closest('.home-section');
    if(active.closest&&active.closest('.release-tabs')&&k>=37&&k<=40){var choices=Array.prototype.slice.call(active.closest('.release-tabs').querySelectorAll('button')),at=choices.indexOf(active);if(k===37&&at===0){openSidebar();return true;}if(k===37||k===39)focus(choices[Math.max(0,Math.min(choices.length-1,at+(k===37?-1:1)))]);else if(k===40)focus(content.querySelector('.grid .movie-card')||document.getElementById('filter-janre')||document.getElementById('load-more'));else focus(document.getElementById('support-open'));return true;}
    if(current.kind==='detail'&&k>=37&&k<=40){var support=document.getElementById('support-open'),watch=document.getElementById('watch');
      if(k===38&&active.id==='watch'){focus(document.getElementById('detail-back'));return true;}
      var seasonGrid=document.getElementById('detail-season-grid'),seasonButtons=seasonGrid&&WePlayFocus.items(seasonGrid),seasonTarget=seasonButtons&&seasonButtons[Math.min(seasonButtons.length-1,seasonGrid._focusIndex||0)]||document.getElementById('detail-seasons-retry');if(seasonTarget&&(!seasonTarget.offsetWidth||seasonTarget.hidden))seasonTarget=null;
      if(k===40&&active.closest('.detail-content .actions')&&seasonTarget){focus(seasonTarget);return true;}
      if(active.closest('.detail-season-grid')){var seasonEdge=WePlayFocus.move(k);if(seasonEdge==='up')focus(watch&&!watch.disabled?watch:document.getElementById('detail-back'));else if(seasonEdge==='down')focus(document.getElementById('detail-return'));else if(seasonEdge==='left')openSidebar();return true;}
      if(active.id==='detail-seasons-retry'&&(k===38||k===40)){focus(k===38?(watch&&!watch.disabled?watch:document.getElementById('detail-back')):document.getElementById('detail-return'));return true;}
      if(k===38&&active.id==='detail-return'&&seasonTarget){focus(seasonTarget);return true;}
      if(active.id==='support-open'){if(k===37)focus(document.getElementById('detail-back'));else if(k===40)focus(watch&&!watch.disabled?watch:document.getElementById('detail-back'));return true;}
      if(active.id==='detail-back'&&k===39){focus(support);return true;}
      if(k===38&&active.closest('.detail-content .actions')){focus(document.getElementById('detail-back'));return true;}
      if(k===39&&active.id==='detail-more'){focus(support);return true;}
    }
    if(k===33||k===34||k===427||k===428){
      var direction=k===33||k===427?-1:1;
      if(WePlayFocus.page(direction))return true;
      if(active.id==='load-more'&&direction<0){var grid=content.querySelector('.grid'),list=grid&&WePlayFocus.items(grid);if(list&&list.length)focus(list[Math.min(list.length-1,grid._focusIndex||list.length-1)]);}
      else{viewport.scrollTop+=direction*(viewport.clientHeight-96);var visible=Array.prototype.filter.call(content.querySelectorAll('.focusable:not(:disabled)'),function(e){var r=e.getBoundingClientRect(),v=viewport.getBoundingClientRect();return e.offsetWidth&&e.offsetHeight&&r.top>=v.top&&r.bottom<=v.bottom;});focus(visible[direction>0?0:visible.length-1]);}return true;
    }
    if(k<37||k>40)return false;
    if(active.tagName==='INPUT'&&k===40){focus(content.querySelector('.movie-card')||content.querySelector('.search-form button'));return true;}
    if(rail&&(k===38||k===40)){
      var sections=Array.prototype.slice.call(content.querySelectorAll('.home-section')),at=sections.indexOf(section);
      if(!railFocus(sections[at+(k===38?-1:1)])&&k===38)focus(document.getElementById('featured-open')||document.getElementById('home-menu'));
      return true;
    }
    if(section&&!rail&&(k===38||k===40)){
      if(k===40)railFocus(section);else{var prev=section.previousElementSibling;if(prev&&prev.classList.contains('home-section'))railFocus(prev);else focus(document.getElementById('featured-open'));}return true;
    }
    var edge=WePlayFocus.move(k);
    if(edge==='moved')return true;
    if(edge==='left'){openSidebar();return true;}
    if(edge==='right')return true;
    if(edge==='down'){
      var more=document.getElementById('load-more');if(more){focus(more);return true;}
      viewport.scrollTop=viewport.scrollHeight;return true;
    }
    if(active.id==='load-more'&&k===38){var grid=content.querySelector('.grid'),list=grid&&WePlayFocus.items(grid);if(list&&list.length){focus(list[Math.min(list.length-1,grid._focusIndex===undefined?list.length-1:grid._focusIndex)]);return true;}}
    var group=active.closest&&active.closest('.actions,.featured-pager,.home-topbar,.rail-controls,.search-form,.filters,.load-more,.library-toolbar,.query-list,.detail-topbar,.header-tools');
    if(group&&(k===37||k===39)){
      var list=Array.prototype.filter.call(group.querySelectorAll('.focusable:not(:disabled)'),function(e){return e.offsetWidth&&e.offsetHeight;}),at=list.indexOf(active),next=list[at+(k===37?-1:1)];
      if(next){focus(next);return true;}
      if(k===37){openSidebar();return true;}
      if(group.classList.contains('actions')&&current.kind==='home'){focus(document.getElementById('featured-prev'));return true;}
      return true;
    }
    if(k===40&&active.closest&&active.closest('.featured'))return railFocus(content.querySelector('.home-section'));
    return false;
  }
  function spatial(key,root) {
    var a=document.activeElement, rect=a&&a.getBoundingClientRect(), candidates=Array.prototype.slice.call(root.querySelectorAll('.focusable:not(:disabled)')).filter(function(e){return e.offsetWidth&&e.offsetHeight&&((key!==38&&key!==40)||!nav.contains(e));});
    if(!rect||!root.contains(a)){focus(candidates[0]);return;}
    var cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,best=null,score=Infinity;
    candidates.forEach(function(e){if(e===a)return;var r=e.getBoundingClientRect(),dx=r.left+r.width/2-cx,dy=r.top+r.height/2-cy;
      if((key===37&&dx>=-8)||(key===39&&dx<=8)||(key===38&&dy>=-8)||(key===40&&dy<=8))return;
      var main=(key===37||key===39)?Math.abs(dx):Math.abs(dy),cross=(key===37||key===39)?Math.abs(dy):Math.abs(dx);
      var overlap=key===37||key===39?Math.min(rect.bottom,r.bottom)-Math.max(rect.top,r.top):Math.min(rect.right,r.right)-Math.max(rect.left,r.left);
      var s=main+cross*3+(overlap>0?0:10000);if(s<score){score=s;best=e;}
    });if(best)focus(nav.contains(best)?nav.querySelector('.current')||nav.firstElementChild:best);
  }
  document.addEventListener('keydown',function(e){
    var k=e.keyCode||e.which;
    if(WePlaySupport.key(e,k))return;
    if(!exitDialog.hidden){exitKey(e,k);return;}
    if(!overlay.hidden){
      if(k===10009||k===27){e.preventDefault();if(!e.repeat)handleBack();return;}
      if(k===413){e.preventDefault();if(!e.repeat)requestExit();return;}
      if(k===13&&e.repeat){e.preventDefault();return;}
      if(window.WePlayNativePlayer&&WePlayNativePlayer.active&&WePlayNativePlayer.key(k,e.shiftKey,e.repeat)){e.preventDefault();return;}
      if(k===9){e.preventDefault();var fallback=Array.prototype.slice.call(toolbar.querySelectorAll('button')).filter(function(b){return !b.hidden&&!b.disabled;}),at=fallback.indexOf(document.activeElement);if(fallback.length)fallback[(at+(e.shiftKey?-1:1)+fallback.length)%fallback.length].focus();return;}
      if(k>=37&&k<=40){e.preventDefault();spatial(k,toolbar);return;}
      if(k===13&&document.activeElement.tagName==='BUTTON'){e.preventDefault();document.activeElement.click();return;}
      return;
    }
    if(searchEditor&&searchEditor.key(e,k))return;
    var active=document.activeElement,tag=active&&active.tagName;
    var featuredTarget=k===37&&active.id==='featured-prev'?'featured-info':k===39&&active.id==='featured-info'?'featured-prev':k===37&&active.id==='featured-open'?'nav-0':null;
    if(featuredTarget){e.preventDefault();if(featuredTarget==='nav-0')openSidebar();else focus(document.getElementById(featuredTarget));return;}
    if(nav.contains(active)){
      if(k===39||k===27||k===10009){e.preventDefault();if(k!==39)lastBackAt=Date.now();leaveSidebar();return;}
      if(k===37){e.preventDefault();return;}
      if(k===38||k===40){e.preventDefault();var next=k===38?active.previousElementSibling:active.nextElementSibling;if(next)focus(next);return;}
    }
    if(tag==='INPUT'&&[27,10009,38,40,33,34,427,428].indexOf(k)<0)return;
    if(tag==='SELECT'&&selectEditing){
      if(k===27||k===10009){selectEditing=false;lastBackAt=Date.now();e.preventDefault();return;}
      if(k===13)selectEditing=false;
      return;
    }
    if(tag==='SELECT'&&k===13){selectEditing=true;return;}
    if(k===10009||k===27){e.preventDefault();if(!e.repeat)handleBack();return;}
    if(contentKey(k)){e.preventDefault();return;}
    if(k>=37&&k<=40){e.preventDefault();spatial(k,content);}
    else if(k===13&&active&&active.tagName==='BUTTON'){e.preventDefault();if(!e.repeat)active.click();}
  },true);
  document.addEventListener('mousedown',function(e){selectEditing=e.target.tagName==='SELECT';});
  document.addEventListener('tizenhwkey',function(e){if(e.keyName==='back'){e.preventDefault();handleBack();}});
  try { ['MediaPlayPause','MediaPlay','MediaPause','MediaStop','MediaRewind','MediaFastForward','Info','ColorF0Red','ChannelUp','ChannelDown','1','2','3'].forEach(function(key){try{tizen.tvinputdevice.registerKey(key);}catch(ignore){}}); } catch(ignore){}
  navigate(current);diagnostic('boot',navigator.userAgent);
  if(window.WePlayRuntime)WePlayRuntime.ready();
}());

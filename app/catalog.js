/* Public catalog pages are parsed as data. Website scripts are never executed. */
(function(){
  'use strict';
  var sources=[{id:'primary',name:'lord.kim',base:'https://lord.kim/'},{id:'sb',name:'sb.lordfilm5.pro',base:'https://sb.lordfilm5.pro/'},{id:'pub',name:'lordfilms.pub',base:'https://lordfilms.pub/'},
    {id:'lat',name:'lordfilm26-kino11.lat',base:'https://lordfilm26-kino11.lat/',layout:'media'},
    {id:'vc',name:'lordfilm.vc',base:'https://lordfilm.vc/',layout:'re'},
    {id:'st',name:'lordfilm.st',base:'https://lordfilm.st/',pending:true,note:'Сайт ограничивает автоматическое подключение'}];
  var union=window.WePlayCatalogUnion,feeds={},categoryGroups={};
  var playerPending={},kindPending={},seasonPending={},seasonCache={};
  var mode='auto',active=null,selecting=null,epoch=0,offline=false,index={},paths={},memory={},pending={},stored={},health={},checked={};
  var STORE='lord.catalog-cache.v1',MODE='lord.catalog-mode.v1',LAST='lord.catalog-last.v1';
  try{var disk=JSON.parse(localStorage.getItem(STORE)||'{}');stored=disk.entries||{};}catch(ignore){}
  // Catalogs and playback always share all available sources, including after an upgrade.
  try{localStorage.setItem(MODE,'auto');localStorage.setItem('lord.catalog-union.v1','1');}catch(ignore){}
  function source(id){return sources.filter(function(s){return s.id===id;})[0];}
  function ready(s){return s&&!s.pending;}
  function validId(id){return /^\d+$/.test(String(id))&&Number(id)>0||sources.some(function(s){return s.id!=='primary'&&new RegExp('^'+s.id+'-\\d+$').test(String(id));});}
  function notify(){window.dispatchEvent(new Event('catalogchange'));}
  function text(node){return node?(node.getAttribute&&node.getAttribute('content')||node.textContent||'').replace(/\s+/g,' ').trim():'';}
  function get(root,selector){return text(root.querySelector(selector));}
  function list(root,selector){return Array.prototype.slice.call(root.querySelectorAll(selector));}
  function url(raw,base){try{var u=new URL(raw,base);return /^https?:$/.test(u.protocol)?u.href:'';}catch(ignore){return '';}}
  function catalogImage(node,base){if(!node)return'';var found='';['data-src','data-original','data-lazy-src','src','content'].some(function(key){var raw=node.getAttribute(key);if(!raw||/^(?:data|blob):/i.test(raw)||/(?:no[-_]?(?:image|poster|photo)|placeholder|spacer|blank|loading)[^/]*\.(?:gif|png|jpg|webp)/i.test(raw))return false;found=url(raw,base);return !!found;});return found;}
  function pageURL(raw,s){var u=url(raw,s.base);return u&&new URL(u).hostname===new URL(s.base).hostname?u:'';}
  function remember(item){if(item&&item.id){if(item._categoryAlternatives){categoryGroups[String(item.id)]=item._categoryAlternatives;item._categoryAlternatives.forEach(remember);}if(item._alternatives)item._alternatives.forEach(remember);else index[String(item.id)]=item;if(item._categoryURL)paths[String(item.id)]=item._categoryURL;if(item.title)union.combine([item]);}}
  function register(j){var d=j&&j.data;if(Array.isArray(d))d.forEach(remember);else if(d&&Array.isArray(d.items))d.items.forEach(remember);else if(d&&d.id)remember(d);return j;}
  Object.keys(stored).forEach(function(k){register(stored[k].data);});
  function key(params){return Object.keys(params).sort().filter(function(k){return params[k]!==undefined&&params[k]!==null;}).map(function(k){return k+'='+String(params[k]);}).join('&');}
  function persist(k,data){
    stored[k]={at:Date.now(),data:data};var keys=Object.keys(stored).sort(function(a,b){return stored[a].at-stored[b].at;});
    function evict(){var at=keys.findIndex(function(key){return key.indexOf('all|')!==0||key.indexOf('limit=18')<0||key.indexOf('page=1')<0;});delete stored[keys.splice(at<0?0:at,1)[0]];}
    while(keys.length>24)evict();
    try{var value=JSON.stringify({entries:stored});while(value.length>400000&&keys.length>1){evict();value=JSON.stringify({entries:stored});}localStorage.setItem(STORE,value);}catch(ignore){}
  }
  function fetchData(raw,json,credentials,timeout){
    var cacheKey=(json?'json:':'html:')+raw,cached=memory[cacheKey];
    if(cached&&Date.now()-cached.at<60000)return Promise.resolve(cached.data);
    if(pending[cacheKey])return pending[cacheKey];
    var abort=new AbortController(),timer=setTimeout(function(){abort.abort();},timeout||12000);
    pending[cacheKey]=fetch(raw,{signal:abort.signal,credentials:credentials||'omit'}).then(function(r){if(!r.ok)throw new Error('Сайт ответил: '+r.status);return json?r.json():r.text();}).then(function(data){memory[cacheKey]={at:Date.now(),data:data};return data;}).catch(function(e){throw new Error(e.name==='AbortError'?'Сайт не ответил вовремя.':'Не удалось подключиться к источнику.');}).finally(function(){clearTimeout(timer);delete pending[cacheKey];});
    return pending[cacheKey];
  }
  function searchFetch(raw,json,credentials,options){
    var signal=options.signal,remaining=options.deadline-Date.now();if(signal&&signal.aborted)return Promise.reject(Object.assign(new Error('Поиск отменён'),{name:'AbortError'}));if(remaining<=0)return Promise.reject(new Error('Источник не ответил вовремя.'));
    var abort=new AbortController(),timedOut=false,timer=setTimeout(function(){timedOut=true;abort.abort();},Math.min(remaining,3000));function cancel(){abort.abort();}if(signal)signal.addEventListener('abort',cancel);
    return fetch(raw,{signal:abort.signal,credentials:credentials||'omit'}).then(function(r){if(!r.ok)throw new Error('Источник ответил с ошибкой.');return json?r.json():r.text();}).catch(function(){if(signal&&signal.aborted)throw Object.assign(new Error('Поиск отменён'),{name:'AbortError'});throw new Error(timedOut?'Источник не ответил вовремя.':'Не удалось подключиться к источнику.');}).finally(function(){clearTimeout(timer);if(signal)signal.removeEventListener('abort',cancel);});
  }
  function documentAt(raw,s,timeout,options){return (options?searchFetch(raw,false,'include',options):fetchData(raw,false,'include',timeout||8000)).then(function(html){if(s.layout==='media'&&/^\/\d+\/?$/.test(new URL(raw).pathname))delete memory['html:'+raw];return new DOMParser().parseFromString(html,'text/html');});}
  function webHelpers(options){var stamp=epoch;return{documentAt:function(raw,s,timeout){return documentAt(raw,s,timeout,options);},get:get,list:list,text:text,url:url,imageURL:catalogImage,pageURL:pageURL,remember:remember,search:!!options,current:function(){return stamp===epoch&&!(options&&options.signal&&options.signal.aborted);},lookup:function(id){return index[String(id)];}};}
  function original(params,options){
    var q=Object.keys(params).filter(function(k){return params[k]!==undefined&&params[k]!==null;}).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);});q.push('token='+encodeURIComponent(WEPLAY_SETTINGS.apiToken));
    var raw=sources[0].base+'api.php?'+q.join('&');return (options?searchFetch(raw,true,'omit',options):fetchData(raw,true,'omit',8000)).then(function(j){if(!j||j.success===false||!j.data)throw new Error('Основной каталог недоступен.');return j;});
  }
  function card(node,s){
    var a=node.querySelector(s.id==='sb'?'a.th-in[href]':'a.item__title[href]');if(!a)return null;
    var href=pageURL(a.getAttribute('href'),s),m=href&&new URL(href).pathname.match(/\/(\d+)-[^/]+\.html$/);if(!m)return null;
    var img=node.querySelector('img'),year=get(node,s.id==='sb'?'.th-series':'.item__year').match(/(?:19|20)\d{2}/),title=get(node,s.id==='sb'?'.th-title':'.item__title');if(!title)title=img&&img.getAttribute('alt')||'';
    if(!year&&s.layout==='re')year=new URL(href).pathname.match(/(?:19|20)\d{2}(?=\.html$)/);
    var item={id:s.id+'-'+m[1],title:title,_source:s.id,_url:href,xfields:{image:catalogImage(img,s.base),year:year?year[0]:'',kp_rating:get(node,s.id==='sb'?'.th-rate-kp span':'.item__rates-item.kp'),imdb_rating:get(node,s.id==='sb'?'.th-rate-imdb span':'.item__rates-item.imdb')}};
    if(/сезон|серия|серии/i.test(s.id==='sb'?get(node,'.th-series'):get(node,'.item__series')+' '+get(node,'.item__year')))item._kind='series';return item;
  }
  function cards(doc,s,popular){
    var root=s.layout==='re'&&popular?doc.querySelector('#top-carou')||doc:s.id==='sb'||s.layout==='re'?doc.querySelector('#dle-content')||doc:doc.querySelector('#grid-items')||doc;
    var nodes=list(root,s.id==='sb'?'.th-item':'.item.expand-link'),seen={},items=[];
    nodes.forEach(function(n){var item=card(n,s);if(item&&!seen[item.id]){seen[item.id]=true;items.push(item);}});return items;
  }
  function categoryPath(s,category){
    if(paths[String(category)])return paths[String(category)];
    if(s.layout==='media')return{219:'/',106:'/films/',13:'/serialy/',109:'/multfilmy/',36:'/multserialy/',38:'/'}[category]||'/films/';
    if(s.layout==='re')return{219:'/',106:'/films/',13:'/serials/',109:'/multfilmy/',36:'/multserialy/',38:'/'}[category]||'/films/';
    var map=s.id==='sb'?{219:'/top50/',106:'/filmy/',13:'/serialy/',109:'/mult/',36:'/mult/',38:'/podborki/'}:{219:'/top-100.html',106:'/filmy/',13:'/zarubezhnye-serialy/',109:'/multfilmy/',36:'/multfilmy/',38:'/'};
    return map[category]||'/';
  }
  function listing(s,params,options){
    var page=Number(params.page)||1,path=categoryPath(s,params.category),target;
    if(params.search){var q=new URLSearchParams({do:'search',subaction:'search',story:String(params.search)});if(page>1){q.set('search_start',String(page));if(s.id==='sb')q.set('result_from',String((page-1)*30+1));}target=s.base+'index.php?'+q.toString();}
    else{target=url(path,s.base);if(page>1){if(/\.html$/.test(target))throw new Error('Все фильмы этой подборки уже загружены.');target=target.replace(/\/$/,'')+'/page/'+page+'/';}}
    return documentAt(target,s,null,options).then(function(doc){
      var rows=s.layout==='media'?WePlayWebCatalog.listing(doc,s,params,webHelpers(options)):Promise.resolve(cards(doc,s,Number(params.category)===219&&!params.search));return rows.then(function(items){var pages=page;
      if(params.search)list(doc,'[onclick],a[href]').forEach(function(a){var action=a.getAttribute('onclick')||'',href=a.getAttribute('href')||'',m=action.match(/\blist_submit\(\s*(\d+)\s*\)/)||href.match(/[?&]search_start=(\d+)/);if(m)pages=Math.max(pages,Number(m[1]));});
      else if(!((s.layout==='media'||s.layout==='re')&&Number(params.category)===219))list(doc,'a[href]').forEach(function(a){var m=(a.getAttribute('href')||'').match(/\/page\/(\d+)\//);if(m)pages=Math.max(pages,Number(m[1]));});
      var empty=/поиск по сайту не дал|ничего не найдено|не найдено|по вашему запросу/i.test(text(doc.body));
      if(!items.length&&!empty)throw new Error('Не удалось прочитать раздел сайта.');
      if((s.layout==='media'||s.layout==='re')&&!params.search){var expected=Number(params.category)===106||Number(params.category)===109?'movie':Number(params.category)===13||Number(params.category)===36?'series':null;if(expected)items=items.filter(function(item){return !union.kind(item)||union.kind(item)===expected;}).map(function(item){item._kindHint=expected;return item;});}
      items.forEach(function(item){if(Number(params.category)===13||Number(params.category)===36)item._kindHint='series';else if(Number(params.category)===106)item._kindHint='movie';});
      return {success:true,data:{items:items,pagination:{page:page,pages:pages,total:null},partial:!!items._partial}};});
    });
  }
  function fact(doc,label){var value='';list(doc,'.flist li,.lfs-fact,.page__list li').some(function(row){var first=row.firstElementChild;if(first&&text(first).toLowerCase().indexOf(label.toLowerCase())===0){value=text(row).slice(text(first).length).replace(/^\s*:\s*/,'').trim();return true;}return false;});return value;}
  function detail(s,id,options){
    var known=index[String(id)];if(!known||!known._url)throw new Error('Откройте фильм из каталога или поиска заново.');
    if(s.layout==='media')return WePlayWebCatalog.detail(known,s,webHelpers(options)).then(function(item){remember(item);return{success:true,data:item};});
    return documentAt(known._url,s,null,options).then(function(doc){
      var item={id:id,title:known.title,_source:s.id,_url:known._url,_kind:known._kind,_detail:true,xfields:Object.assign({},known.xfields)},x=item.xfields;
      var titleNode=doc.querySelector('h1');if(titleNode){var title=titleNode.cloneNode(true);list(title,'small').forEach(function(n){n.remove();});item.title=text(title).replace(/\s*\((?:фильм\s*)?\d{4}\).*$/i,'').replace(/\s+смотреть онлайн.*$/i,'').trim();}
      if(s.layout==='re')item.title=WePlayWebCatalog.cleanTitle(item.title);
      item.full_story=get(doc,s.id==='sb'?'.fdesc [itemprop="description"],.fdesc':'.lfs-intro__text,.page__text .full-text');
      var image=doc.querySelector(s.id==='sb'?'.fposter img':'.lfs-poster img,.page__poster img');x.image=catalogImage(image,s.base)||x.image;
      x.year=fact(doc,'Год')||x.year;x.strana=fact(doc,'Страна');x.janre=s.id==='sb'?get(doc,'[itemprop="genre"]'):fact(doc,'Жанр');x.original_title=WePlayWebCatalog.originalTitle(doc,item.title,x.year)||x.original_title||'';
      x.quality=fact(doc,'Качество');x.director=get(doc,'[itemprop="director"]')||fact(doc,'Режиссёр');x.rolax=get(doc,'[itemprop="actors"]')||fact(doc,'В ролях');x.postproduction=fact(doc,'Перевод');
      var runtime=doc.querySelector('[itemprop="duration"]');x.duration=runtime&&(runtime.getAttribute('content')||runtime.getAttribute('datetime')||text(runtime))||fact(doc,'Продолжительность')||fact(doc,'Длительность')||fact(doc,'Время')||x.duration||'';
      x.season_count=fact(doc,'Количество сезонов')||fact(doc,'Сезонов')||x.season_count||'';x.series_status=fact(doc,'Статус сериала')||fact(doc,'Статус')||x.series_status||'';
      if(s.layout==='re'){x.kp_rating=get(doc,'.page__list-rates-item.kp')||x.kp_rating;x.imdb_rating=get(doc,'.page__list-rates-item.imdb')||x.imdb_rating;x.director=x.director||fact(doc,'Режиссер');x.postproduction=x.postproduction||fact(doc,'Доступные озвучки');}
      if(s.id==='sb'){
        x.kp_rating=get(doc,'.frate-kp span')||x.kp_rating;x.imdb_rating=get(doc,'.frate-imdb span')||x.imdb_rating;
        var iframe=list(doc,'.fplayer iframe[src],iframe[src]').filter(function(e){return /\/embed\/(?:movie|series)\//.test(e.getAttribute('src')||'')&&!/youtube/.test(e.getAttribute('src'));})[0];
        x.film=iframe?url(iframe.getAttribute('src'),s.base):'';
      }else{
        var player=doc.querySelector('video-player[data-title-id][data-publisher-id]');
        if(player){item._video={titleId:player.getAttribute('data-title-id'),publisher:player.getAttribute('data-publisher-id'),aggregator:player.getAttribute('data-aggregator')||'kp'};x.film='https://plapi.cdnvideohub.com/api/v1/player/sv/playlist';}
        else {var frame=list(doc,'iframe[src]').filter(function(e){return /\/embed\/(?:movie|series)\//.test(e.getAttribute('src')||'');})[0];x.film=frame?url(frame.getAttribute('src'),s.base):'';}
      }
      var kp=doc.querySelector('a[href*="kinopoisk.ru/film/"],a[href*="kinopoisk.ru/series/"]'),imdb=doc.querySelector('a[href*="imdb.com/title/tt"]');if(kp)x.kinopoisk_url=kp.getAttribute('href');if(imdb)x.imdb_url=imdb.getAttribute('href');remember(item);return {success:true,data:item};
    });
  }
  function collections(s){
    if(s.layout==='media')return Promise.resolve({success:true,data:[]});
    return documentAt(url(s.id==='sb'?'/podborki/':'/',s.base),s).then(function(doc){var seen={},items=[];
      list(doc,'a[href]').forEach(function(a){var href=pageURL(a.getAttribute('href'),s),label=text(a);if(!href||label.length<3)return;
        var path=new URL(href).pathname,include=s.id==='sb'?/^\/podborki\/[^/]+\/$/.test(path):s.layout==='re'?/^\/(?:genres\/[^/]+|filmy-marvel|serialy-netflix)\/$/.test(path):/^\/(?:filmy|zarubezhnye-serialy)\/[^/]+\/$/.test(path);
        if(!include||seen[path])return;seen[path]=true;var hash=0;for(var i=0;i<path.length;i++)hash=((hash<<5)-hash+path.charCodeAt(i))|0;
        var c={id:s.id+'cat-'+Math.abs(hash),parentid:38,name:label,_source:s.id,_categoryURL:path};remember(c);items.push(c);
      });if(!items.length)throw new Error('Подборки на этом сайте пока недоступны.');return{success:true,data:items};
    });
  }
  function probe(s){
    if(!ready(s))return Promise.reject(new Error(s.note||'Каталог пока не подключён.'));
    var p=s.id==='primary'?original({action:'categories'}):documentAt(s.base,s).then(function(doc){if(s.layout==='media'?!WePlayWebCatalog.present(doc):!cards(doc,s).length)throw new Error('Каталог не найден.');});
    return p.then(function(){health[s.id]='available';checked[s.id]=Date.now();notify();return s;},function(e){health[s.id]='unavailable';checked[s.id]=Date.now();notify();throw e;});
  }
  function use(s){active=s;offline=false;try{localStorage.setItem(LAST,s.id);}catch(ignore){}notify();return s;}
  function select(){
    if(active)return Promise.resolve(active);if(selecting)return selecting;
    var revision=epoch,order=mode==='auto'?sources.filter(ready):[source(mode)],last;
    if(mode==='auto'){try{last=localStorage.getItem(LAST);}catch(ignore){}if(last&&last!=='primary')order=order.filter(function(s){return s.id===last;}).concat(order.filter(function(s){return s.id!==last;}));}
    function next(i){if(i>=order.length)throw new Error('Источники сейчас недоступны. Попробуйте позже.');return probe(order[i]).catch(function(){return next(i+1);});}
    selecting=next(0).then(function(s){if(revision!==epoch)throw new Error('Источник изменён.');return use(s);}).finally(function(){if(revision===epoch)selecting=null;});return selecting;
  }
  function itemsOf(j){var d=j&&j.data||{};return Array.isArray(d)?d:d.items||d.news||d.list||[];}
  function requestFrom(s,params,useSaved,quiet){
    if(!ready(s))return Promise.reject(new Error(s&&s.note||'Каталог пока не подключён.'));var k=s.id+'|'+key(params),revision=epoch;
    return Promise.resolve().then(function(){return s.id==='primary'?original(params):params.action==='categories'?collections(s):params.do==='get'?detail(s,params.id):listing(s,params);}).then(function(j){
      if(revision!==epoch)throw new Error('Источник изменён.');var d=j.data,values=params.do==='get'?[Array.isArray(d)?d[0]:d.item||d.news||d]:itemsOf(j);values.forEach(function(item){if(!item||!item.id)return;item._source=s.id;if(!item.title)return;if(params.do==='get')item._detail=true;if(Number(params.category)===13||Number(params.category)===36)item._kindHint='series';else if(Number(params.category)===106)item._kindHint='movie';});
      if(!quiet){health[s.id]='available';checked[s.id]=Date.now();offline=false;}register(j);persist(k,j);if(!quiet)notify();return j;
    }).catch(function(e){if(revision!==epoch)throw e;if(!quiet){health[s.id]='unavailable';checked[s.id]=Date.now();}if(useSaved&&stored[k]){if(!quiet){offline=true;notify();}return Object.assign({},register(stored[k].data),{_saved:true});}if(!quiet)notify();throw e;});
  }
  function singleApi(params){
    var revision=epoch,id=String(params.id||''),cat=String(params.category||''),pinned=sources.filter(function(s){return id.indexOf(s.id+'-')===0||cat.indexOf(s.id+'cat-')===0;})[0];
    if(pinned)return requestFrom(pinned,params,true);
    if(params.do==='get'&&/^\d+$/.test(id))return requestFrom(sources[0],params,true);
    return select().then(function(s){return requestFrom(s,params,mode!=='auto').catch(function(e){
      if(revision!==epoch)throw e;
      if(mode!=='auto')throw e;var alternatives=sources.filter(function(candidate){return ready(candidate)&&candidate.id!==s.id&&(health[candidate.id]!=='unavailable'||Date.now()-(checked[candidate.id]||0)>30000);});
      function next(i){if(i>=alternatives.length||revision!==epoch)throw e;return probe(alternatives[i]).then(function(available){return requestFrom(available,params).then(function(j){if(revision===epoch)use(available);return j;});}).catch(function(){return next(i+1);});}return next(0);
    });}).catch(function(e){
      if(revision!==epoch)throw e;
      var suffix='|'+key(params),saved=Object.keys(stored).filter(function(k){return k.slice(-suffix.length)===suffix&&(mode==='auto'||k.indexOf(mode+'|')===0);}).sort(function(a,b){return stored[b].at-stored[a].at;})[0];
      if(saved){active=source(saved.split('|')[0]);offline=true;notify();return register(stored[saved].data);}throw e;
    });
  }
  function rawDetail(item,verify,refresh){
    var record=index[String(item.id)]||item,s=source(record._source||'primary');
    var loaded=record._detail&&!refresh?Promise.resolve(record):requestFrom(s,{action:'news',do:'get',id:record.id},true,!!refresh).then(function(j){var d=j.data;return Array.isArray(d)?d[0]:d.item||d.news||d;});
    return loaded.then(function(full){return verify||!union.kind(full)&&full._video?verifyKind(full):full;});
  }
  function playerURL(item){var raw=union.fields(item).film;if(!raw)throw new Error('Видео для этого фильма пока недоступно.');var u=new URL(raw),origin=source(item._source||'primary');u.searchParams.set('host',origin?new URL(origin.base).hostname:'lord.kim');return u.href;}
  function playlist(item,timeout){var v=item._video,q=new URLSearchParams({pub:v.publisher,id:v.titleId,aggr:v.aggregator});return fetchData('https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?'+q.toString(),true,'omit',timeout);}
  function episodic(episodes){return episodes.some(function(e){return e.season!==undefined&&e.season!==null&&e.season!==''&&isFinite(Number(e.season))&&Number(e.season)>=0&&e.episode!==undefined&&e.episode!==null&&e.episode!==''&&Number(e.episode)>0;});}
  function verifyKind(full){
    var now=Date.now();if(full._kindVerified&&now-(full._kindVerifiedAt||0)<86400000||now-(full._kindCheckedAt||0)<60000)return Promise.resolve(full);
    var revision=epoch,k=(full._source||'primary')+':'+full.id;if(kindPending[k])return kindPending[k];
    kindPending[k]=Promise.resolve().then(function(){
      if(full._video)return playlist(full,4500).then(function(j){return typeof j.isSerial==='boolean'?(j.isSerial?'series':'movie'):episodic(j.items||[])?'series':'';});
      return fetchData(playerURL(full),false,'omit',4500).then(function(html){var episodes=WePlayNativePlayer.parse(html);return episodic(episodes)?'series':union.kind(full)==='movie'?'movie':'';});
    }).then(function(type){if(revision!==epoch)throw new Error('Источник изменён.');var result=Object.assign({},full,{_kindCheckedAt:Date.now()});if(type){result._kind=type;result._kindVerified=type;result._kindVerifiedAt=Date.now();}remember(result);persist((full._source||'primary')+'|'+key({action:'news',do:'get',id:full.id}),{success:true,data:result});return result;}).catch(function(error){if(revision!==epoch)throw error;var result=Object.assign({},full,{_kindCheckedAt:Date.now()});remember(result);return result;}).finally(function(){delete kindPending[k];});return kindPending[k];
  }
  function versions(item){return union.variants(item).filter(function(v){return ready(source(v._source||'primary'));});}
  function candidates(params){
    var category=String(params.category||''),group=categoryGroups[category];
    if(group)return group.map(function(c){return {source:source(c._source),category:c.id};}).filter(function(c){return ready(c.source);});
    var pinned=sources.filter(function(s){return category.indexOf(s.id+'cat-')===0;})[0];
    return (pinned?[pinned]:sources.filter(ready)).map(function(s){return{source:s,category:params.category};});
  }
  function combinedRead(s,params){
    var saved=stored[s.id+'|'+key(params)];
    if(health[s.id]==='unavailable'&&Date.now()-(checked[s.id]||0)<30000){if(saved)return Promise.resolve(Object.assign({},register(saved.data),{_saved:true}));return Promise.reject(new Error('Источник временно недоступен.'));}
    return requestFrom(s,params,true);
  }
  function resolveAmbiguous(items){var records=union.unresolved(items),cursor=0;function worker(){if(cursor>=records.length)return Promise.resolve();var item=records[cursor++];return rawDetail(item,true).catch(function(){}).then(worker);}return Promise.all([worker(),worker(),worker()]);}
  function mergedListing(params){
    var revision=epoch,page=Math.max(1,Number(params.page)||1),limit=Math.max(1,Math.min(120,Number(params.limit)||60)),query=Object.assign({},params);delete query.page;
    var feedKey=key(query),feed=feeds[feedKey];
    if(!feed){feed={limit:limit,buffer:[],seen:[],pages:[],sources:candidates(params).map(function(c){return{source:c.source,category:c.category,next:1,ended:false};}),fresh:false,used:[],serial:Promise.resolve(),failures:[]};feeds[feedKey]=feed;}
    function freshBuffer(){var seen={};feed.seen.forEach(function(id){seen[union.canonical(id)]=true;});feed.buffer=union.combine(feed.buffer).filter(function(item){return !seen[union.canonical(item.id)];});}
    function hasMore(){return feed.buffer.length>0||feed.sources.some(function(s){return !s.ended;});}
    function build(number){
      var rounds=0;
      function fill(){
        if(revision!==epoch)throw new Error('Источник изменён.');freshBuffer();var batch=feed.sources.filter(function(s){return !s.ended;});
        if(feed.buffer.length>=feed.limit||!batch.length||rounds++>=4)return Promise.resolve();
        return Promise.all(batch.map(function(cursor){var request=Object.assign({},params,{page:cursor.next,limit:60,category:cursor.category});
          return combinedRead(cursor.source,request).then(function(j){return {cursor:cursor,data:j};},function(e){cursor.ended=true;feed.failures.push(cursor.source.id);return{error:e};});
        })).then(function(results){
          var rows=[];results.forEach(function(result){if(!result.data)return;var cursor=result.cursor,j=result.data,items=itemsOf(j),pagination=j.data&&j.data.pagination;rows.push(items);feed.fresh=feed.fresh||!j._saved;if(feed.used.indexOf(cursor.source.id)<0)feed.used.push(cursor.source.id);cursor.ended=pagination?cursor.next>=Number(pagination.pages||cursor.next):items.length<60;cursor.next++;});
          var length=rows.reduce(function(n,row){return Math.max(n,row.length);},0);for(var i=0;i<length;i++)rows.forEach(function(row){if(row[i])feed.buffer.push(row[i]);});return fill();
        });
      }
      function prepare(){return fill().then(function(){return resolveAmbiguous(feed.buffer.slice(0,feed.limit*2));}).then(function(){freshBuffer();if(feed.buffer.length<feed.limit&&feed.sources.some(function(s){return !s.ended;})&&rounds<4)return prepare();});}
      return prepare().then(function(){
        if(revision!==epoch)throw new Error('Источник изменён.');freshBuffer();var items=feed.buffer.splice(0,feed.limit);items.forEach(function(item){feed.seen.push(item.id);});
        if(!feed.used.length){var saved=stored['all|'+key(Object.assign({},params,{page:number}))];if(saved){offline=true;notify();return register(saved.data);}delete feeds[feedKey];throw new Error('Каталоги сейчас недоступны. Попробуйте позже.');}
        active=source(feed.used[0]);offline=!feed.fresh;var result={success:true,data:{items:items,pagination:{page:number,pages:hasMore()?number+1:number,total:null},sources:feed.used.slice(),partial:feed.failures.length>0}};
        persist('all|'+key(Object.assign({},params,{page:number})),result);notify();return result;
      });
    }
    function ensure(){if(revision!==epoch)throw new Error('Источник изменён.');if(feed.pages[page-1]){var cached=feed.pages[page-1];cached.data.items=union.combine(cached.data.items);return cached;}var number=feed.pages.length+1;return build(number).then(function(j){feed.pages.push(j);return number<page?ensure():j;});}
    var task=feed.serial.catch(function(){}).then(ensure);feed.serial=task;return task;
  }
  function mergedCollections(params){
    var revision=epoch;return Promise.all(sources.filter(ready).map(function(s){return combinedRead(s,params).then(function(j){return {source:s,data:j};},function(){return null;});})).then(function(results){
      if(revision!==epoch)throw new Error('Источник изменён.');var found={},items=[],fresh=false;results.forEach(function(result){if(!result)return;fresh=fresh||!result.data._saved;itemsOf(result.data).forEach(function(c){if(Number(c.parentid||c.parent_id)!==38){if(result.source.id==='primary')items.push(c);return;}var name=union.normal(c.name),group=found[name];if(group)group._categoryAlternatives.push(c);else{group=Object.assign({},c,{_categoryAlternatives:[c]});found[name]=group;items.push(group);}});});
      if(!results.some(Boolean))throw new Error('Подборки сейчас недоступны.');offline=!fresh;var j={success:true,data:items};register(j);persist('all|'+key(params),j);notify();return j;
    });
  }
  function mergedDetail(id){
    var revision=epoch,base=union.find(id)||index[String(id)],initial=base?Promise.resolve(base):singleApi({action:'news',do:'get',id:id}).then(function(j){var d=j.data;return Array.isArray(d)?d[0]:d.item||d.news||d;});
    function typed(item){var records=versions(item),selected=records.filter(function(v){return v._source===mode;});if(mode!=='auto'&&selected.length)records=selected;return Promise.all(records.map(function(v){return rawDetail(v,true).then(function(full){return full;},function(){return v;});})).then(function(items){if(revision!==epoch)throw new Error('Источник изменён.');var combined=union.combine(items);return union.find(id)||combined[0]||item;});}
    return initial.then(typed).then(function(item){
      if(mode!=='auto')return item;var variants=versions(item),known={};variants.forEach(function(v){known[v._source||'primary']=true;});
      return Promise.all(sources.filter(function(s){return ready(s)&&!known[s.id];}).map(function(s){return combinedRead(s,{action:'news',do:'list',page:1,limit:60,approve:1,search:item.title}).then(function(j){var list=itemsOf(j);return resolveAmbiguous([item].concat(list)).then(function(){var base=union.find(item.id)||item;union.combine([base].concat(list.filter(function(candidate){return union.same(base,union.find(candidate.id)||candidate);})));});}).catch(function(){});})).then(function(){return union.find(item.id)||item;});
    }).then(typed).then(function(item){persist('all|'+key({action:'news',do:'get',id:id}),{success:true,data:item});return{success:true,data:item};});
  }
  function api(params){
    if(mode==='auto'){if(params.do==='get')return mergedDetail(params.id);if(params.action==='categories')return mergedCollections(params);return mergedListing(params);}
    if(params.do==='get'&&union.find(params.id))return mergedDetail(params.id);
    return singleApi(params).then(function(j){if(params.do!=='get'&&params.action!=='categories'){var d=j.data;if(Array.isArray(d))j=Object.assign({},j,{data:union.combine(d)});else j=Object.assign({},j,{data:Object.assign({},d,{items:union.combine(itemsOf(j))})});}return j;});
  }
  function playbackChoices(item,preferred){var choices=versions(item);if(!preferred&&mode!=='auto'){var selected=choices.filter(function(v){return v._source===mode;});if(selected.length)choices=selected;}if(preferred){var chosen=choices.filter(function(v){return String(v.id)===String(preferred);})[0];choices=chosen?[chosen].concat(choices.filter(function(v){return v._source===chosen._source&&String(v.id)!==String(preferred);})):[];}return choices;}
  function playerData(item){
    var v=item._video||{},key=String(item._source||'primary')+':'+item.id+':'+String(item.xfields&&item.xfields.film||'')+':'+[v.publisher,v.titleId,v.aggregator].join(':');
    if(!playerPending[key])playerPending[key]=Promise.resolve().then(function(){return playerFrom(item);}).finally(function(){delete playerPending[key];});return playerPending[key];
  }
  function seasons(item,preferred,force){
    var choices=playbackChoices(item,preferred),key=epoch+':'+String(preferred||'auto')+':'+choices.map(function(v){return(v._source||'primary')+':'+v.id;}).join('|'),entry=seasonCache[key];
    if(!force&&entry&&Date.now()-entry.at<180000)return Promise.resolve(entry.data);if(seasonPending[key])return seasonPending[key];
    var at=0,results=new Array(choices.length),success=0;
    function worker(){var index=at++;if(index>=choices.length)return Promise.resolve();return rawDetail(choices[index]).then(playerData).then(function(resolved){var list=WePlaySeasons.group(WePlayNativePlayer.parse(resolved.payload));success++;results[index]=list;}).catch(function(){results[index]=[];}).then(worker);}
    seasonPending[key]=Promise.all([worker(),worker()]).then(function(){if(!success)throw new Error('Не удалось загрузить сезоны.');var data=WePlaySeasons.combine(results);seasonCache[key]={at:Date.now(),data:data};var keys=Object.keys(seasonCache).sort(function(a,b){return seasonCache[a].at-seasonCache[b].at;});while(keys.length>32)delete seasonCache[keys.shift()];return data;}).finally(function(){delete seasonPending[key];});return seasonPending[key];
  }
  function player(item,preferred,season,resume){
    var choices=playbackChoices(item,preferred),last;
    if(!preferred&&resume&&resume.sourceId)choices=choices.filter(function(v){return String(v.id)===resume.sourceId;}).concat(choices.filter(function(v){return String(v.id)!==resume.sourceId;}));
    function next(i){if(i>=choices.length)return Promise.reject(last||new Error('Вариант просмотра недоступен.'));return rawDetail(choices[i]).then(playerData).then(function(resolved){var episodes=WePlayNativePlayer.parse(resolved.payload);if(resume&&WePlaySeasons.resumeIndex(episodes,resume)<0)throw new Error('Сохранённая серия недоступна в этом источнике.');if(season!==undefined&&season!==null&&WePlaySeasons.startIndex(episodes,season)<0)throw new Error('Выбранный сезон недоступен в этом источнике.');resolved.source=choices[i]._source||'primary';resolved.versionId=String(choices[i].id);return resolved;}).catch(function(e){last=e;return next(i+1);});}
    return next(0);
  }
  function playlistSeconds(raw,depth){
    if(depth>2)return Promise.resolve(null);
    return fetchData(raw,false,'omit').then(function(body){
      if(!/^\s*#EXTM3U/.test(body))return null;var lines=body.split(/\r?\n/),seconds=0,count=0,next='';
      if(/#EXT-X-ENDLIST/.test(body)){lines.forEach(function(line){var match=line.match(/^#EXTINF:(\d+(?:\.\d+)?)/);if(match){seconds+=Number(match[1]);count++;}});return count&&seconds>0&&seconds<=86400?seconds:null;}
      for(var i=0;i<lines.length;i++){if(!/^#EXT-X-STREAM-INF:/.test(lines[i]))continue;for(var n=i+1;n<lines.length;n++){var uri=lines[n].trim();if(uri&&uri[0]!=='#'){next=url(uri,raw);break;}}if(next)break;}
      return next?playlistSeconds(next,depth+1):null;
    });
  }
  function duration(item,preferred){
    var choices=playbackChoices(item,preferred);
    function next(at){if(at>=choices.length)return Promise.resolve(null);return rawDetail(choices[at]).then(function(full){
      var stated=WePlayDuration.fromItem(full);if(stated)return stated;
      return playerData(full).then(function(resolved){var episodes=WePlayNativePlayer.parse(resolved.payload),serial=union.kind(full)==='series'||episodes.some(function(e){return e.season!==undefined&&e.season!==null;});
        if(full._video){var first=episodes[0].variants[0];return fetchData('https://plapi.cdnvideohub.com/api/v1/player/sv/video/'+encodeURIComponent(first.vkId),true).then(function(video){var runtime=WePlayDuration.fromSeconds([video.duration],serial,serial);if(runtime)return runtime;var stream=video.sources&&video.sources.hlsUrl;return stream?playlistSeconds(stream,0).then(function(seconds){return WePlayDuration.fromSeconds([seconds],serial,serial);}):null;});}
        var runtime=WePlayDuration.fromSeconds(episodes.map(function(e){return e.duration;}),serial,false);if(runtime)return runtime;
        return episodes[0].hls?playlistSeconds(episodes[0].hls,0).then(function(seconds){return WePlayDuration.fromSeconds([seconds],serial,serial);}):null;
      });
    }).then(function(runtime){return runtime||next(at+1);},function(){return next(at+1);});}
    return next(0);
  }
  function videoSource(episode,variant){
    var selected=episode.variants[variant]||episode.variants[0];return fetchData('https://plapi.cdnvideohub.com/api/v1/player/sv/video/'+encodeURIComponent(selected.vkId),true).then(function(j){var src=j.sources||{},stream=src.hlsUrl||src.mpegHighUrl||src.mpegMediumUrl;if(!stream||!/^https:\/\//.test(stream))throw new Error('Видео пока недоступно. Попробуйте другую озвучку.');return stream;});
  }
  function playerFrom(item){
    if(!item._video)return Promise.resolve().then(function(){return fetchData(playerURL(item),false,'omit');}).then(function(html){return{payload:html};});
    return playlist(item).then(function(j){
      var groups={},episodes=[];(j.items||[]).forEach(function(entry){if(!entry.vkId)return;var season=j.isSerial?Number(entry.season)||1:null,number=j.isSerial?Number(entry.episode)||1:null,k=season+':'+number;
        if(!groups[k]){groups[k]={season:season,episode:number,variants:[]};episodes.push(groups[k]);}groups[k].variants.push({label:entry.voiceStudio||entry.voiceType||'Основная',vkId:String(entry.vkId)});
      });episodes.sort(function(a,b){return (a.season||0)-(b.season||0)||(a.episode||0)-(b.episode||0);});
      if(!episodes.length)throw new Error('В этом источнике пока нет доступного видео.');return{payload:{episodes:episodes},transport:'plain',resolveEpisode:videoSource};
    });
  }
  function artwork(item){
    if(item._source!=='pub')return Promise.resolve('');
    var variant=versions(item).filter(function(v){return v._source==='pub';})[0];if(!variant)return Promise.resolve('');
    return detail(source('pub'),variant.id).then(function(j){var v=j.data._video;if(!v)return'';var q=new URLSearchParams({pub:v.publisher,id:v.titleId,aggr:v.aggregator});return fetchData('https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?'+q.toString(),true).then(function(p){var first=(p.items||[])[0];if(!first)return'';return fetchData('https://plapi.cdnvideohub.com/api/v1/player/sv/video/'+encodeURIComponent(first.vkId),true).then(function(video){return url(video.thumbUrl,'https://plapi.cdnvideohub.com/');});});}).catch(function(){return'';});
  }
  function checkSource(id){
    var s=source(id);if(!s)return Promise.reject(new Error('Неизвестный источник'));
    if(ready(s))return probe(s).then(function(){return {ready:true,message:'Каталог доступен'};});
    var abort=new AbortController(),timer=setTimeout(function(){abort.abort();},6500);
    return fetch(s.base,{credentials:'include',signal:abort.signal}).then(function(r){
      health[s.id]=r.ok?'requires-connection':'unavailable';checked[s.id]=Date.now();notify();
      return {ready:false,message:r.ok?'Сайт доступен, каталог пока не подключён':r.status===403?'Сайт ограничивает доступ':r.status===410||r.status===511?'Недоступен из этой сети':'Сайт ответил с ошибкой '+r.status};
    }).catch(function(){health[s.id]='unavailable';checked[s.id]=Date.now();notify();return {ready:false,message:'Сайт не ответил с телевизора'};}).finally(function(){clearTimeout(timer);});
  }
  function searchSources(){return (mode==='auto'?sources.filter(ready):[source(mode)]).map(function(s){return s.id;});}
  function searchKnown(){return union.combine(Object.keys(index).map(function(id){return index[id];}).filter(function(item){return item&&item.title&&searchSources().indexOf(item._source||'primary')>=0;}));}
  function searchRequest(id,query,page,options){
    options=Object.assign({deadline:Date.now()+4000},options||{});
    var s=source(id),revision=epoch,params={action:'news',do:'list',page:page||1,limit:60,approve:1,search:query},k='search2|'+id+'|'+key(params);
    if(searchSources().indexOf(id)<0)return Promise.reject(new Error('Источник изменён.'));
    return Promise.resolve().then(function(){return id==='primary'?original(params,options):listing(s,params,options);}).then(function(j){
      if(revision!==epoch||options.signal&&options.signal.aborted)throw Object.assign(new Error('Поиск отменён'),{name:'AbortError'});
      itemsOf(j).forEach(function(item){item._source=id;remember(item);});persist(k,j);return j;
    }).catch(function(error){if(revision!==epoch||options.signal&&options.signal.aborted)throw Object.assign(new Error('Поиск отменён'),{name:'AbortError'});var saved=stored[k];if(saved&&Date.now()-saved.at<86400000)return Object.assign({},register(saved.data),{_saved:true});throw error;});
  }
  function searchDetails(items,options){
    options=Object.assign({deadline:Date.now()+4000},options||{});
    var revision=epoch,seen={},candidates=union.unresolved(items);items.slice(0,12).forEach(function(item){union.variants(item).forEach(function(record){if(!union.kind(record)||options.aliases&&!union.fields(record).original_title)candidates.push(record);});});
    var records=candidates.filter(function(item){if(seen[String(item.id)]||item._detail&&union.kind(item))return false;seen[String(item.id)]=true;return true;}).slice(0,6);
    return Promise.all(records.map(function(item){var s=source(item._source||'primary');return Promise.resolve().then(function(){return item._detail?{data:item}:s.id==='primary'?original({action:'news',do:'get',id:item.id},options):detail(s,item.id,options);}).then(function(j){
      if(revision!==epoch||options.signal&&options.signal.aborted)return;var full=j.data;full=Array.isArray(full)?full[0]:full.item||full.news||full;if(!full||!full.id)return;full._source=s.id;full._detail=true;remember(full);
      var verify=Promise.resolve('');if(full._video&&!full._kindVerified){var v=full._video,q=new URLSearchParams({pub:v.publisher,id:v.titleId,aggr:v.aggregator});verify=searchFetch('https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?'+q,true,'omit',options).then(function(data){return typeof data.isSerial==='boolean'?data.isSerial?'series':'movie':'';});}
      return verify.then(function(kind){if(revision!==epoch||options.signal&&options.signal.aborted)return;if(kind){full._kind=kind;full._kindVerified=kind;full._kindVerifiedAt=Date.now();}remember(full);persist(s.id+'|'+key({action:'news',do:'get',id:full.id}),{success:true,data:full});});
    }).catch(function(){});}));
  }
  window.WePlayCatalog={searchSources:searchSources,searchKnown:searchKnown,searchRequest:searchRequest,searchDetails:searchDetails,api:api,player:player,seasons:seasons,duration:duration,artwork:artwork,validId:validId,checkSource:checkSource,info:function(item,refresh){var records=versions(item),selected=records.filter(function(v){return String(v.id)===String(item._displayId||item.id);})[0]||records[0];return selected?rawDetail(selected,false,refresh):Promise.resolve(item);},dedupe:union.combine,same:union.same,find:union.find,versions:function(item){var seen={};return versions(item).filter(function(v){var id=v._source||'primary';if(seen[id])return false;seen[id]=true;return true;}).map(function(v){return {id:v.id,source:v._source||'primary',name:source(v._source||'primary').name};});},remember:remember,snapshot:function(){return{mode:mode,active:active&&active.id,name:mode==='auto'?'Все источники':active&&active.name,combined:mode==='auto',offline:offline,health:Object.assign({},health),sources:sources.map(function(s){return{id:s.id,name:s.name,pending:!ready(s),note:s.note};})};}};
}());

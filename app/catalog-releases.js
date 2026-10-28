/* Release-year views share the existing combined catalog and keep their own cursor. */
(function(){
  'use strict';
  var catalog=window.WePlayCatalog,baseApi=catalog.api,feeds={},revision=0;
  var definitions=[{id:'new-films',title:'Новые фильмы',label:'Фильмы',category:106,kind:'movie'},{id:'new-series',title:'Новые сериалы',label:'Сериалы',category:13,kind:'series'},{id:'new-cartoons',title:'Новые мультфильмы',label:'Мультфильмы',category:109,kind:'movie'}];
  var store={},STORE='lord.releases.v1';try{store=JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch(ignore){}
  function year(){return new Date().getFullYear();}
  function definition(id){return definitions.filter(function(value){return value.id===id;})[0];}
  function save(key,data){store[key]={at:Date.now(),data:data};var keys=Object.keys(store).sort(function(a,b){return store[a].at-store[b].at;});function evict(){var at=keys.findIndex(function(k){return k.indexOf('|18|1|')<0;});delete store[keys.splice(at<0?0:at,1)[0]];}while(keys.length>18)evict();try{var value=JSON.stringify(store);while(value.length>350000&&keys.length>1){evict();value=JSON.stringify(store);}localStorage.setItem(STORE,value);}catch(ignore){}}
  function itemsOf(j){var d=j&&j.data||{};return Array.isArray(d)?d:d.items||d.news||d.list||[];}
  function eligible(item,spec,releaseYear){var fields=WePlayCatalogUnion.fields(item),match=String(fields.year||'').match(/(?:19|20)\d{2}/),kind=WePlayCatalogUnion.kind(item);return match&&Number(match[0])===releaseYear&&(!kind||kind===spec.kind);}
  function restore(j){var data=Object.assign({},j.data);data.items=catalog.dedupe(itemsOf(j));data.items.forEach(catalog.remember);return Object.assign({},j,{data:data});}
  function recent(params,spec){
    var releaseYear=year(),mode=catalog.snapshot().mode,limit=Math.max(1,Math.min(120,Number(params.limit)||60)),page=Math.max(1,Number(params.page)||1),query=String(params.search||'');
    var feedKey=mode+'|'+releaseYear+'|'+spec.id+'|'+limit+'|'+query,stamp=revision,feed=feeds[feedKey];
    if(!feed){feed={cursor:1,ended:false,buffer:[],seen:[],pages:[],sources:[],error:null,serial:Promise.resolve()};feeds[feedKey]=feed;}
    function clean(){var seen={};feed.seen.forEach(function(id){seen[WePlayCatalogUnion.canonical(id)]=true;});feed.buffer=catalog.dedupe(feed.buffer).filter(function(item){return eligible(item,spec,releaseYear)&&!seen[WePlayCatalogUnion.canonical(item.id)];});}
    function cacheKey(number){return mode+'|'+releaseYear+'|'+spec.id+'|'+limit+'|'+number+'|'+query;}
    function build(number){
      var scans=0;feed.error=null;
      function fill(){
        if(stamp!==revision)throw new Error('Источник изменён.');clean();if(feed.buffer.length>=limit||feed.ended||feed.error||scans++>=4)return Promise.resolve();
        var cursor=feed.cursor,request={action:'news',do:'list',category:spec.category,page:cursor,limit:limit,approve:params.approve===undefined?1:params.approve,search:query||undefined};
        return baseApi(request).then(function(j){
          if(stamp!==revision)throw new Error('Источник изменён.');var rows=itemsOf(j),pagination=j.data&&j.data.pagination;feed.cursor++;feed.ended=pagination?cursor>=Number(pagination.pages||cursor):rows.length<limit;
          (j.data&&j.data.sources||[catalog.snapshot().active]).filter(Boolean).forEach(function(id){if(feed.sources.indexOf(id)<0)feed.sources.push(id);});
          feed.buffer=feed.buffer.concat(rows.filter(function(item){return eligible(item,spec,releaseYear);}));return fill();
        }).catch(function(error){if(stamp!==revision)throw error;feed.error=error;});
      }
      return fill().then(function(){
        if(stamp!==revision)throw new Error('Источник изменён.');clean();var items=feed.buffer.splice(0,limit);
        if(!items.length&&feed.error){var saved=store[cacheKey(number)];if(saved)return restore(saved.data);if(!feed.pages.length)delete feeds[feedKey];throw feed.error;}
        items.forEach(function(item){feed.seen.push(item.id);});var result={success:true,data:{items:items,pagination:{page:number,pages:feed.buffer.length||!feed.ended?number+1:number,total:null},sources:feed.sources.slice(),releaseYear:releaseYear,partial:!!feed.error}};save(cacheKey(number),result);return result;
      });
    }
    function ensure(){if(stamp!==revision)throw new Error('Источник изменён.');if(feed.pages[page-1])return restore(feed.pages[page-1]);var number=feed.pages.length+1;return build(number).then(function(j){feed.pages.push(j);return number<page?ensure():j;});}
    var pending=feed.serial.catch(function(){}).then(ensure);feed.serial=pending;return pending;
  }
  catalog.api=function(params){var spec=definition(params.category);return spec&&params.do!=='get'?recent(params,spec):baseApi(params);};
  catalog.releaseSections=function(){return definitions.map(function(value){return Object.assign({},value);});};
  catalog.releaseYear=year;
  catalog.isReleaseCategory=function(id){return !!definition(id);};
}());

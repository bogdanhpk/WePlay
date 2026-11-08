/* Read the public catalog as data. No scripts or advertising frames are mounted. */
(function(){
  'use strict';
  var queue=[],running=0;
  function documentFor(known,s,h){return new Promise(function(resolve,reject){queue.push({known:known,source:s,helpers:h,resolve:resolve,reject:reject});pump();});}
  function pump(){while(running<3&&queue.length){var task=queue.shift();running++;(function(job){Promise.resolve().then(function(){if(!job.helpers.current())throw new Error('Источник изменён.');return job.helpers.documentAt(job.known._url,job.source,4500);}).then(job.resolve,job.reject).then(function(){running--;pump();});})(task);}}
  function title(value){return String(value||'').replace(/\s+смотреть\s+онлайн.*$/i,'').replace(/\s*(?:\(\s*)?\d+(?:\s*[-–—,]\s*\d+)*\s+сезон(?:а|ов|ы)?\s*\)?\s*$/i,'').trim();}
  function originalTitle(doc,name,year){
    var node=doc.querySelector('[itemprop="alternativeHeadline"],.lfs-original,.page__original,meta[property="og:original_title"]'),direct=node&&(node.getAttribute('content')||node.textContent),schema=structured(doc);
    if(direct)return title(direct);if(typeof schema.alternateName==='string')return title(schema.alternateName);
    var keywords=doc.querySelector('meta[name="keywords"]'),value=keywords&&keywords.getAttribute('content')||'',escaped=title(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),date=String(year||'').match(/(?:19|20)\d{2}/);
    if(!escaped||!date)return'';var match=value.match(new RegExp('(?:^|\\s)'+escaped+'\\s+([A-Za-z0-9][A-Za-z0-9\\s\\u2019\u0027:,.&!?()\\-]{1,160}?)\\s+'+date[0]+'(?:\\s|$)','i'));return match&&/[A-Za-z]/.test(match[1])?match[1].trim():'';
  }
  function structured(doc){
    var records=[];
    function walk(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(walk);return;}if(/^(?:Movie|TVSeries|CreativeWork)$/.test(value['@type'])&&value.name)records.push(value);if(value['@graph'])walk(value['@graph']);}
    Array.prototype.forEach.call(doc.querySelectorAll('script[type="application/ld+json"]'),function(script){try{walk(JSON.parse(script.textContent));}catch(ignore){}});
    return records[0]||{};
  }
  function breadcrumbKind(doc){
    var kinds=[];
    function read(node){
      if(!node||typeof node!=='object')return;
      if(Array.isArray(node)){node.forEach(read);return;}
      if(node['@graph'])read(node['@graph']);
      if(node['@type']!=='BreadcrumbList'||!Array.isArray(node.itemListElement))return;
      node.itemListElement.forEach(function(crumb){
        var raw=crumb&&crumb.item&&(crumb.item['@id']||crumb.item);
        var path=typeof raw==='string'?raw.replace(/^https?:\/\/[^/]+/,''):'';
        var kind=/^\/(?:serials|serialy|zarubezhnye-serialy|multserialy)(?:\/|$)/i.test(path)?'series':
          /^\/(?:films|filmy|multfilmy)(?:\/|$)/i.test(path)?'movie':'';
        if(kind&&kinds.indexOf(kind)<0)kinds.push(kind);
      });
    }
    Array.prototype.forEach.call(doc.querySelectorAll('script[type="application/ld+json"]'),function(script){
      try{read(JSON.parse(script.textContent));}catch(ignore){}
    });
    return kinds.length===1?kinds[0]:'';
  }
  function present(doc){return !!doc.querySelector('.media-tile__link[href]');}
  function detail(known,s,h){
    return documentFor(known,s,h).then(function(doc){
      var schema=structured(doc),name=title(schema.name||h.get(doc,'h1'));
      if(!name||/^(?:сериал|фильм|мультфильм)\s*№\s*\d+/i.test(name))throw new Error('Сайт не передал название фильма.');
      function fact(label){var result='';h.list(doc,'.facts-list li').some(function(row){var first=row.firstElementChild;if(first&&h.text(first).toLowerCase().indexOf(label.toLowerCase())===0){result=h.text(row).slice(h.text(first).length).replace(/^\s*:\s*/,'').trim();return true;}return false;});return result;}
      var categoryKind=breadcrumbKind(doc),kind=known._kind;
      if(categoryKind==='series'||schema['@type']==='TVSeries'||/\s\d+(?:[-–]\d+)?\s+сезон/i.test(schema.name||''))kind='series';
      else if(schema['@type']==='Movie'||categoryKind==='movie')kind='movie';
      var x=Object.assign({},known.xfields),image=doc.querySelector('[itemprop="image"]'),frame=h.list(doc,'.watch-player iframe[src],iframe[src]').filter(function(node){return /\/embed\/(?:movie|series|kp)\//.test(node.getAttribute('src')||'');})[0];
      x.year=fact('Год выхода')||x.year;x.original_title=originalTitle(doc,name,x.year)||x.original_title||'';x.strana=fact('Страна');x.janre=h.get(doc,'[itemprop="genre"]');x.director=h.get(doc,'[itemprop="director"]');x.rolax=h.get(doc,'[itemprop="actors"]');x.postproduction=fact('Перевод');
      x.kp_rating=h.get(doc,'.rating-chip--kp span');x.imdb_rating=h.get(doc,'.rating-chip--imdb span');
      x.duration=schema.duration||fact('Длительность')||fact('Продолжительность')||x.duration||'';
      x.season_count=schema.numberOfSeasons||fact('Количество сезонов')||fact('Сезонов')||x.season_count||'';x.series_status=schema.creativeWorkStatus||fact('Статус сериала')||fact('Статус')||x.series_status||'';
      x.image=h.imageURL(image,s.base)||x.image;
      var backdrops=h.backdropURL?h.backdropURL(doc,known._url,x.image):[];if(backdrops.length)x.backdrops=backdrops;
      x.film=frame?h.url(frame.getAttribute('src'),s.base):'';
      var kp=x.film.match(/\/embed\/kp\/(\d+)/);if(kp)x.kinopoisk_id=kp[1];
      var item={id:known.id,title:name,_source:s.id,_url:known._url,_kind:kind,_detail:true,_backdropParsed:2,xfields:x,full_story:schema.description||h.get(doc,'.story-summary')};
      if(h.current())h.remember(item);
      return item;
    });
  }
  function listing(doc,s,params,h){
    var links=h.list(doc,Number(params.category)===219&&!params.search?'#owl-top .media-tile__link[href]':'.media-tile__link[href]'),seen={},items=[],cursor=0,failed=false;
    links.forEach(function(link){var href=h.pageURL(link.getAttribute('href'),s),id=href&&new URL(href).pathname.match(/^\/(\d+)\/?$/);if(!id||seen[id[1]])return;seen[id[1]]=true;items.push({id:s.id+'-'+id[1],_url:href,_source:s.id,_kind:Number(params.category)===13||Number(params.category)===36?'series':Number(params.category)===106||Number(params.category)===109?'movie':'',xfields:{}});});
    var additional=params.search&&s.searchPublisher&&doc.querySelector('#alloha-public-search .aps-form')?expanded(doc,s,params.search,h).then(function(rows){return{items:rows};},function(error){return{error:error};}):null;
    if(!items.length){if(additional)return additional.then(function(extra){if(extra.error)throw extra.error;return extra.items;});if(/ничего не найдено|поиск по сайту не дал|не найдено/i.test(h.text(doc.body)))return Promise.resolve([]);return Promise.reject(new Error('Не удалось прочитать раздел сайта.'));}
    var result=new Array(items.length),failures=0;
    function worker(){if(!h.current())return Promise.reject(new Error('Источник изменён.'));if(failed||cursor>=items.length)return Promise.resolve();var at=cursor++,item=items[at],cached=h.lookup(item.id);return (cached&&cached._detail?Promise.resolve(cached):detail(item,s,h)).then(function(full){result[at]=full;return worker();},function(error){if(h.search){failures++;return worker();}failed=true;throw error;});}
    return Promise.all([worker(),worker(),worker()]).then(function(){
      var available=h.search?result.filter(Boolean):result;
      return Promise.resolve(additional).then(function(extra){
        if(extra&&extra.items)available=available.concat(extra.items);
        if(h.search&&!available.length&&failures)throw new Error('Не удалось загрузить результаты из источника.');
        available._partial=failures>0||!!(extra&&extra.error);return available;
      });
    });
  }
  function expanded(doc,s,query,h){
    var form=doc.querySelector('#alloha-public-search .aps-form'),endpoint=form&&h.url(form.getAttribute('data-endpoint'),s.base),csrf=form&&form.getAttribute('data-csrf')||'',target;
    try{target=new URL(endpoint);}catch(ignore){}
    if(!target||target.protocol!=='https:'||!/^lordfilm26-kino\d+\.lat$/.test(target.hostname)||target.username||target.password||target.port||target.pathname!=='/engine/ajax/controller.php'||target.search!=='?mod=media_catalog'||!/^[a-f0-9]{32,128}$/i.test(csrf))return Promise.reject(new Error('Расширенный каталог недоступен.'));
    return h.catalogSearch(endpoint,String(query).slice(0,160),csrf).then(function(records){
      if(!h.current())throw new Error('Источник изменён.');
      var seen={},items=[];
      records.slice(0,40).forEach(function(record){
        var id=String(record.id_kp||''),name=title(record.name),year=String(record.year||'');
        if(!/^[1-9]\d{0,11}$/.test(id)||!name||name.length>180||! /^(?:19|20)\d{2}$/.test(year)||seen[id])return;
        seen[id]=true;
        var item={id:s.id+'-kp-'+id,title:name,_source:s.id,_expanded:true,_detail:true,_video:{publisher:s.searchPublisher,titleId:id,aggregator:'kp'},xfields:{year:year,original_title:title(record.original_name),kinopoisk_id:id,image:h.url(record.poster,s.base),janre:String(record.type||''),film:'https://plapi.cdnvideohub.com/api/v1/player/sv/playlist'}};
        h.remember(item);items.push(item);
      });
      return items;
    });
  }
  window.WePlayWebCatalog={present:present,detail:detail,listing:listing,cleanTitle:title,originalTitle:originalTitle,breadcrumbKind:breadcrumbKind};
}());

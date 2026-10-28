/* Original artwork from public metadata pages. No website scripts are executed. */
(function(){
  'use strict';
  var cache={},pending={},failures={},queue=[],running=0,wake=null,KEY='lord.artwork.v1';
  var castPending={},castFailures={},metadataPending={},seriesPending={},seriesFailures={};
  var mazePending={},mazeFailures={},mazeNext=0,mazeBackoff=0,mazeShows={},mazeShowPending={},mazeShowFailures={},mazeCastPending={},mazeImageFailures={},mazeQueue=[],mazeRunning=0,mazeWake=null;
  var posterChecks={};
  var resources=[],people={},FAMILY_KEY='weplay.artwork.families.v1',families={};
  try{families=JSON.parse(localStorage.getItem(FAMILY_KEY)||'{}')||{};}catch(ignore){}
  var MATCH_POLICY='exact-title-type-year-v1';
  var imageQueue=[],imageRunning=0,imageWake=null,imageOrder=0,decoded=[];
  try{cache=JSON.parse(localStorage.getItem(KEY)||'{}')||{};Object.keys(cache).forEach(function(k){if(!cache[k]||!cache[k].data||!cache[k].data.match||cache[k].data.match.policy!==MATCH_POLICY)delete cache[k];});localStorage.setItem(KEY,JSON.stringify(cache));}catch(ignore){}
  function normal(s){return WePlayCatalogUnion.normal(WePlayWebCatalog.cleanTitle(s));}
  function identity(item){var x=WePlayCatalogUnion.fields(item),year=String(x.year||'').match(/(?:19|20)\d{2}/);return{policy:MATCH_POLICY,kind:WePlayCatalogUnion.kind(item),year:year?year[0]:'',names:[normal(item.title),normal(x.original_title)].filter(Boolean),ids:WePlayCatalogUnion.identifiers(item)};}
  function verified(data,item){var proof=data&&data.match,want=identity(item);return !!(proof&&proof.policy===MATCH_POLICY&&Array.isArray(proof.names)&&proof.ids&&(!want.ids.imdb||!data.imdbId||want.ids.imdb===data.imdbId)&&proof.kind===want.kind&&proof.year===want.year&&want.names.some(function(n){return proof.names.indexOf(n)>=0;})&&!Object.keys(want.ids).some(function(k){return proof.ids[k]&&proof.ids[k]!==want.ids[k];}));}
  function checked(data,item){data.match=identity(item);return data;}
  function txt(n){return n?(n.textContent||'').replace(/\s+/g,' ').trim():'';}
  function itemKey(item){var x=WePlayCatalogUnion.fields(item),year=String(x.year||'').match(/(?:19|20)\d{2}/),kind=WePlayCatalogUnion.kind(item),name=normal(item.title),external=WePlayCatalogUnion.identifiers(item),identity=external.kp?':kp:'+external.kp:external.imdb?':imdb:'+external.imdb:external.tmdb?':tmdb:'+external.tmdb:'';return year&&kind&&name?'title:'+kind+':'+name+':'+year[0]+identity:String(item._source||'primary')+':'+item.id+':'+(x.year||'');}
  function saved(item){var direct=cache[itemKey(item)];if(direct&&verified(direct.data,item))return direct;var records=[item].concat(item._alternatives||[]),found;records.some(function(record){var x=WePlayCatalogUnion.fields(record);found=cache[String(record._source||'primary')+':'+record.id+':'+(x.year||'')];return !!(found&&verified(found.data,item));});return found&&verified(found.data,item)?found:null;}
  function persist(k,data){cache[k]={at:Date.now(),data:data};var keys=Object.keys(cache).sort(function(a,b){return cache[a].at-cache[b].at;});while(keys.length>160)delete cache[keys.shift()];try{localStorage.setItem(KEY,JSON.stringify(cache));}catch(ignore){}}
  function fetchValue(url,json){var a=new AbortController(),t=setTimeout(function(){a.abort();},7500);return fetch(url,{credentials:'omit',signal:a.signal}).then(function(r){if(!r.ok){var error=new Error('Artwork unavailable');error.status=r.status;throw error;}return json?r.json():r.text();}).finally(function(){clearTimeout(t);});}
  function imageURL(raw,size){var m=String(raw||'').match(/https:\/\/(?:media\.themoviedb\.org|image\.tmdb\.org)\/t\/p\/[^/]+\/([a-zA-Z0-9]+\.(?:jpg|png|webp))/);return m?'https://image.tmdb.org/t/p/'+size+'/'+m[1]:'';}
  function parseCast(page){
    var doc=page&&page.querySelectorAll?page:new DOMParser().parseFromString(page,'text/html'),seen={},people=[];
    Array.prototype.forEach.call(doc.querySelectorAll('#cast_scroller ol.people li.card,section.top_billed ol.people li.card,section.series_cast ol.people li.card'),function(card){
      var link=card.querySelector('p a[href^="/person/"]')||card.querySelector('a[href^="/person/"]'),match=link&&(link.getAttribute('href')||'').match(/^\/person\/(\d+)(?:-|\/|$)/),image=card.querySelector('img.profile'),name=txt(link)||image&&image.getAttribute('alt');
      if(!match||!name||seen[match[1]])return;seen[match[1]]=true;people.push({id:match[1],name:name,image:image?imageURL(image.getAttribute('src')||image.getAttribute('data-src'),'h632'):''});
    });return people.slice(0,12);
  }
  function profileMetadata(page,url){var doc=new DOMParser().parseFromString(page,'text/html');return{cast:parseCast(doc),castPage:url,series:WePlaySeries.parsePage(doc,url)};}
  function typeOf(item){return WePlayCatalogUnion.kind(item)==='series'?'tv':'movie';}
  function tmdb(item){
    var x=WePlayCatalogUnion.fields(item),query=WePlayWebCatalog.cleanTitle(x.original_title||item.title),year=String(x.year||'').match(/(?:19|20)\d{2}/),type=typeOf(item),names=[normal(item.title),normal(x.original_title)].filter(Boolean);
    if(!year||!WePlayCatalogUnion.kind(item))return Promise.reject(new Error('Artwork identity incomplete'));
    var path=type==='tv'?'/search/tv':'/search/movie';
    return fetchValue('https://www.themoviedb.org'+path+'?query='+encodeURIComponent(query)+'&language=ru-RU',false).then(function(html){
      var doc=new DOMParser().parseFromString(html,'text/html'),seen={},matches=[];
      Array.prototype.forEach.call(doc.querySelectorAll('a[data-media-type][href]'),function(a){var href=a.getAttribute('href'),match=href&&href.match(/^\/(movie|tv)\/\d+/);if(!match||type&&match[1]!==type||seen[match[0]])return;var known=identity(item).ids;if(known.tmdb&&match[0]!=='/'+match[1]+'/'+known.tmdb)return;
        var card=a.closest('[data-object-id]');if(!card)return;var h=card.querySelector('h2');if(!h)return;var labels=Array.prototype.map.call(h.querySelectorAll('span'),txt);if(!labels.length)labels=[txt(h)];
        var exact=labels.some(function(label){return names.indexOf(normal(label))>=0;}),date=txt(card.querySelector('.release_date'));
        if(!exact||year&&date.indexOf(year[0])<0)return;seen[match[0]]=true;var img=card.querySelector('img');matches.push({href:'https://www.themoviedb.org'+href,poster:img&&imageURL(img.getAttribute('src'),'original'),thumb:img&&imageURL(img.getAttribute('src'),'w500')});
      });
      if(matches.length!==1)throw new Error('No unambiguous artwork match');var found=matches[0];
      var fullURL=new URL(found.href);fullURL.searchParams.set('language','ru-RU');return fetchValue(fullURL.href,false).then(function(page){
        var imdb=identity(item).ids.imdb;if(imdb&&page.indexOf('imdb.com/title/'+imdb)<0)throw new Error('Conflicting artwork identity');var pageDoc=new DOMParser().parseFromString(page,'text/html'),header=pageDoc.querySelector('.header.large.first'),backdrop=header&&header.querySelector('.backdrop'),raw=backdrop&&(backdrop.getAttribute('style')||'')||header&&header.getAttribute('style')||'';
        Array.prototype.forEach.call(pageDoc.querySelectorAll('style'),function(style){var rules=style.textContent.match(/[^{}]+\{[^{}]*\}/g)||[];rules.forEach(function(rule){var selector=rule.slice(0,rule.indexOf('{'));if(selector.split(',').some(function(part){return /^(?:div)?\.header\.large\.first(?:::{0,1}(?:before|after))?$/.test(part.trim());}))raw+=' '+rule.slice(rule.indexOf('{'));});});
        var m=raw.match(/https:\/\/(?:media\.themoviedb\.org|image\.tmdb\.org)\/t\/p\/[^/]+\/[a-zA-Z0-9]+\.(?:jpg|png|webp)/);
        return Object.assign({poster:found.poster,posterThumb:found.thumb,background:m?imageURL(m[0],'original'):'',backgroundThumb:m?imageURL(m[0],'w1280'):'',source:'TMDB'},profileMetadata(page,fullURL.href));
      }).catch(function(error){if(identity(item).ids.imdb)throw error;return{poster:found.poster,posterThumb:found.thumb,source:'TMDB'};});
    }).then(function(data){return checked(data,item);});
  }
  function cinemeta(item){
    var x=WePlayCatalogUnion.fields(item),want=identity(item),query=WePlayWebCatalog.cleanTitle(x.original_title||item.title),kind=want.kind==='series'?'series':'movie',imdb=want.ids.imdb;
    if(!want.kind||!want.year&&!imdb)return Promise.reject(new Error('Artwork identity incomplete'));
    var url='https://v3-cinemeta.strem.io/'+(imdb?'meta/'+kind+'/'+imdb+'.json':'catalog/'+kind+'/top/search='+encodeURIComponent(query)+'.json');
    return fetchValue(url,true).then(function(j){
      var matches=(imdb?[j.meta]:j.metas||[]).filter(function(m){if(!m||!/^tt\d+$/.test(m.id)||m.type!==kind||want.year&&String(m.releaseInfo||m.year||'').slice(0,4)!==want.year)return false;
        if(imdb)return m.id===imdb;var labels=[m.name,m.originalTitle,m.original_name].concat(m.aliases||[]);return labels.some(function(label){return typeof label==='string'&&want.names.indexOf(normal(label))>=0;});});
      if(matches.length!==1)throw new Error('No unambiguous artwork match');var m=matches[0],poster=m.poster||'';
      if(/^https:\/\/m\.media-amazon\.com\//.test(poster))poster=poster.replace(/\._V1[^/]*\.(jpg|png)$/,'._V1_SX1500.$1');
      else poster='https://images.metahub.space/poster/large/'+m.id+'/img';
      return checked({imdbId:m.id,lookupTitle:m.name,poster:poster,posterThumb:poster.replace('_SX1500.','_SX500.'),background:'https://images.metahub.space/background/large/'+m.id+'/img',backgroundThumb:'https://images.metahub.space/background/medium/'+m.id+'/img',source:'Cinemeta'},item);
    });
  }
  function pumpMaze(){
    if(!mazeQueue.length||mazeRunning>=2)return;
    if(window.WePlayNativePlayer&&WePlayNativePlayer.active){if(!mazeWake)mazeWake=setTimeout(function(){mazeWake=null;pumpMaze();},1500);return;}
    var job=mazeQueue.shift();mazeRunning++;job.run().then(job.resolve,job.reject).finally(function(){mazeRunning--;pumpMaze();});pumpMaze();
  }
  function mazeFetch(path){return new Promise(function(resolve,reject){mazeQueue.push({resolve:resolve,reject:reject,run:function(){
    if(Date.now()<mazeBackoff)return Promise.reject(new Error('Image database temporarily unavailable'));
    var wait=Math.max(0,mazeNext-Date.now());mazeNext=Math.max(Date.now(),mazeNext)+750;
    return new Promise(function(done){setTimeout(done,wait);}).then(function(){if(Date.now()<mazeBackoff)throw new Error('Image database temporarily unavailable');return fetchValue('https://api.tvmaze.com'+path,true);}).catch(function(error){if(error.status===429)mazeBackoff=Date.now()+60000;throw error;});
  }});pumpMaze();});}
  function mazeShow(item,art){
    if(WePlayCatalogUnion.kind(item)!=='series')return Promise.reject(new Error('TV database only covers series'));
    var key=itemKey(item),want=identity(item),x=WePlayCatalogUnion.fields(item),imdb=want.ids.imdb||art&&art.imdbId,query=art&&art.lookupTitle||x.original_title||WePlayWebCatalog.cleanTitle(item.title),lookup=key+'|'+(imdb||normal(query));
    if(mazeShows[key]&&(!imdb||mazeShows[key].externals&&mazeShows[key].externals.imdb===imdb))return Promise.resolve(mazeShows[key]);if(mazeShowPending[lookup])return mazeShowPending[lookup];if(mazeShowFailures[lookup]&&Date.now()-mazeShowFailures[lookup]<600000||!imdb&&!want.year)return Promise.reject(new Error('No verified series match'));
    mazeShowPending[lookup]=mazeFetch(imdb?'/lookup/shows?imdb='+encodeURIComponent(imdb):'/search/shows?q='+encodeURIComponent(query)).then(function(raw){
      var shows=(imdb?[raw]:(Array.isArray(raw)?raw:[]).map(function(row){return row.show;})).filter(function(show){return show&&/^[1-9]\d*$/.test(String(show.id))&&(!want.year||String(show.premiered||'').slice(0,4)===want.year)&&(imdb?show.externals&&show.externals.imdb===imdb:[normal(query)].concat(want.names).indexOf(normal(show.name))>=0);});
      if(shows.length!==1)throw new Error('No unambiguous series match');mazeShows[key]=shows[0];return shows[0];
    }).catch(function(error){mazeShowFailures[lookup]=Date.now();throw error;}).finally(function(){delete mazeShowPending[lookup];});return mazeShowPending[lookup];
  }
  function tvmaze(item,art){
    if(WePlayCatalogUnion.kind(item)!=='series')return Promise.resolve(null);
    var key=itemKey(item),x=WePlayCatalogUnion.fields(item),lookup=key+'|'+(art&&art.imdbId||normal(x.original_title||item.title));
    if(mazePending[lookup])return mazePending[lookup];if(mazeFailures[lookup]&&Date.now()-mazeFailures[lookup]<600000)return Promise.resolve(null);
    mazePending[lookup]=mazeShow(item,art).then(function(show){
      if(mazeImageFailures[show.id]&&Date.now()-mazeImageFailures[show.id]<600000)throw new Error('No series background');return mazeFetch('/shows/'+show.id+'/images').then(function(images){var backgrounds=(Array.isArray(images)?images:[]).filter(function(image){var size=image.resolutions&&image.resolutions.original;return image.type==='background'&&size&&size.width>=1280&&size.height>=720&&size.width/size.height>=1.45&&size.width/size.height<=2.6&&/^https:\/\/static\.tvmaze\.com\//.test(size.url||'');}).sort(function(a,b){return Number(b.main)-Number(a.main)||b.resolutions.original.width*b.resolutions.original.height-a.resolutions.original.width*a.resolutions.original.height;}).slice(0,3).map(function(image){return image.resolutions.original.url;});
        if(!backgrounds.length){mazeImageFailures[show.id]=Date.now();throw new Error('No series background');}return backgrounds;
      }).then(function(backgrounds){if(!backgrounds.length)throw new Error('No series background');var old=saved(item),value=checked(Object.assign({},old&&old.data||{},art||{poster:show.image&&show.image.original||'',source:'TVmaze'},{background:backgrounds[0],backgrounds:backgrounds,backgroundSource:'TVmaze',backgroundCredit:'https://www.tvmaze.com/shows/'+show.id,imdbId:show.externals&&show.externals.imdb||'',lookupTitle:show.name}),item);persist(key,value);return value;});
    }).catch(function(){mazeFailures[lookup]=Date.now();return null;}).finally(function(){delete mazePending[lookup];});return mazePending[lookup];
  }
  function externalArt(item,art){
    var full=Object.assign({},item,{xfields:Object.assign({},WePlayCatalogUnion.fields(item))});if(art&&art.lookupTitle)full.xfields.original_title=art.lookupTitle;if(art&&art.imdbId)full.xfields.imdb_id=art.imdbId;
    return tmdb(full).catch(function(){return cinemeta(full);});
  }
  function mazeCast(item,art){
    var key=itemKey(item);if(mazeCastPending[key])return mazeCastPending[key];
    mazeCastPending[key]=mazeShow(item,art).then(function(show){return mazeFetch('/shows/'+show.id+'/cast').then(function(rows){var seen={},people=[];(Array.isArray(rows)?rows:[]).forEach(function(row){var person=row.person;if(!person||!person.name||!person.id||seen[person.id])return;seen[person.id]=true;var image=person.image&&(person.image.original||person.image.medium)||'';people.push({id:'tvmaze-'+person.id,name:person.name,image:/^https:\/\/static\.tvmaze\.com\//.test(image)?image:'',source:'TVmaze',sourceURL:'https://www.tvmaze.com/shows/'+show.id});});
      if(!people.length||!people.some(function(person){return !!person.image;}))throw new Error('Cast unavailable');var current=saved(item),data=checked(Object.assign({},current&&current.data||art||{},{cast:people.slice(0,12),castSource:'TVmaze',imdbId:show.externals&&show.externals.imdb||'',lookupTitle:show.name}),item);persist(key,data);return data.cast;
    });}).finally(function(){delete mazeCastPending[key];});return mazeCastPending[key];
  }
  function pump(){
    if(!queue.length||running>=2)return;
    if(window.WePlayNativePlayer&&WePlayNativePlayer.active){if(!wake)wake=setTimeout(function(){wake=null;pump();},1500);return;}
    var work=queue.shift();running++;work.run().finally(function(){running--;pump();});pump();
  }
  function get(item,priority){
    var k=itemKey(item),stored=saved(item),useAPI=window.WePlayTMDB&&WePlayTMDB.available(),packaged=useAPI&&WePlayTMDB.indexed&&WePlayTMDB.indexed(item);if(packaged&&(!stored||!stored.data.tmdbAPI)){packaged=checked(packaged,item);if(stored&&stored.data.castSource==='TVmaze'){packaged.cast=stored.data.cast;packaged.castSource='TVmaze';}persist(k,packaged);return Promise.resolve(packaged);}if(stored&&(!useAPI||stored.data.tmdbAPI||Date.now()-(stored.data.tmdbAttemptedAt||0)<600000))return Promise.resolve(stored.data);var x=WePlayCatalogUnion.fields(item),lookup=k+'|query:'+normal(x.original_title||item.title);
    if(pending[lookup]){if(priority){var at=queue.findIndex(function(work){return work.key===lookup;});if(at>0)queue.unshift(queue.splice(at,1)[0]);}return pending[lookup];}
    if(failures[lookup]&&Date.now()-failures[lookup]<600000)return Promise.resolve(null);
    pending[lookup]=new Promise(function(resolve){var work={key:lookup,run:function(){
      var fullItem=item,enriched=false;
      function details(){enriched=true;return WePlayCatalog.info(item,!x.original_title).then(function(full){fullItem=full;return full;}).catch(function(){return item;});}
      function lookupArt(full){function fallback(){return tvmaze(full).then(function(primary){if(primary)return primary;return externalArt(full).then(function(extra){return tvmaze(full,extra).then(function(maze){return maze||extra;});});});}return useAPI?WePlayTMDB.artwork(full).then(function(data){return checked(data,full);}).catch(function(){if(stored)return stored.data;return fallback();}).then(function(data){data.tmdbAttemptedAt=Date.now();return data;}):fallback();}
      return (item._source&&(!x.year||!useAPI&&WePlayCatalogUnion.kind(item)==='series'&&!x.original_title&&!identity(item).ids.imdb)?details():Promise.resolve(item)).then(function(full){fullItem=full;return lookupArt(full).catch(function(error){
        if(enriched||!item._source||WePlayCatalogUnion.fields(full).original_title)throw error;
        return details().then(function(details){if(!WePlayCatalogUnion.fields(details).original_title)throw error;return lookupArt(details);});
      });}).then(function(data){persist(k,data);var fullKey=itemKey(fullItem);if(fullKey!==k)persist(fullKey,data);resolve(data);}).catch(function(){failures[lookup]=Date.now();resolve(null);}).finally(function(){delete pending[lookup];});
    }};if(priority)queue.unshift(work);else queue.push(work);pump();});return pending[lookup];
  }
  function roleOf(wide,full){return wide?(full?'hero':'wide'):'poster';}
  function spec(role){return role==='hero'?{width:2560,min:1280,height:720}:role==='wide'?{width:640,min:180,height:100}:role==='person'?{width:384,min:192,height:192}:{width:342,min:140,height:180};}
  function cardRole(role){return role==='wide'||role==='poster';}
  function sufficient(value,role){var size=role==='hero'&&value&&value.posterFallback?spec('poster'):spec(role);return value&&value.width>=size.min&&value.height>=size.height&&(role!=='hero'||value.posterFallback||value.width/value.height>=1.45&&value.width/value.height<=2.6);}
  function originalAssetURL(raw){try{var url=new URL(raw);return url.hostname==='wsrv.nl'&&url.searchParams.get('url')||raw;}catch(ignore){return raw;}}
  function candidates(raw,role){
    if(!raw)return[];var size=spec(role),compact=cardRole(role),target=imageURL(raw,role==='person'?'h632':role==='hero'?'original':role==='wide'?'w780':'w342')||raw;
    if(compact&&/^https:\/\/m\.media-amazon\.com\//.test(target))target=target.replace(/_SX\d+\./,'_SX'+size.width+'.');
    if(compact&&/^https:\/\/st\.kp\.yandex\.net\/images\/(?:film_big\/|film_iphone\/iphone\d+_)\d+\.jpg$/.test(target))target=target.replace(/\/(?:film_big\/|film_iphone\/iphone\d+_)(\d+)\.jpg$/,'/film_iphone/iphone360_$1.jpg');
    var relay='https://wsrv.nl/?url='+encodeURIComponent(target)+'&output=jpg&q='+(compact?82:90)+'&w='+size.width+'&fit=inside&we',isTV=/Tizen/i.test(navigator.userAgent),remote=/^https:\/\/(?:image\.tmdb\.org|media\.themoviedb\.org|images\.metahub\.space)/.test(target);
    return isTV&&remote?[relay,target]:[target,relay];
  }
  function pumpImages(){
    if(!imageQueue.length||imageRunning>=3)return;
    if(window.WePlayNativePlayer&&WePlayNativePlayer.active){if(!imageWake)imageWake=setTimeout(function(){imageWake=null;pumpImages();},1500);return;}
    var task=imageQueue.shift();imageRunning++;task.run().then(task.resolve,task.reject).finally(function(){imageRunning--;pumpImages();});pumpImages();
  }
  function placeholder(raw){return /(?:^|[\/_-])(?:no[-_]?(?:image|poster|photo)|placeholder|spacer|blank|loading)(?:[.\/_-]|$)/i.test(originalAssetURL(raw));}
  function validPoster(url,image){
    if(placeholder(url)||!image.naturalWidth||!image.naturalHeight)return Promise.resolve(false);
    var raw=originalAssetURL(url),host;try{host=new URL(raw).hostname;}catch(ignore){return Promise.resolve(false);}
    // KP can redirect to a 208x304 no-poster image with a successful status.
    // Check tiny KP images and resized placeholder ratios; regular posters stay fast.
    if(!/^(?:st\.kp\.yandex\.net|kinopoiskapiunofficial\.tech)$/.test(host)||image.naturalWidth>240&&Math.abs(image.naturalWidth/image.naturalHeight-208/304)>.001&&Math.abs(image.naturalWidth/image.naturalHeight-208/320)>.001)return Promise.resolve(true);
    if(posterChecks[raw])return posterChecks[raw];
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},1000);
    posterChecks[raw]=fetch(raw,{method:'HEAD',credentials:'omit',signal:controller.signal}).then(function(response){return response.ok&&!!response.url&&!placeholder(response.url);}).catch(function(){return false;}).finally(function(){clearTimeout(timer);});return posterChecks[raw];
  }
  function loadImage(url,priority,timeout,guard){
    var retained=decoded.filter(function(entry){return entry.url===url;})[0];if(retained){decoded.splice(decoded.indexOf(retained),1);decoded.push(retained);return Promise.resolve(retained);}
    return new Promise(function(resolve,reject){imageQueue.push({resolve:resolve,reject:reject,priority:Number(priority)||0,order:imageOrder++,run:function(){if(guard&&!guard())return Promise.reject(new Error('Image temporarily unavailable'));return new Promise(function(done,fail){var image=new Image(),finished=false,timer=setTimeout(function(){finish(false);},timeout||8000);
      function finish(ok){if(finished)return;finished=true;clearTimeout(timer);image.onload=null;image.onerror=null;if(!ok){image.removeAttribute('src');fail(new Error('Image unavailable'));return;}var value={url:url,width:image.naturalWidth,height:image.naturalHeight,image:image};decoded.push(value);while(decoded.length>8)decoded.shift();done(value);}
      image.onload=function(){validPoster(url,image).then(function(valid){if(!valid){finish(false);return;}if(image.decode)image.decode().then(function(){finish(true);},function(){finish(!!image.naturalWidth);});else finish(true);},function(){finish(false);});};image.onerror=function(){finish(false);};image.src=url;
    });}});imageQueue.sort(function(a,b){return b.priority-a.priority||a.order-b.order;});pumpImages();});
  }
  function firstImage(urls,role,strict,options){var at=0;options=options||{};function next(){if(at>=urls.length)return Promise.resolve(null);return loadImage(urls[at++],options.priority===undefined?(role==='hero'?2:role==='person'?1:0):options.priority,options.timeout,options.guard).then(function(value){if(strict&&!sufficient(value,role))return next();return value;},next);}return next();}
  function kinopoiskId(item){
    var ids={};function add(raw){var id=String(raw||'').trim();if(!/^[1-9]\d{0,8}$/.test(id)){try{var url=new URL(id,'https://www.kinopoisk.ru/'),match=/^(?:www\.)?kinopoisk\.ru$/.test(url.hostname)&&url.pathname.match(/^\/(?:film|series)\/([1-9]\d{0,8})(?:\/|$)/);id=match?match[1]:'';}catch(ignore){id='';}}if(id)ids[id]=true;}
    [item].concat(item._alternatives||[]).forEach(function(record){var x=WePlayCatalogUnion.fields(record);[x.kinopoisk_id,x.kp_id,x.kinopoisk_url].forEach(add);if(record._video&&record._video.aggregator==='kp')add(record._video.titleId);});
    sourceImages(item,true).forEach(function(raw){var url=new URL(raw),match=url.hostname==='st.kp.yandex.net'?url.pathname.match(/^\/images\/(?:film_big\/|film_iphone\/iphone\d+_)([1-9]\d{0,8})\.jpg$/):url.hostname==='kinopoiskapiunofficial.tech'?url.pathname.match(/^\/images\/posters\/kp(?:_small)?\/([1-9]\d{0,8})\.jpg$/):null;if(match)ids[match[1]]=true;});
    var found=Object.keys(ids);return found.length===1?found[0]:'';
  }
  function sourceImages(item,compact){
    var urls=[];
    function add(value,record){if(!value)return;if(Array.isArray(value)){value.forEach(function(v){add(v,record);});return;}if(typeof value==='object'){add(value.url||value.src||value.contentUrl,record);return;}var raw=String(value).trim(),m=raw.match(/data-(?:src|original|lazy-src)\s*=\s*["']([^"']+)["']/i)||raw.match(/\bsrc\s*=\s*["']([^"']+)["']/i);if(m)raw=m[1];raw=raw.replace(/&amp;/g,'&');if(!raw||raw==='null'||/^(?:data|blob):/i.test(raw)||/(?:^|[\/_-])(?:no[-_]?(?:image|poster|photo)|placeholder|spacer|blank|loading)(?:[.\/_-]|$)/i.test(raw))return;if(!/^(https?:)?\//.test(raw))raw=raw.indexOf('uploads/')===0?'/'+raw:'/uploads/posts/'+raw;try{var url=new URL(raw,record._url||item._url||'https://lord.kim/');if(!/^https?:$/.test(url.protocol))return;raw=url.href;}catch(ignore){return;}var original=raw.replace(/\/(?:thumbs|medium)\//g,'/');(compact?[raw]:[original,raw]).forEach(function(url){if(urls.indexOf(url)<0)urls.push(url);});}
    [item].concat(item._alternatives||[]).forEach(function(record){var x=WePlayCatalogUnion.fields(record);['image','download_poster','poster','poster_url','thumbnail','thumb'].forEach(function(key){add(x[key]||record[key],record);});});return urls;
  }
  /* One identity, one resource packet and one selected image family for every page. */
  function sameResource(record,item){
    var have=record.identity,want=identity(item);if(have.kind&&want.kind&&have.kind!==want.kind||have.year&&want.year&&have.year!==want.year)return false;
    if(Object.keys(want.ids).some(function(key){return have.ids[key]&&have.ids[key]!==want.ids[key];}))return false;
    if(Object.keys(want.ids).some(function(key){return have.ids[key]===want.ids[key];}))return true;
    if(!have.kind||!want.kind||!have.year||!want.year)return !!record.item&&String(record.item.id)===String(item.id);
    return want.names.some(function(name){return have.names.indexOf(name)>=0;});
  }
  function imageValue(value){if(!value)return null;return{url:value.url,width:value.width,height:value.height,posterFallback:!!value.posterFallback,credit:value.credit||'',creditURL:value.creditURL||''};}
  function uniqueImages(list){return list.map(function(url){return originalAssetURL(url||'');}).filter(function(url,index,all){return /^https?:\/\//.test(url)&&!placeholder(url)&&all.indexOf(url)===index;});}
  function personRecord(raw,provider){
    if(raw._weplayPerson)return raw;var source=raw.source||provider||'TMDB',photo=raw.image||'',key=source+':'+(raw.id||photo||normal(raw.name)),record=people[key];
    if(!record){var numeric=String(raw.id||'').replace(/^tvmaze-/,'');record={id:key,name:raw.name||'',source:source,sourceURL:/^\d+$/.test(numeric)?source==='TVmaze'?'https://www.tvmaze.com/people/'+numeric:source==='TMDB'?'https://www.themoviedb.org/person/'+numeric:raw.sourceURL||'':raw.sourceURL||'',image:photo,images:{original:photo,thumbnail:photo?candidates(photo,'person')[0]:''},_weplayPerson:true};people[key]=record;}
    else if(!record.image&&photo){record.image=photo;record.images={original:photo,thumbnail:candidates(photo,'person')[0]};}
    return record;
  }
  function normalizedImages(item,data){
    data=data||{};var id=kinopoiskId(item),posters=uniqueImages([data.poster,data.posterThumb].concat(id?['https://st.kp.yandex.net/images/film_big/'+id+'.jpg']:[],sourceImages(item,false))),landscapes=uniqueImages((data.backgrounds||[]).concat([data.background,data.backgroundThumb]));
    return{landscapes:landscapes,posters:posters,original:landscapes[0]||posters[0]||'',preview:landscapes[0]?candidates(landscapes[0],'wide')[0]:posters[0]?candidates(posters[0],'wide')[0]:'',poster:posters[0]?candidates(posters[0],'poster')[0]:'',source:data.backgroundSource||data.source||'catalog',creditURL:data.backgroundCredit||data.castPage||''};
  }
  function resourceFor(item,priority){
    var entry=resources.filter(function(record){return sameResource(record,item);})[0],wanted=identity(item);
    if(entry){wanted.names.forEach(function(name){if(entry.identity.names.indexOf(name)<0)entry.identity.names.push(name);});Object.assign(entry.identity.ids,wanted.ids);entry.identity.kind=entry.identity.kind||wanted.kind;entry.identity.year=entry.identity.year||wanted.year;return entry;}
    entry={key:itemKey(item),identity:wanted,item:item,images:null,actors:[],metadata:null,assets:{},selection:null,actorTask:null};resources.push(entry);while(resources.length>160)resources.shift();
    entry.ready=Promise.race([get(item,priority),new Promise(function(resolve){setTimeout(function(){resolve(null);},1800);})]).then(function(data){entry.metadata=data||null;entry.images=normalizedImages(item,data);entry.actors=(data&&data.cast||[]).map(function(person){return personRecord(person,data.castSource||data.source);});return entry;});
    return entry;
  }
  function rememberFamily(entry,selection){
    if(!selection)return;families[entry.key]={identity:entry.identity,sourceURL:selection.sourceURL,posterFallback:selection.posterFallback,at:Date.now()};var keys=Object.keys(families).sort(function(a,b){return families[a].at-families[b].at;});while(keys.length>160)delete families[keys.shift()];try{localStorage.setItem(FAMILY_KEY,JSON.stringify(families));}catch(ignore){}
  }
  function selectPoster(entry){
    if(entry.posterTask)return entry.posterTask;
    entry.posterTask=entry.ready.then(function(){var originals=entry.images.posters.slice(),index=0;
      function next(){if(index>=originals.length)return Promise.resolve(null);var raw=originals[index++];return firstImage(candidates(raw,'poster'),'poster',true,{timeout:1800,priority:1}).then(function(value){return value?{sourceURL:raw,preview:imageValue(value),posterFallback:value.width/value.height<1.45}:next();});}
      return next().then(function(value){if(value)return value;return window.WePlayCatalog?WePlayCatalog.info(entry.item,true).then(function(full){entry.images.posters=uniqueImages(entry.images.posters.concat(sourceImages(full,false)));originals=entry.images.posters;return next();}).catch(function(){return null;}):null;});
    });return entry.posterTask;
  }
  function selectCover(entry){
    if(entry.selection)return entry.selection;
    entry.selection=entry.ready.then(function(){var originals=entry.images.landscapes.slice(),previous=families[entry.key];
      if(previous&&sameResource(previous,entry.item)&&!previous.posterFallback&&originals.indexOf(previous.sourceURL)>=0){originals.splice(originals.indexOf(previous.sourceURL),1);originals.unshift(previous.sourceURL);}
      var index=0;function next(){if(index>=originals.length)return Promise.resolve(null);var raw=originals[index++],urls=candidates(raw,'wide'),at=0;
        function candidate(){if(at>=urls.length)return next();return firstImage([urls[at++]],'wide',true,{timeout:2000,priority:1}).then(function(value){if(!value||value.width/value.height<1.45||value.width/value.height>2.6)return candidate();return{sourceURL:raw,preview:imageValue(value),posterFallback:false};});}return candidate();}
      var landscape=next(),poster=null,deadline;function fallback(){if(!poster)poster=selectPoster(entry);return poster;}
      return Promise.race([landscape.then(function(value){return value||fallback();}),new Promise(function(resolve){deadline=setTimeout(function(){resolve(fallback());},4000);})]).then(function(selection){
        clearTimeout(deadline);if(!selection)return null;selection.credit=entry.images.source;selection.creditURL=entry.images.creditURL;entry.images.original=selection.sourceURL;entry.images.preview=selection.preview.url;entry.images.posterFallback=selection.posterFallback;rememberFamily(entry,selection);return selection;
      });
    });return entry.selection;
  }
  function resourceAsset(entry,role){
    if(entry.assets[role])return entry.assets[role];
    if(!entry.retryAt)entry.retryAt={};if(entry.retryAt[role]&&Date.now()<entry.retryAt[role])return Promise.resolve(null);
    entry.assets[role]=(role==='poster'?selectPoster(entry).then(function(selection){return selection&&selection.preview;}):selectCover(entry).then(function(selection){
      if(!selection)return null;if(role==='wide')return Object.assign({},selection.preview,{posterFallback:false,credit:selection.credit,creditURL:selection.creditURL});
      var fullRole=selection.posterFallback?'poster':'hero';return firstImage(candidates(selection.sourceURL,'hero'),fullRole,true,{timeout:3500,priority:2}).then(function(value){
        // When the original fails, retain this very image's preview rather than switch artwork.
        return Object.assign({},imageValue(value)||selection.preview,{posterFallback:selection.posterFallback,credit:selection.credit,creditURL:selection.creditURL});
      });
    })).then(function(value){if(!value){entry.retryAt[role]=Date.now()+30000;entry.posterTask=null;if(role!=='poster')entry.selection=null;delete entry.assets[role];}return imageValue(value);}).catch(function(){entry.retryAt[role]=Date.now()+30000;if(role!=='poster')entry.selection=null;delete entry.assets[role];return null;});return entry.assets[role];
  }
  function asset(item,role,priority){return resourceAsset(resourceFor(item,priority),role);}
  function resolveResource(item,options){var entry=resourceFor(item,true);return entry.ready.then(function(){return selectCover(entry);}).then(function(){if(!options||!options.actors)return entry;return resourceActors(entry).then(function(){return entry;});});}
  function resourceActors(entry){
    if(entry.actorTask)return entry.actorTask;
    entry.actorTask=entry.ready.then(function(){return providerCast(entry.item);}).then(function(records){if(records&&records.length){var selected=records.map(function(person){return personRecord(person,entry.metadata&&entry.metadata.castSource||entry.metadata&&entry.metadata.source);});if(selected.length!==entry.actors.length||selected.some(function(person,index){return person!==entry.actors[index];}))entry.actors=selected;}return entry.actors;});return entry.actorTask;
  }
  function cachedResource(item){return resources.filter(function(entry){return sameResource(entry,item)&&entry.images;})[0]||null;}
  function unavailable(img){img.style.visibility='hidden';img.removeAttribute('src');var parent=img.parentNode;if(!parent)return;parent.classList.remove('artwork-loading');parent.removeAttribute('aria-busy');if(parent.classList.contains('poster-wrap')&&!parent.querySelector('.poster-fallback')){var text=document.createElement('div');text.className='poster-fallback';text.textContent=img.alt;parent.appendChild(text);}else parent.classList.add('unavailable');}
  function commit(img,value){
    if(!img.isConnected||img._weplayRetired||img._weplayCommitted)return;if(!value){unavailable(img);return;}
    img._weplayCommitted=true;img.setAttribute('data-artwork-resolution',value.width+'x'+value.height);
    function reveal(){if(!img.isConnected||img._weplayRetired)return;img.parentNode.classList.toggle('artwork-poster-fallback',!!value.posterFallback);img.style.visibility='visible';img.setAttribute('data-artwork-ready','true');var parent=img.parentNode;parent.classList.remove('artwork-loading');parent.classList.remove('unavailable');parent.removeAttribute('aria-busy');if(img._weplayArt&&img._weplayArt.role==='hero'&&value.credit==='TVmaze'&&/^https:\/\/www\.tvmaze\.com\/shows\/\d+$/.test(value.creditURL||'')&&!parent.querySelector('.artwork-credit')){var credit=document.createElement('a');credit.className='artwork-credit';credit.textContent='Изображение: TVmaze';credit.href=value.creditURL;credit.tabIndex=-1;parent.appendChild(credit);}}
    function loaded(){validPoster(value.url,img).then(function(valid){if(!valid){unavailable(img);return;}if(img.decode)img.decode().then(reveal,reveal);else reveal();});}img.onload=loaded;img.onerror=function(){unavailable(img);};img.src=value.url;if(img.complete&&img.naturalWidth)loaded();
  }
  function start(img){var config=img._weplayArt;if(!config||img._weplayRetired||img._weplayStarted||img._weplayCommitted||!img.isConnected)return;img._weplayStarted=true;var rect=img.getBoundingClientRect(),visible=rect.top<innerHeight&&rect.bottom>0&&rect.left<innerWidth&&rect.right>0;asset(config.item,config.role,config.role==='hero'||visible).then(function(value){commit(img,value);});}
  var observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){observer.unobserve(entry.target);start(entry.target);}});},{root:document.getElementById('content'),rootMargin:'320px 160px'}):null;
  function bind(img,item,wide,full,eager){
    if(img._weplayArt)return;img.style.visibility='hidden';img._weplayArt={item:item,role:typeof wide==='string'?({backdrop:'hero',preview:'wide',poster:'poster'}[wide]||wide):roleOf(wide,full)};img.setAttribute('data-artwork-key',resourceFor(item,!!full).key);if(img.parentNode){img.parentNode.classList.add('artwork-loading');img.parentNode.setAttribute('aria-busy','true');}
    if(eager||!observer){if(img.isConnected)start(img);else requestAnimationFrame(function(){start(img);});}else observer.observe(img);
  }
  function prefetch(items,wide,full,count){return Promise.all((items||[]).slice(0,count||items.length).map(function(item){return asset(item,roleOf(wide,full),!!full);}));}
  function prepare(items,wide,full,count){return Promise.race([prefetch(items,wide,full,count),new Promise(function(resolve){setTimeout(resolve,1400);})]);}
  function metadataTask(key,run){return new Promise(function(resolve,reject){queue.unshift({key:key,run:function(){return Promise.resolve().then(run).then(resolve,reject);}});pump();});}
  function refreshMetadata(item){
    var key=itemKey(item);if(metadataPending[key])return metadataPending[key];
    metadataPending[key]=metadataTask('details:'+key,function(){var entry=saved(item),art=entry&&entry.data,page=art&&art.castPage,known=/^https:\/\/www\.themoviedb\.org\/(movie|tv)\/\d+(?:[/?-]|$)/.test(page||'');return known?fetchValue(page,false).then(function(html){return profileMetadata(html,page);}):tmdb(item);}).then(function(fresh){
      if(!(fresh.cast&&fresh.cast.length)&&!fresh.series)throw new Error('Metadata unavailable');var existing=saved(item),old=existing&&existing.data||{},data=Object.assign({},fresh,old,{cast:old.castSource==='TVmaze'&&old.cast&&old.cast.length?old.cast:fresh.cast&&fresh.cast.length?fresh.cast:old.cast||[],castPage:fresh.castPage||old.castPage});if(fresh.series)data.series=fresh.series;persist(key,data);return data;
    }).finally(function(){delete metadataPending[key];});return metadataPending[key];
  }
  function providerCast(item){
    var key=itemKey(item),entry=saved(item);if(entry&&Array.isArray(entry.data.cast)&&entry.data.cast.length&&(WePlayCatalogUnion.kind(item)!=='series'||entry.data.castSource==='TVmaze'))return Promise.resolve(entry.data.cast);if(castPending[key])return castPending[key];if(castFailures[key]&&Date.now()-castFailures[key]<600000)return Promise.resolve([]);
    castPending[key]=get(item,true).then(function(art){function fallback(){if(art&&Array.isArray(art.cast)&&art.cast.length)return art.cast;return refreshMetadata(item).then(function(fresh){if(!fresh.cast||!fresh.cast.length)throw new Error('Cast unavailable');return fresh.cast;});}return WePlayCatalogUnion.kind(item)==='series'?mazeCast(item,art).catch(fallback):fallback();
    }).catch(function(){castFailures[key]=Date.now();return[];}).finally(function(){delete castPending[key];});return castPending[key];
  }
  function cachedSeries(item){var entry=saved(item),info=entry&&entry.data.series;return info&&Date.now()-info.at<86400000?WePlaySeries.normalize(info):null;}
  function series(item){
    if(WePlayCatalogUnion.kind(item)!=='series')return Promise.resolve(null);var key=itemKey(item),entry=saved(item),old=entry&&entry.data.series,stale=WePlaySeries.normalize(old),fresh=cachedSeries(item);
    if(fresh&&fresh.seasons&&fresh.status)return Promise.resolve(fresh);if(seriesPending[key])return seriesPending[key];if(seriesFailures[key]&&Date.now()-seriesFailures[key]<600000)return Promise.resolve(stale);
    seriesPending[key]=get(item,true).then(function(art){var info=art&&art.series;return info&&Date.now()-info.at<86400000?art:refreshMetadata(item);}).then(function(art){
      var info=art&&art.series;if(!info)throw new Error('Series metadata unavailable');var value=WePlaySeries.merge(stale,info);
      var count=info.seasons?Promise.resolve(info.seasons):info.seasonsURL?metadataTask('seasons:'+key,function(){return fetchValue(info.seasonsURL,false).then(function(html){return WePlaySeries.parseSeasons(html,info.seasonsURL);});}):Promise.resolve(null);
      return count.then(function(seasons){value=WePlaySeries.merge(value,{seasons:seasons});if(!value)throw new Error('Series metadata unavailable');var partial=!seasons&&!info.seasons;if(!value.seasons||!value.status||partial)seriesFailures[key]=Date.now();var current=saved(item),data=Object.assign({},current&&current.data||art,{series:Object.assign({},info,value,{at:partial?0:Date.now()})});persist(key,data);return value;},function(){seriesFailures[key]=Date.now();var current=saved(item);if(value&&current)persist(key,Object.assign({},current.data,{series:Object.assign({},info,value,{at:0})}));return value;});
    }).catch(function(){seriesFailures[key]=Date.now();return stale;}).finally(function(){delete seriesPending[key];});return seriesPending[key];
  }
  function profile(img,person){
    if(!person)return;var actor=typeof person==='string'?personRecord({image:person,name:''},/tvmaze/.test(person)?'TVmaze':'TMDB'):personRecord(person),raw=actor.image;
    if(img._weplayProfile||!imageURL(raw,'h632')&&!/^https:\/\/static\.tvmaze\.com\/uploads\/images\/(?:original_untouched|medium_portrait)\/\d+\/\d+\.(?:jpg|png|webp)$/.test(raw||''))return;img._weplayProfile=true;img.style.visibility='hidden';if(img.parentNode){img.parentNode.classList.add('artwork-loading');img.parentNode.setAttribute('aria-busy','true');}
    function run(){if(!img.isConnected||img._weplayRetired)return;if(actor.photoRetry&&Date.now()<actor.photoRetry){unavailable(img);return;}if(!actor.photoTask)actor.photoTask=firstImage(candidates(raw,'person'),'person',true).then(function(value){if(!value){actor.photoTask=null;actor.photoRetry=Date.now()+30000;}return imageValue(value);});actor.photoTask.then(function(value){commit(img,value);});}if(img.isConnected)run();else requestAnimationFrame(run);
  }
  window.WePlayArtwork={get:get,resolve:resolveResource,cached:cachedResource,cast:function(item){return resourceActors(resourceFor(item,true));},series:series,cachedSeries:cachedSeries,cachedCast:function(item){var entry=cachedResource(item);return entry?entry.actors:[];},profile:profile,release:function(root){root.querySelectorAll('img').forEach(function(img){img._weplayRetired=true;if(observer)observer.unobserve(img);});},attach:function(img,item,role){bind(img,item,role,false,true);},apply:function(img,item,wide,full){bind(img,item,wide,full,true);},observe:function(img,item,wide,full){bind(img,item,wide,full,false);},prepare:prepare,prefetch:prefetch};
}());

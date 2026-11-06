/* Authenticated metadata goes directly to TMDB; credentials never enter image URLs. */
(function(){
  'use strict';
  var API='https://api.themoviedb.org/3',TOKEN_KEY='weplay.tmdb.read-token.v1',pending={},pausedUntil=0,collectionLookup;
  function token(){try{return String(window.WEPLAY_SETTINGS&&WEPLAY_SETTINGS.tmdbReadToken||localStorage.getItem(TOKEN_KEY)||'').trim();}catch(ignore){return '';}}
  function available(){return !!token()||!!(window.WEPLAY_TMDB_INDEX&&WEPLAY_TMDB_INDEX.entries&&WEPLAY_TMDB_INDEX.entries.length);}
  function request(path,params){
    var secret=token();if(!secret||Date.now()<pausedUntil)return Promise.reject(new Error('TMDB temporarily unavailable'));
    var url=new URL(API+path);Object.keys(params||{}).forEach(function(key){url.searchParams.set(key,String(params[key]));});
    var abort=new AbortController(),timer=setTimeout(function(){abort.abort();},6500);
    return fetch(url.href,{credentials:'omit',headers:{Authorization:'Bearer '+secret,Accept:'application/json'},signal:abort.signal}).then(function(response){
      if(!response.ok){if(response.status===429){var wait=Number(response.headers.get('Retry-After'));pausedUntil=Date.now()+Math.max(60000,Math.min(300000,(wait||60)*1000));}if(response.status===401||response.status===403)pausedUntil=Date.now()+60000;throw new Error('TMDB request unavailable');}return response.json();
    }).finally(function(){clearTimeout(timer);});
  }
  function image(path,size){return /^\/[a-zA-Z0-9]+\.(?:jpg|png|webp)$/.test(path||'')?'https://image.tmdb.org/t/p/'+size+path:'';}
  function titleLogos(images){
    function language(logo){return logo.iso_639_1==='ru'?0:logo.iso_639_1==='en'?1:2;}
    return (images||[]).filter(function(logo){
      return /^\/[a-zA-Z0-9]+\.(?:png|svg)$/.test(logo.file_path||'')&&logo.width>=200&&logo.height>=40;
    }).sort(function(a,b){
      return language(a)-language(b)||Number(b.vote_count)-Number(a.vote_count)||Number(b.vote_average)-Number(a.vote_average)||b.width-a.width;
    }).slice(0,3).map(function(logo){
      return 'https://image.tmdb.org/t/p/'+(/\.svg$/.test(logo.file_path)?'original':'w500')+logo.file_path;
    });
  }
  function normal(value){return WePlayCatalogUnion.normal(WePlayWebCatalog.cleanTitle(value||''));}
  function collectionBackdrop(item){
    var index=window.WEPLAY_COLLECTIONS,kind=WePlayCatalogUnion.kind(item);
    if(!index||index.schema!==1||kind==='series')return '';
    var fields=WePlayCatalogUnion.fields(item),year=(String(fields.year||'').match(/(?:19|20)\d{2}/)||[])[0];
    var id=WePlayCatalogUnion.identifiers(item).tmdb;
    if(!id&&(kind!=='movie'||!year))return '';
    if(!collectionLookup){
      collectionLookup={ids:Object.create(null),names:Object.create(null)};
      index.collections.forEach(function(collection){collection.parts.forEach(function(part){
        var partYear=part.release_date.slice(0,4);
        collectionLookup.ids[part.id]=part;
        [part.title,part.original_title].concat(part.aliases||[]).map(normal).filter(Boolean).forEach(function(name){
          var key=partYear+'|'+name,parts=collectionLookup.names[key]||(collectionLookup.names[key]=Object.create(null));
          parts[part.id]=part;
        });
      });});
    }
    if(id){
      var part=collectionLookup.ids[id];
      return part&&(!year||part.release_date.slice(0,4)===year)?image(part.backdrop,'original'):'';
    }
    var matches=Object.create(null);
    [item.title,fields.original_title].map(normal).filter(Boolean).forEach(function(name){Object.assign(matches,collectionLookup.names[year+'|'+name]);});
    var keys=Object.keys(matches);
    return keys.length===1?image(matches[keys[0]].backdrop,'original'):'';
  }
  function indexed(item){
    var index=window.WEPLAY_TMDB_INDEX;if(!index||index.schema!==1||!Array.isArray(index.entries))return null;
    var fields=WePlayCatalogUnion.fields(item),kind=WePlayCatalogUnion.kind(item),year=(String(fields.year||'').match(/(?:19|20)\d{2}/)||[])[0]||'',ids=WePlayCatalogUnion.identifiers(item),names=[normal(item.title),normal(fields.original_title)].filter(Boolean);
    var exact=[];
    var found=index.entries.filter(function(entry){
      if(kind&&entry.kind!==kind||year&&entry.year!==year||!entry.art||!entry.art.tmdbAPI)return false;
      var other=entry.ids||{};
      if(Object.keys(ids).some(function(key){return other[key]&&other[key]!==ids[key];}))return false;
      if(Object.keys(ids).some(function(key){return other[key]===ids[key];})){exact.push(entry);return true;}
      return !!year&&names.some(function(name){return entry.names.indexOf(name)>=0;});
    });
    if(exact.length)found=exact;
    var unique={};found.forEach(function(entry){unique[entry.art.tmdbId]=entry;});var keys=Object.keys(unique);return keys.length===1?JSON.parse(JSON.stringify(unique[keys[0]].art)):null;
  }
  function artwork(item,refresh){
    var packaged=indexed(item);if(packaged&&(!refresh||!token()))return Promise.resolve(packaged);
    var fields=WePlayCatalogUnion.fields(item),ids=WePlayCatalogUnion.identifiers(item),kind=WePlayCatalogUnion.kind(item),type=kind==='series'?'tv':kind==='movie'?'movie':'',year=(String(fields.year||'').match(/(?:19|20)\d{2}/)||[])[0]||'',names=[normal(item.title),normal(fields.original_title)].filter(Boolean),key=type+':'+(ids.tmdb||ids.imdb||names.join('|')+':'+year);
    var selectedID=null;if(!type||!ids.tmdb&&!ids.imdb&&!year)return Promise.reject(new Error('TMDB identity incomplete'));if(pending[key])return pending[key];
    function dated(record){var date=type==='tv'?record.first_air_date:record.release_date;return !year||String(date||'').slice(0,4)===year;}
    function resolve(){
      if(ids.tmdb)return Promise.resolve(Number(ids.tmdb));
      if(ids.imdb)return request('/find/'+ids.imdb,{external_source:'imdb_id',language:'ru-RU'}).then(function(data){var found=(data[type==='tv'?'tv_results':'movie_results']||[]).filter(dated);if(found.length!==1)throw new Error('TMDB external ID not matched');return found[0].id;});
      var params={query:WePlayWebCatalog.cleanTitle(fields.original_title||item.title),language:'ru-RU',include_adult:false};params[type==='tv'?'first_air_date_year':'year']=year;
      return request('/search/'+type,params).then(function(data){var found=(data.results||[]).filter(function(record){return dated(record)&&[record.title,record.original_title,record.name,record.original_name].some(function(name){return name&&names.indexOf(normal(name))>=0;});});if(found.length!==1)throw new Error('No unambiguous TMDB match');return found[0].id;});
    }
    pending[key]=resolve().then(function(id){if(!/^[1-9]\d*$/.test(String(id)))throw new Error('Invalid TMDB ID');selectedID=String(id);return request('/'+type+'/'+id,{language:'ru-RU',append_to_response:'images,credits,external_ids',include_image_language:'ru,en,null'});}).then(function(data){
      var imdb=data.imdb_id||data.external_ids&&data.external_ids.imdb_id||'';if(String(data.id)!==selectedID||!dated(data)||ids.imdb&&imdb!==ids.imdb||ids.tmdb&&String(data.id)!==String(ids.tmdb))throw new Error('Conflicting TMDB identity');
      var backgrounds=(data.images&&data.images.backdrops||[]).filter(function(img){return img.width>=1280&&img.width/img.height>=1.45&&img.width/img.height<=2.6&&image(img.file_path,'original');}).sort(function(a,b){return Number(a.iso_639_1!==null)-Number(b.iso_639_1!==null)||Math.abs(a.aspect_ratio-16/9)-Math.abs(b.aspect_ratio-16/9)||Number(b.vote_count)-Number(a.vote_count)||Number(b.vote_average)-Number(a.vote_average)||b.width-a.width;}).slice(0,4).map(function(img){return image(img.file_path,'original');});
      var defaultBackground=image(data.backdrop_path,'original');if(defaultBackground&&backgrounds.indexOf(defaultBackground)<0)backgrounds.push(defaultBackground);
      var page='https://www.themoviedb.org/'+type+'/'+data.id,cast=(data.credits&&data.credits.cast||[]).slice(0,12).map(function(person){return{id:String(person.id),name:person.name||person.original_name||'',image:image(person.profile_path,'h632'),source:'TMDB',sourceURL:page};}).filter(function(person){return !!person.name;});
      return{tmdbAPI:true,tmdbId:String(data.id),imdbId:imdb,lookupTitle:data.original_title||data.original_name||data.title||data.name,poster:image(data.poster_path,'original'),posterThumb:image(data.poster_path,'w342'),background:backgrounds[0]||'',backgrounds:backgrounds,backgroundThumb:backgrounds[0]?backgrounds[0].replace('/original/','/w1280/'):'',backgroundSource:'TMDB',backgroundCredit:page,source:'TMDB',titleLogos:titleLogos(data.images&&data.images.logos),cast:cast,castPage:page,series:type==='tv'?{seasons:data.number_of_seasons||null,status:WePlaySeries.status(data.status),at:Date.now()}:null};
    }).finally(function(){delete pending[key];});return pending[key];
  }
  function nextPart(item){
    if(!token()||WePlayCatalogUnion.kind(item)==='series')return Promise.resolve(null);
    return artwork(item).then(function(art){return request('/movie/'+art.tmdbId,{language:'ru-RU'});}).then(function(movie){
      if(!movie.belongs_to_collection)return null;
      return request('/collection/'+movie.belongs_to_collection.id,{language:'ru-RU'}).then(function(collection){
        var today=new Date().toISOString().slice(0,10),parts=(collection.parts||[]).filter(function(part){return part.media_type==='movie'&&!part.adult&&/^\d{4}-\d{2}-\d{2}$/.test(part.release_date||'')&&part.release_date<=today;}).sort(function(a,b){return a.release_date.localeCompare(b.release_date)||Number(a.id)-Number(b.id);}),at=parts.findIndex(function(part){return String(part.id)===String(movie.id);});
        return at>=0&&parts[at+1]?parts[at+1]:null;
      });
    });
  }
  window.WePlayTMDB={available:available,artwork:artwork,indexed:indexed,collectionBackdrop:collectionBackdrop,nextPart:nextPart,titleLogos:titleLogos};
}());

/* Authenticated metadata goes directly to TMDB; credentials never enter image URLs. */
(function(){
  'use strict';
  var API='https://api.themoviedb.org/3',TOKEN_KEY='weplay.tmdb.read-token.v1',pending={},pausedUntil=0,collectionLookup;
  function token(){try{return String(window.WEPLAY_SETTINGS&&WEPLAY_SETTINGS.tmdbReadToken||localStorage.getItem(TOKEN_KEY)||'').trim();}catch(ignore){return '';}}
  function available(){return !!token()||!!(window.WEPLAY_TMDB_INDEX&&WEPLAY_TMDB_INDEX.entries&&WEPLAY_TMDB_INDEX.entries.length);}
  function request(path,params,options){
    var secret=token();if(!secret||Date.now()<pausedUntil)return Promise.reject(new Error('TMDB temporarily unavailable'));
    var url=new URL(API+path);Object.keys(params||{}).forEach(function(key){url.searchParams.set(key,String(params[key]));});
    return WePlayNetwork.request(url.href,{credentials:'omit',headers:{Authorization:'Bearer '+secret,Accept:'application/json'}},Object.assign({json:true,timeout:6500},options||{})).catch(function(error){if(error.status===429)pausedUntil=Date.now()+Math.max(60000,Math.min(300000,(error.retryAfter||60)*1000));if(error.status===401||error.status===403)pausedUntil=Date.now()+60000;throw error;});
  }

  function image(path,size){return /^\/[a-zA-Z0-9]+\.(?:jpg|png|webp)$/.test(path||'')?'https://image.tmdb.org/t/p/'+size+path:'';}
  function logoLanguage(value){return String(value||'').toLowerCase().replace('_','-').split('-')[0]||null;}
  function logoPriority(language){language=logoLanguage(language);return language==='ru'?0:language==='en'?1:!language?2:3;}
  function rankTitleLogos(values){
    var byURL=Object.create(null),ordered=[];
    (values||[]).forEach(function(value){
      var url=typeof value==='string'?value:value&&value.url,language=logoLanguage(value&&typeof value==='object'&&value.language);
      if(typeof url!=='string'||!/^https?:\/\//.test(url))return;
      if(byURL[url]){if(language&&(!byURL[url].language||logoPriority(language)<logoPriority(byURL[url].language)))byURL[url].language=language;return;}
      var record={url:url,language:language,order:ordered.length};byURL[url]=record;ordered.push(record);
    });
    return ordered.sort(function(a,b){return logoPriority(a.language)-logoPriority(b.language)||a.order-b.order;}).map(function(record){return{url:record.url,language:record.language};});
  }
  function titleLogoCandidates(images){
    var sorted=(images||[]).filter(function(logo){
      return /^\/[a-zA-Z0-9]+\.(?:png|svg)$/.test(logo.file_path||'')&&logo.width>=120&&logo.height>=32&&logo.width/logo.height>=.55;
    }).slice().sort(function(a,b){
      return logoPriority(a.iso_639_1)-logoPriority(b.iso_639_1)||(Number(b.vote_count)||0)-(Number(a.vote_count)||0)||(Number(b.vote_average)||0)-(Number(a.vote_average)||0)||b.width-a.width;
    }),counts=Object.create(null);
    return sorted.filter(function(logo){var group=logoLanguage(logo.iso_639_1)||'neutral';counts[group]=(counts[group]||0)+1;return counts[group]<=3;}).map(function(logo){return{url:'https://image.tmdb.org/t/p/'+(/\.svg$/.test(logo.file_path)?'original':'w500')+logo.file_path,language:logoLanguage(logo.iso_639_1)};});
  }
  function titleLogos(images){return titleLogoCandidates(images).slice(0,3).map(function(logo){return logo.url;});}
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
  function matchIndex(item,entries){
    var fields=WePlayCatalogUnion.fields(item),kind=WePlayCatalogUnion.kind(item),year=(String(fields.year||'').match(/(?:19|20)\d{2}/)||[])[0]||'',ids=WePlayCatalogUnion.identifiers(item),names=[normal(item.title),normal(fields.original_title)].filter(Boolean);
    var exact=[];
    var found=entries.filter(function(entry){
      if(kind&&entry.kind!==kind||year&&entry.year!==year)return false;
      var other=entry.ids||{};
      if(Object.keys(ids).some(function(key){return other[key]&&other[key]!==ids[key];}))return false;
      if(Object.keys(ids).some(function(key){return other[key]===ids[key];})){exact.push(entry);return true;}
      return !!year&&names.some(function(name){return entry.names.indexOf(name)>=0;});
    });
    if(exact.length)found=exact;
    var unique=Object.create(null);
    found.forEach(function(entry){unique[entry.kind+':'+(entry.tmdbId||entry.art.tmdbId)]=entry;});
    var keys=Object.keys(unique);
    return keys.length===1?unique[keys[0]]:null;
  }
  function indexed(item){
    var index=window.WEPLAY_TMDB_INDEX;
    if(!index||index.schema!==1||!Array.isArray(index.entries))return null;
    var entry=matchIndex(item,index.entries.filter(function(record){return record.art&&record.art.tmdbAPI;}));
    return entry?JSON.parse(JSON.stringify(entry.art)):null;
  }
  function indexedPreviews(item){
    var index=window.WEPLAY_TMDB_INDEX;
    if(!index||index.schema!==1||!Array.isArray(index.previews))return [];
    var entry=matchIndex(item,index.previews);
    return entry?entry.frames.map(function(frame){return image(frame,'original');}).filter(Boolean):[];
  }
  function artwork(item,refresh,options){
    function api(path,params){return request(path,params,options);}
    var packaged=indexed(item);if(packaged&&(!refresh||!token()))return Promise.resolve(packaged);
    var fields=WePlayCatalogUnion.fields(item),ids=WePlayCatalogUnion.identifiers(item),kind=WePlayCatalogUnion.kind(item),type=kind==='series'?'tv':kind==='movie'?'movie':'',year=(String(fields.year||'').match(/(?:19|20)\d{2}/)||[])[0]||'',names=[normal(item.title),normal(fields.original_title)].filter(Boolean);
    var key=[type,year,ids.tmdb,ids.imdb,names.join('|')].join(':')+(options&&options.media?'|media':'');
    var selectedID=null;
    if(!ids.imdb&&!(type&&ids.tmdb)&&(!year||!names.length))return Promise.reject(new Error('TMDB identity incomplete'));
    if(pending[key])return pending[key];
    function dated(record,mediaType){var date=mediaType==='tv'?record.first_air_date:record.release_date;return !year||String(date||'').slice(0,4)===year;}
    function matchesName(record){
      return [record.title,record.original_title,record.name,record.original_name].some(function(name){return name&&names.indexOf(normal(name))>=0;});
    }
    function resolve(){
      if(ids.tmdb&&type)return Promise.resolve({id:ids.tmdb,type:type});
      if(ids.imdb)return api('/find/'+ids.imdb,{external_source:'imdb_id',language:'ru-RU'}).then(function(data){
        var found=[];
        (type?[type]:['movie','tv']).forEach(function(mediaType){
          (data[mediaType+'_results']||[]).forEach(function(record){
            if(dated(record,mediaType)&&(!ids.tmdb||String(record.id)===ids.tmdb))found.push({id:record.id,type:mediaType});
          });
        });
        if(found.length!==1)throw new Error('TMDB external ID not matched');
        return found[0];
      });
      function search(query){
        var params={query:WePlayWebCatalog.cleanTitle(query),language:'ru-RU',include_adult:false};
        if(type)params[type==='tv'?'first_air_date_year':'year']=year;
        return api('/search/'+(type||'multi'),params).then(function(data){
          return (data.results||[]).map(function(record){return {record:record,type:type||record.media_type};}).filter(function(match){
            return (match.type==='movie'||match.type==='tv')&&dated(match.record,match.type)&&matchesName(match.record)&&(!ids.tmdb||String(match.record.id)===ids.tmdb);
          });
        });
      }
      return search(fields.original_title||item.title).then(function(found){
        return !found.length&&item.title&&fields.original_title&&normal(item.title)!==normal(fields.original_title)?search(item.title):found;
      }).then(function(found){
        if(found.length!==1)throw new Error('No unambiguous TMDB match');
        return {id:found[0].record.id,type:found[0].type};
      });
    }
    pending[key]=resolve().then(function(match){if(!/^[1-9]\d*$/.test(String(match.id)))throw new Error('Invalid TMDB ID');selectedID=String(match.id);type=match.type;return api('/'+type+'/'+selectedID,{language:'ru-RU',append_to_response:'images,credits,external_ids',include_image_language:'ru,en,null'});}).then(function(data){
      var imdb=data.imdb_id||data.external_ids&&data.external_ids.imdb_id||'';if(String(data.id)!==selectedID||!dated(data,type)||ids.imdb&&imdb!==ids.imdb||ids.tmdb&&String(data.id)!==String(ids.tmdb))throw new Error('Conflicting TMDB identity');
      var backgrounds=(data.images&&data.images.backdrops||[]).filter(function(img){return img.width>=1280&&img.width/img.height>=1.45&&img.width/img.height<=2.6&&image(img.file_path,'original');}).sort(function(a,b){return Number(a.iso_639_1!==null)-Number(b.iso_639_1!==null)||Math.abs(a.aspect_ratio-16/9)-Math.abs(b.aspect_ratio-16/9)||Number(b.vote_count)-Number(a.vote_count)||Number(b.vote_average)-Number(a.vote_average)||b.width-a.width;}).slice(0,4).map(function(img){return image(img.file_path,'original');});
      var defaultBackground=image(data.backdrop_path,'original');if(defaultBackground&&backgrounds.indexOf(defaultBackground)<0)backgrounds.push(defaultBackground);
      var page='https://www.themoviedb.org/'+type+'/'+data.id,cast=(data.credits&&data.credits.cast||[]).slice(0,12).map(function(person){return{id:String(person.id),name:person.name||person.original_name||'',image:image(person.profile_path,'h632'),source:'TMDB',sourceURL:page};}).filter(function(person){return !!person.name;});
      return{tmdbAPI:true,tmdbId:String(data.id),imdbId:imdb,lookupTitle:data.original_title||data.original_name||data.title||data.name,poster:image(data.poster_path,'original'),posterThumb:image(data.poster_path,'w342'),background:backgrounds[0]||'',backgrounds:backgrounds,backgroundThumb:backgrounds[0]?backgrounds[0].replace('/original/','/w1280/'):'',backgroundSource:'TMDB',backgroundCredit:page,source:'TMDB',titleLogos:titleLogos(data.images&&data.images.logos),titleLogoCandidates:titleLogoCandidates(data.images&&data.images.logos),cast:cast,castPage:page,series:type==='tv'?{seasons:data.number_of_seasons||null,status:WePlaySeries.status(data.status),at:Date.now()}:null};
    }).finally(function(){delete pending[key];});return pending[key];
  }
  function nextPart(item,options){
    if(!token()||WePlayCatalogUnion.kind(item)==='series')return Promise.resolve(null);
    return artwork(item,false,options).then(function(art){return /\/movie\//.test(art.castPage||'')?request('/movie/'+art.tmdbId,{language:'ru-RU'},options):null;}).then(function(movie){
      if(!movie||!movie.belongs_to_collection)return null;
      return request('/collection/'+movie.belongs_to_collection.id,{language:'ru-RU'},options).then(function(collection){
        var today=new Date().toISOString().slice(0,10),parts=(collection.parts||[]).filter(function(part){return part.media_type==='movie'&&!part.adult&&/^\d{4}-\d{2}-\d{2}$/.test(part.release_date||'')&&part.release_date<=today;}).sort(function(a,b){return a.release_date.localeCompare(b.release_date)||Number(a.id)-Number(b.id);}),at=parts.findIndex(function(part){return String(part.id)===String(movie.id);});
        return at>=0&&parts[at+1]?parts[at+1]:null;
      });
    });
  }
  window.WePlayTMDB={available:available,artwork:artwork,indexed:indexed,indexedPreviews:indexedPreviews,collectionBackdrop:collectionBackdrop,nextPart:nextPart,titleLogos:titleLogos,titleLogoCandidates:titleLogoCandidates,rankTitleLogos:rankTitleLogos,logoPriority:logoPriority};
}());

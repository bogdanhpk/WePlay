/* Authenticated metadata goes directly to TMDB; credentials never enter image URLs. */
(function(){
  'use strict';
  var API='https://api.themoviedb.org/3',TOKEN_KEY='weplay.tmdb.read-token.v1',pending={},pausedUntil=0;
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
  function normal(value){return WePlayCatalogUnion.normal(WePlayWebCatalog.cleanTitle(value||''));}
  function indexed(item){
    var index=window.WEPLAY_TMDB_INDEX;if(!index||index.schema!==1||!Array.isArray(index.entries))return null;
    var fields=WePlayCatalogUnion.fields(item),kind=WePlayCatalogUnion.kind(item),year=(String(fields.year||'').match(/(?:19|20)\d{2}/)||[])[0]||'',ids=WePlayCatalogUnion.identifiers(item),names=[normal(item.title),normal(fields.original_title)].filter(Boolean);
    var found=index.entries.filter(function(entry){if(entry.kind!==kind||entry.year!==year||!entry.art||!entry.art.tmdbAPI)return false;var other=entry.ids||{};if(Object.keys(ids).some(function(key){return other[key]&&other[key]!==ids[key];}))return false;return Object.keys(ids).some(function(key){return other[key]===ids[key];})||names.some(function(name){return entry.names.indexOf(name)>=0;});});
    var unique={};found.forEach(function(entry){unique[entry.art.tmdbId]=entry;});var keys=Object.keys(unique);return keys.length===1?JSON.parse(JSON.stringify(unique[keys[0]].art)):null;
  }
  function artwork(item){
    var packaged=indexed(item);if(packaged)return Promise.resolve(packaged);
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
      var backgrounds=(data.images&&data.images.backdrops||[]).filter(function(img){return img.width>=1280&&img.height>=720&&img.width/img.height>=1.45&&img.width/img.height<=2.6&&image(img.file_path,'original');}).sort(function(a,b){return Number(a.iso_639_1!==null)-Number(b.iso_639_1!==null)||Math.abs(a.aspect_ratio-16/9)-Math.abs(b.aspect_ratio-16/9)||Number(b.vote_count)-Number(a.vote_count)||Number(b.vote_average)-Number(a.vote_average)||b.width-a.width;}).slice(0,4).map(function(img){return image(img.file_path,'original');});
      var defaultBackground=image(data.backdrop_path,'original');if(defaultBackground&&backgrounds.indexOf(defaultBackground)<0)backgrounds.push(defaultBackground);
      var page='https://www.themoviedb.org/'+type+'/'+data.id,cast=(data.credits&&data.credits.cast||[]).slice(0,12).map(function(person){return{id:String(person.id),name:person.name||person.original_name||'',image:image(person.profile_path,'h632'),source:'TMDB',sourceURL:page};}).filter(function(person){return !!person.name;});
      return{tmdbAPI:true,tmdbId:String(data.id),imdbId:imdb,lookupTitle:data.original_title||data.original_name||data.title||data.name,poster:image(data.poster_path,'original'),posterThumb:image(data.poster_path,'w342'),background:backgrounds[0]||'',backgrounds:backgrounds,backgroundThumb:backgrounds[0]?backgrounds[0].replace('/original/','/w1280/'):'',backgroundSource:'TMDB',backgroundCredit:page,source:'TMDB',cast:cast,castPage:page,series:type==='tv'?{seasons:data.number_of_seasons||null,status:WePlaySeries.status(data.status),at:Date.now()}:null};
    }).finally(function(){delete pending[key];});return pending[key];
  }
  window.WePlayTMDB={available:available,artwork:artwork,indexed:indexed};
}());

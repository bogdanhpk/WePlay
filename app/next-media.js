/* A sequel is selected by verified franchise order, never guessed from a title suffix. */
(function(){
  'use strict';
  function names(item){var x=WePlayCatalogUnion.fields(item);return[item.title,x.original_title].map(WePlayCatalogUnion.normal).filter(Boolean);}
  function matches(item,part){
    if(WePlayCatalogUnion.kind(item)==='series')return false;
    var ids=WePlayCatalogUnion.identifiers(item),year=(String(WePlayCatalogUnion.fields(item).year||'').match(/(?:19|20)\d{2}/)||[])[0];
    if(ids.tmdb)return String(ids.tmdb)===String(part.id);
    return year===String(part.release_date||'').slice(0,4)&&names(item).some(function(name){return[part.title,part.original_title].map(WePlayCatalogUnion.normal).indexOf(name)>=0;});
  }
  function indexed(item){
    var data=window.WEPLAY_COLLECTIONS;if(!data||data.schema!==1||WePlayCatalogUnion.kind(item)==='series')return{known:false,next:null};
    var today=new Date().toISOString().slice(0,10),found=[];
    (data.collections||[]).forEach(function(collection){var parts=collection.parts.filter(function(part){return part.release_date<=today;}).slice().sort(function(a,b){return a.release_date.localeCompare(b.release_date)||Number(a.id)-Number(b.id);}),at=parts.findIndex(function(part){return matches(item,part);});if(at>=0)found.push({known:true,next:parts[at+1]||null});});
    return found.length===1?found[0]:{known:false,next:null};
  }
  function aborted(signal){if(signal&&signal.aborted)throw Object.assign(new Error('Cancelled'),{name:'AbortError'});}
  function resolve(item,options){
    options=options||{};var signal=options.signal,entry=indexed(item);aborted(signal);
    if(WePlayCatalogUnion.kind(item)==='series')return Promise.resolve(null);
    var lookup=entry.known?Promise.resolve(entry.next):WePlayTMDB.nextPart(item).catch(function(){return null;});
    return lookup.then(function(part){
      aborted(signal);if(!part)return null;
      function pick(items){return items.filter(function(candidate){return !WePlayCatalogUnion.same(item,candidate)&&matches(candidate,part);})[0]||null;}
      var known=pick(WePlayCatalog.searchKnown());if(known)return{item:known,title:known.title,caption:part.release_date.slice(0,4),kind:'movie'};
      var year=part.release_date.slice(0,4),queries=[part.title+' '+year];if(part.original_title&&part.original_title!==part.title)queries.push(part.original_title+' '+year);
      function search(at){aborted(signal);if(at>=queries.length)return Promise.resolve(null);return WePlaySearch.search(queries[at],{signal:signal}).then(function(result){aborted(signal);var candidate=pick(result.items);return candidate?{item:candidate,title:candidate.title,caption:year,kind:'movie'}:search(at+1);});}
      return search(0);
    });
  }
  window.WePlayNextMedia={resolve:resolve,indexed:indexed,matches:matches};
}());

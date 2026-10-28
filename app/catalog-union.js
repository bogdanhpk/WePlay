/* A title has one card and multiple source records. No fuzzy title matching. */
(function(){
  'use strict';
  var aliases=Object.create(null),buckets=Object.create(null),sequence=0;
  function fields(item){var x=item&&item.xfields||{};if(typeof x==='string')try{x=JSON.parse(x);}catch(ignore){x={};}var normalized=Object.assign({},x);Object.keys(x).forEach(function(k){if(k.indexOf('xfvalue_')===0&&!normalized[k.slice(8)])normalized[k.slice(8)]=x[k];});return normalized;}
  function clean(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&(?:laquo|raquo|nbsp);/g,' ').replace(/\s+/g,' ').trim();}
  function normal(value){return clean(value).toLowerCase().replace(/ё/g,'е').replace(/\s+смотреть\s+онлайн.*$/,'').replace(/\s*\((?:(?:фильм|сериал)\s*)?(?:19|20)\d{2}(?:\s*[-–]\s*(?:19|20)\d{2})?\)\s*$/,'').replace(/\s*\(\d+(?:\s*[-–]\s*\d+)?\s*сезон[^)]*\)\s*$/,'').replace(/[^a-zа-я0-9]+/g,' ').trim();}
  function year(item){var m=clean(fields(item).year).match(/(?:19|20)\d{2}/);return m?m[0]:'';}
  function declared(value){value=clean(value).toLowerCase().replace(/[_-]+/g,' ');if(/^(?:series|serial|tv|tvseries|tv series|tv show|miniseries|сериал|телесериал|мультсериал|аниме сериал)$/.test(value))return'series';if(/^(?:movie|film|feature film|tv movie|short|фильм|мультфильм|аниме фильм)$/.test(value))return'movie';return'';}
  function kind(item){
    if(!item)return'';var verified=declared(item._kindVerified);if(verified)return verified;
    var x=fields(item),types=[item._kind,x.type,x.media_type,x.content_type,item.media_type].map(declared),raw=String(item._url||'')+' '+String(x.film||'')+' '+String(x.kinopoisk_url||'');
    var seasons=['number_of_seasons','numberOfSeasons','season_count','seasons_count'].some(function(key){var value=clean(x[key]===undefined?item[key]:x[key]),match=value.match(/^(\d{1,3})(?:\s*(?:сезон(?:а|ов)?|seasons?))?$/i);return match&&Number(match[1])>0&&Number(match[1])<=500;});
    if(types.indexOf('series')>=0||/\/(?:series|serials|serialy|zarubezhnye-serialy|multserialy)\//i.test(raw))return'series';
    if(types.indexOf('movie')>=0)return'movie';if(seasons||/мультсериал|телесериал|аниме[ -]сериал/i.test(x.janre||''))return'series';var hint=declared(item._kindHint);if(hint)return hint;
    return /\/(?:movie|films|filmy|multfilmy)\//i.test(raw)?'movie':'';
  }
  function names(item){var x=fields(item);return [normal(item.title),normal(x.original_title)].filter(function(v,i,a){return v&&a.indexOf(v)===i;});}
  function ids(item){var x=fields(item),out={},v=item._video;['kp','imdb','tmdb'].forEach(function(type){var raw=type==='kp'?(x.kinopoisk_id||x.kp_id||x.kinopoisk_url||''):type==='imdb'?(x.imdb_id||x.imdb_url||''):(x.tmdb_id||'');if(type==='kp'&&v&&v.aggregator==='kp')raw=v.titleId;var m=String(raw).match(type==='imdb'?/\btt\d+\b/:/^\d+$|\/(?:film|series)\/(\d+)/);if(m)out[type]=m[1]||m[0];});return out;}
  function same(a,b){
    if(!a||!b)return false;if(String(a.id)===String(b.id))return true;
    var ak=kind(a),bk=kind(b);if(ak&&bk&&ak!==bk)return false;
    var ai=ids(a),bi=ids(b),shared=false,conflict=false;Object.keys(ai).forEach(function(k){if(bi[k]){if(ai[k]===bi[k])shared=true;else conflict=true;}});if(conflict)return false;if(shared)return true;
    var ay=year(a),by=year(b);if(!ay||ay!==by||!ak||!bk)return false;
    var an=names(a),bn=names(b);return an.some(function(n){return bn.indexOf(n)>=0;});
  }
  function tokens(item){var out=[],external=ids(item),y=year(item);Object.keys(external).forEach(function(k){out.push(k+':'+external[k]);});if(y)names(item).forEach(function(n){out.push('name:'+y+':'+n);});return out;}
  function root(group){while(group&&group.parent)group=group.parent;return group;}
  function raw(item){var copy=Object.assign({},item);delete copy._alternatives;delete copy._group;delete copy._displayId;copy.xfields=Object.assign({},fields(item));return copy;}
  function idConflict(a,b){a=ids(a);b=ids(b);return Object.keys(a).some(function(k){return b[k]&&a[k]!==b[k];});}
  function compatible(group,item){return !group.variants.some(function(v){return idConflict(v,item)||kind(v)&&kind(item)&&kind(v)!==kind(item);});}
  function groupMatches(group,item){return group.variants.some(function(v){return same(v,item);})&&compatible(group,item);}
  function attach(group,item){
    var id=String(item.id),at=group.variants.findIndex(function(v){return String(v.id)===id;});
    if(at>=0){var previous=group.variants[at],next=raw(Object.assign({},previous,item));next.xfields=Object.assign({},fields(previous));Object.keys(fields(item)).forEach(function(k){if(fields(item)[k]!==''&&fields(item)[k]!==null&&fields(item)[k]!==undefined)next.xfields[k]=fields(item)[k];});group.variants[at]=next;}
    else group.variants.push(raw(item));
    aliases[id]=group;tokens(group.variants[at>=0?at:group.variants.length-1]).forEach(function(k){var bucket=buckets[k]||(buckets[k]=[]);if(bucket.indexOf(group)<0)bucket.push(group);});
  }
  function addOne(item){
    if(!item||!item.id||!item.title)return null;
    var candidates=[],id=String(item.id),existing=root(aliases[id]);
    if(existing){
      attach(existing,item);item=existing.variants.filter(function(v){return String(v.id)===id;})[0];
      // A verified type correction must not turn an unrelated same-name movie into a series.
      if(!compatible(existing,item)){existing.variants=existing.variants.filter(function(v){return String(v.id)!==id;});if(String(existing.id)===id)existing.id=existing.variants[0].id;delete aliases[id];existing=null;}
    }
    if(existing)candidates.push(existing);
    tokens(item).forEach(function(k){(buckets[k]||[]).forEach(function(g){g=root(g);if(candidates.indexOf(g)<0&&groupMatches(g,item))candidates.push(g);});});
    candidates.sort(function(a,b){return a.order-b.order;});var group=candidates[0]||{id:item.id,order:sequence++,variants:[]};
    candidates.slice(1).forEach(function(other){if(other.variants.every(function(v){return compatible(group,v);})){other.variants.forEach(function(v){attach(group,v);});other.parent=group;}});attach(group,item);return group;
  }
  function view(group){
    group=root(group);if(!group)return null;var variants=group.variants.slice(),best=variants[0];
    variants.forEach(function(v){if((v._detail?2:0)+(fields(v).film?4:0)>(best._detail?2:0)+(fields(best).film?4:0))best=v;});
    var item=raw(best),x=item.xfields;variants.forEach(function(v){Object.keys(fields(v)).forEach(function(k){if(k!=='film'&&!x[k])x[k]=fields(v)[k];});});
    ['full_story','short_story','descr'].forEach(function(key){if(!item[key])variants.some(function(v){if(v[key]){item[key]=v[key];return true;}return false;});});variants.some(function(v){if(declared(v._kindVerified)){item._kindVerified=v._kindVerified;return true;}return false;});item.id=group.id;item._group=true;item._displayId=best.id;item._alternatives=variants.map(raw);return item;
  }
  function find(id){return view(aliases[String(id)]);}
  function combine(items){var groups=[];(items||[]).forEach(function(item){var records=item&&item._alternatives&&item._alternatives.length?item._alternatives:[item];records.forEach(function(record){var g=addOne(record);if(g)groups.push(g);});});var seen=[];return groups.map(root).filter(function(g){if(seen.indexOf(g)>=0)return false;seen.push(g);return true;}).map(view);}
  function unresolved(items){var out=[],seen={};function collect(v){if(!v._kindVerified&&!seen[String(v.id)]){seen[String(v.id)]=true;out.push(raw(v));}}
    (items||[]).forEach(function(item){var group=root(aliases[String(item.id)]),records=group?group.variants:[item];records.forEach(function(v){var y=year(v),n=names(v);if(!y)return;tokens(v).filter(function(k){return k.indexOf('name:')===0;}).forEach(function(k){(buckets[k]||[]).forEach(function(g){g=root(g);g.variants.forEach(function(other){if(String(other.id)===String(v.id)||idConflict(other,v)||year(other)!==y||!names(other).some(function(name){return n.indexOf(name)>=0;}))return;if(!kind(v)||!kind(other)||kind(v)!==kind(other)){collect(v);collect(other);}});});});});});return out;}
  window.WePlayCatalogUnion={combine:combine,unresolved:unresolved,find:find,same:same,normal:normal,kind:kind,fields:fields,identifiers:ids,variants:function(item){var found=item&&find(item.id);return found?found._alternatives:item&&item._alternatives?item._alternatives:item?[raw(item)]:[];},canonical:function(id){var g=root(aliases[String(id)]);return g?String(g.id):String(id);}};
}());

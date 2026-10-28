/* Balanced, recent, rated titles for the homepage promotion. */
(function(){
  'use strict';
  function rating(value){var raw=String(value===undefined?'':value).trim().replace(',','.'),n=/^\d{1,2}(?:\.\d+)?$/.test(raw)?Number(raw):0;return n>0&&n<=10?n:0;}
  function yearOf(item){var match=String(WePlayCatalogUnion.fields(item).year||'').match(/(?:19|20)\d{2}/);return match?Number(match[0]):0;}
  function score(item){var x=WePlayCatalogUnion.fields(item);return rating(x.kp_rating)||rating(x.imdb_rating);}
  function kind(item){if(WePlayCatalogUnion.kind(item)==='series')return'series';var x=WePlayCatalogUnion.fields(item);return item._promoKind==='cartoons'||/мульт|анимац|animation|anime/i.test(String(x.janre||'')+' '+String(x.type||''))?'cartoons':'films';}
  function select(groups,year,limit){
    limit=Math.max(1,Math.min(12,limit||12));var all=[],cartoons={};Object.keys(groups||{}).forEach(function(key){(groups[key]||[]).forEach(function(item){all.push(item);if(key==='cartoons')cartoons[String(item.id)]=true;});});
    var unique=WePlayCatalogUnion.combine(all),cartoonIds={};Object.keys(cartoons).forEach(function(id){cartoonIds[WePlayCatalogUnion.canonical(id)]=true;});var buckets={films:[],cartoons:[],series:[]};
    unique.forEach(function(item){var premiere=yearOf(item),value=score(item);if(premiere<year-1||premiere>year||value<7)return;var type=kind(item);if(type!=='series'&&cartoonIds[WePlayCatalogUnion.canonical(item.id)])type='cartoons';buckets[type].push(Object.assign({},item,{_promoKind:type}));});
    function compare(a,b){return yearOf(b)-yearOf(a)||score(b)-score(a)||String(a.id).localeCompare(String(b.id));}Object.keys(buckets).forEach(function(key){buckets[key].sort(compare);});
    var result=[],order=['films','cartoons','series'],at={films:0,cartoons:0,series:0};while(result.length<limit){var added=false;order.forEach(function(key){if(result.length<limit&&at[key]<buckets[key].length){result.push(buckets[key][at[key]++]);added=true;}});if(!added)break;}return result;
  }
  window.WePlayPromo={select:select,score:score,year:yearOf,kind:kind};
}());

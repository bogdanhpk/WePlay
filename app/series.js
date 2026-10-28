/* Whole-series metadata. A final available episode does not prove a show ended. */
(function(){
  'use strict';
  function clean(value){return String(value===undefined||value===null?'':value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
  function count(value){if(typeof value!=='number'&&typeof value!=='string')return null;var m=clean(value).match(/^(\d+)(?:\s*(?:сезон(?:а|ов)?|seasons?))?$/i),n=m&&Number(m[1]);return n>0&&n<=500?n:null;}
  function status(value){
    var text=clean(value).toLowerCase().replace(/ё/g,'е').replace(/\s*\((?:19|20)\d{2}\)\s*$/,'').replace(/[.!]$/,'');
    if(/^(?:ended|completed|finished|завершен|завершился|завершено|закончен)$/.test(text))return'ended';
    if(/^(?:canceled|cancelled|закрыт|отменен)$/.test(text))return'canceled';
    if(/^(?:returning|returning series|ongoing|продолжается|возвращается|сериал продолжается)$/.test(text))return'returning';
    if(/^(?:production|in production|в производстве)$/.test(text))return'production';
    if(/^(?:planned|анонсирован|запланирован)$/.test(text))return'planned';
    if(/^(?:pilot|пилот)$/.test(text))return'pilot';return null;
  }
  function normalize(data){if(!data)return null;var seasons=count(data.seasons),state=status(data.status);return seasons||state?{seasons:seasons,status:state}:null;}
  function fromItem(item){
    if(WePlayCatalogUnion.kind(item)!=='series')return null;var x=WePlayCatalogUnion.fields(item),seasons=null,state=null;
    ['number_of_seasons','numberOfSeasons','season_count','seasons_count'].some(function(key){seasons=count(x[key]===undefined?item[key]:x[key]);return !!seasons;});
    ['series_status','show_status','status','creativeWorkStatus'].some(function(key){state=status(x[key]===undefined?item[key]:x[key]);return !!state;});return normalize({seasons:seasons,status:state});
  }
  function merge(base,preferred){base=normalize(base);preferred=normalize(preferred);return normalize({seasons:preferred&&preferred.seasons||base&&base.seasons,status:preferred&&preferred.status||base&&base.status});}
  function formatCount(value){var n=count(value);if(!n)return'';var ten=n%10,hundred=n%100;return n+' '+(ten===1&&hundred!==11?'сезон':ten>=2&&ten<=4&&(hundred<12||hundred>14)?'сезона':'сезонов');}
  function label(value){return{ended:'Завершён',canceled:'Закрыт',returning:'Продолжается',production:'В производстве',planned:'Анонсирован',pilot:'Пилот'}[status(value)]||'';}
  function documentOf(value){return value&&value.querySelectorAll?value:new DOMParser().parseFromString(String(value||''),'text/html');}
  function seriesId(page){try{var url=new URL(page),match=url.hostname==='www.themoviedb.org'&&url.pathname.match(/^\/tv\/(\d+)(?:-|\/|$)/);return match&&match[1]||null;}catch(ignore){return null;}}
  function parsePage(page,url){
    var id=seriesId(url);if(!id)return null;var doc=documentOf(page),info={seasons:null,status:null,seasonsURL:null,at:Date.now()};
    function schema(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(schema);return;}if(value['@type']==='TVSeries'){info.seasons=count(value.numberOfSeasons)||info.seasons;info.status=status(value.creativeWorkStatus)||info.status;}if(value['@graph'])schema(value['@graph']);}
    Array.prototype.forEach.call(doc.querySelectorAll('script[type="application/ld+json"]'),function(script){try{schema(JSON.parse(script.textContent));}catch(ignore){}});
    Array.prototype.forEach.call(doc.querySelectorAll('section.facts p'),function(row){var strong=row.querySelector('strong');if(!strong)return;var key=clean(strong.textContent),value=clean(row.textContent).slice(key.length).replace(/^\s*:\s*/,'').trim();if(/^(?:статус|status):?$/i.test(key))info.status=status(value)||info.status;if(/^(?:сезонов|количество сезонов|number of seasons):?$/i.test(key))info.seasons=count(value)||info.seasons;});
    Array.prototype.some.call(doc.querySelectorAll('a[href]'),function(link){try{var target=new URL(link.getAttribute('href'),url);if(target.hostname==='www.themoviedb.org'&&new RegExp('^/tv/'+id+'(?:-[^/]+)?/seasons/?$').test(target.pathname)){target.searchParams.set('language','ru-RU');info.seasonsURL=target.href;return true;}}catch(ignore){}return false;});
    return info.seasons||info.status||info.seasonsURL?info:null;
  }
  function parseSeasons(page,url){
    var id=seriesId(url);if(!id||!/\/seasons\/?$/.test(new URL(url).pathname))return null;var doc=documentOf(page),seen={};
    Array.prototype.forEach.call(doc.querySelectorAll('.season_wrapper .season h2 a[href],.season_wrapper .season h3 a[href]'),function(link){try{var target=new URL(link.getAttribute('href'),url),match=target.hostname==='www.themoviedb.org'&&target.pathname.match(new RegExp('^/tv/'+id+'(?:-[^/]+)?/season/(\\d+)/?$'));if(match&&Number(match[1])>0)seen[Number(match[1])]=true;}catch(ignore){}});
    return count(Object.keys(seen).length);
  }
  window.WePlaySeries={count:count,status:status,normalize:normalize,fromItem:fromItem,merge:merge,formatCount:formatCount,label:label,parsePage:parsePage,parseSeasons:parseSeasons};
}());

/* Catalog runtimes are minutes; player and playlist durations are seconds. */
(function(){
  'use strict';
  var cache={},pending={},failed={},KEY='lord.duration.v1';
  try{cache=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(ignore){}
  function value(low,high,episode,approximate){low=Number(low);high=Number(high);if(!isFinite(low)||!isFinite(high)||low<=0||high<low||high>1440)return null;low=Math.max(1,Math.round(low));high=Math.max(low,Math.round(high));return{min:low,max:high,episode:!!episode,approximate:!!approximate};}
  function minutes(raw){
    if(raw===null||raw===undefined||typeof raw==='object')return null;
    var text=String(raw).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().toLowerCase(),m;
    if(!text||/^[-−–—]/.test(text))return null;
    if(/^\d+(?:[.,]\d+)?$/.test(text)){var n=Number(text.replace(',','.'));return n>0&&n<=1440?{min:n,max:n}:null;}
    m=/^p(?:(\d+)d)?t(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(text);
    if(m){var total=Number(m[1]||0)*1440+Number(m[2]||0)*60+Number(m[3]||0)+Number(m[4]||0)/60;return total>0&&total<=1440?{min:total,max:total}:null;}
    m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if(m){if(Number(m[2])>=60||Number(m[3]||0)>=60)return null;var clock=Number(m[1])*60+Number(m[2])+Number(m[3]||0)/60;return clock>0&&clock<=1440?{min:clock,max:clock}:null;}
    m=/(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(?:мин(?:ут[аы]?)?|minutes?|min)(?=\s|[./]|$)/.exec(text);
    if(m){var a=Number(m[1].replace(',','.')),b=Number(m[2].replace(',','.'));return a>0&&b>=a&&b<=1440?{min:a,max:b}:null;}
    var hours=/(\d+(?:[.,]\d+)?)\s*(?:час(?:а|ов)?|ч\.?|hours?|h)(?=\s|\d|[./]|$)/.exec(text),mins=/(\d+(?:[.,]\d+)?)\s*(?:мин(?:ут[аы]?)?\.?|minutes?|min|m)(?=\s|[./]|$)/.exec(text),secs=/(\d+(?:[.,]\d+)?)\s*(?:сек(?:унд[аы]?)?|seconds?|sec|s)(?=\s|[./]|$)/.exec(text);
    if(hours||mins||secs){var total=(hours?Number(hours[1].replace(',','.'))*60:0)+(mins?Number(mins[1].replace(',','.')):0)+(secs?Number(secs[1].replace(',','.'))/60:0);return total>0&&total<=1440?{min:total,max:total}:null;}
    return null;
  }
  function fromItem(item){
    var x=WePlayCatalogUnion.fields(item),episode=WePlayCatalogUnion.kind(item)==='series';
    var keys=['episode_runtime','duration_minutes','runtime_minutes','runtime','duration','dlitelnost','prodolzhitelnost'];
    for(var i=0;i<keys.length;i++){var parsed=minutes(x[keys[i]]===undefined?item[keys[i]]:x[keys[i]]);if(parsed)return value(parsed.min,parsed.max,episode||keys[i]==='episode_runtime',/≈|~|около|about/i.test(String(x[keys[i]]||'')));}
    return fromSeconds([x.duration_seconds],episode,false);
  }
  function fromSeconds(values,episode,approximate){var valid=values.map(Number).filter(function(n){return isFinite(n)&&n>0&&n<=86400;});return valid.length?value(Math.min.apply(Math,valid)/60,Math.max.apply(Math,valid)/60,episode,approximate||valid.length<values.length):null;}
  function part(n){var hours=Math.floor(n/60),mins=n%60;return (hours?hours+' ч':'')+(hours&&mins?' ':'')+(mins||!hours?mins+' мин':'');}
  function format(runtime,compact){if(!runtime)return'';var text=runtime.min===runtime.max?part(runtime.min):runtime.max<60?runtime.min+'–'+runtime.max+' мин':part(runtime.min)+' — '+part(runtime.max);return(runtime.approximate?'Около ':'')+text+(compact&&runtime.episode?' / серия':'');}
  function key(item,preferred){var ids=(item._alternatives||[item]).map(function(v){return String(v.id);}).sort(),mode=WePlayCatalog.snapshot().mode;return preferred?'source:'+preferred:mode+':'+ids.join(',');}
  function save(k,runtime){cache[k]={at:Date.now(),value:runtime};var keys=Object.keys(cache).sort(function(a,b){return cache[a].at-cache[b].at;});while(keys.length>200)delete cache[keys.shift()];try{localStorage.setItem(KEY,JSON.stringify(cache));}catch(ignore){}}
  function stated(item,preferred){
    var records=item._alternatives||[item],mode=WePlayCatalog.snapshot().mode,record=preferred?records.filter(function(v){return String(v.id)===String(preferred);})[0]:mode==='auto'?item:records.filter(function(v){return v._source===mode;})[0]||item;
    return record&&fromItem(record)||null;
  }
  function get(item,preferred){
    var k=key(item,preferred),known=stated(item,preferred),entry=cache[k],stored=entry&&entry.value,valid=stored&&value(stored.min,stored.max,stored.episode,stored.approximate);if(known){save(k,known);return Promise.resolve(known);}
    if(valid&&Date.now()-entry.at<86400000)return Promise.resolve(valid);if(pending[k])return pending[k];if(failed[k]&&Date.now()-failed[k]<600000)return Promise.resolve(valid||null);
    pending[k]=WePlayCatalog.duration(item,preferred).then(function(runtime){if(runtime)save(k,runtime);else failed[k]=Date.now();return runtime||valid||null;}).catch(function(){failed[k]=Date.now();return valid||null;}).finally(function(){delete pending[k];});return pending[k];
  }
  window.WePlayDuration={minutes:minutes,fromItem:fromItem,fromSeconds:fromSeconds,format:format,stated:stated,get:get};
}());

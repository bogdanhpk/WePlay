/* Local viewing history. Stream addresses and provider credentials are never stored here. */
(function(){
  'use strict';
  var KEY='lord.watch-progress.v1',LIMIT=100,records=[];
  function finite(value,max){return typeof value==='number'&&isFinite(value)&&value>=0&&value<=max;}
  function number(value,max){var n=Number(value);return n>0&&n===Math.floor(n)&&n<=max?n:null;}
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function metadata(item){
    var base=(item._alternatives||[]).filter(function(v){return String(v.id)===String(item.id);})[0]||item;
    var x=WePlayCatalogUnion.fields(item),out={id:String(item.id),title:String(item.title||'').slice(0,300),_source:base._source||'primary',_kind:WePlayCatalogUnion.kind(item),xfields:{}};
    ['year','original_title','janre','kinopoisk_id','kp_id','kinopoisk_url','imdb_id','imdb_url','tmdb_id','image','download_poster','poster','poster_url','thumbnail','thumb'].forEach(function(key){if(typeof x[key]==='string'||typeof x[key]==='number')out.xfields[key]=String(x[key]).slice(0,2000);});
    return out;
  }
  function valid(record){return record&&record.item&&typeof record.item.id==='string'&&record.item.id&&typeof record.item.title==='string'&&finite(record.position,86400000)&&finite(record.duration,86400000)&&finite(record.updatedAt,1e15)&&(!record.pending||number(record.season,500)&&number(record.episode,10000));}
  try{var stored=JSON.parse(localStorage.getItem(KEY)||'null');if(stored&&stored.version===1&&Array.isArray(stored.records))records=stored.records.filter(valid).slice(0,LIMIT).map(function(r){return Object.assign({},r,{item:metadata(r.item),aliases:(r.aliases||[]).filter(function(id){return typeof id==='string'&&id.length<200;}).slice(0,20)});});}catch(ignore){}
  function matches(record,item){
    if(!item||!item.id)return false;
    if(WePlayCatalogUnion.same(record.item,item))return true;
    var aliases=[String(item.id)].concat((item._alternatives||[]).map(function(v){return String(v.id);}));return aliases.some(function(id){return (record.aliases||[]).indexOf(id)>=0;});
  }
  function get(item){var found=records.filter(function(r){return matches(r,item);}).sort(function(a,b){return b.updatedAt-a.updatedAt;})[0];return found?copy(found):null;}
  function resumable(record){return !!record&&!record.completed&&(record.pending||record.position>=1000);}
  function persist(){
    records.sort(function(a,b){return b.updatedAt-a.updatedAt;});records=records.slice(0,LIMIT);
    try{localStorage.setItem(KEY,JSON.stringify({version:1,records:records}));return true;}catch(ignore){
      // Retain the current session even when the TV's shared storage is full.
      try{localStorage.setItem(KEY,JSON.stringify({version:1,records:records.slice(0,20)}));return true;}catch(full){return false;}
    }
  }
  function update(item,sample){
    if(!item||!item.id||!sample||!finite(sample.position,86400000)||!finite(sample.duration,86400000)||sample.position<1000&&!sample.ended)return null;
    var duration=sample.duration,position=duration?Math.min(sample.position,duration):sample.position,ended=!!sample.ended||duration>0&&position/duration>=.95&&duration-position<=120000;
    var next=ended&&sample.next&&number(sample.next.season,500)&&number(sample.next.episode,10000),previous=get(item);
    var record={item:metadata(item),aliases:[String(item.id)].concat((item._alternatives||[]).map(function(v){return String(v.id);})),position:next?0:Math.round(position),duration:next?0:Math.round(duration),season:next?Number(sample.next.season):number(sample.season,500),episode:next?Number(sample.next.episode):number(sample.episode,10000),pending:!!next,completed:ended&&!next,sourceId:String(sample.sourceId||''),updatedAt:Math.max(Date.now(),records.length?records[0].updatedAt+1:0)};
    if(previous)record.aliases=record.aliases.concat(previous.aliases||[]);record.aliases=record.aliases.filter(function(id,i,a){return a.indexOf(id)===i;}).slice(0,20);
    records=records.filter(function(r){return !matches(r,item);});records.unshift(record);persist();return copy(record);
  }
  function reset(item){var previous=records;records=records.filter(function(r){return !matches(r,item);});if(persist())return true;records=previous;return false;}
  function list(){var out=[];records.forEach(function(r){if(resumable(r)&&!out.some(function(other){return matches(other,r.item);}))out.push(copy(r));});return out.slice(0,20);}
  function time(ms){var seconds=Math.floor(ms/1000),h=Math.floor(seconds/3600),m=Math.floor(seconds/60)%60,s=seconds%60;return(h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
  function label(record){if(!record)return'';var parts=[];if(record.season&&record.episode)parts.push('Сезон '+record.season,'Серия '+record.episode);if(record.pending)parts.push('Следующая серия');else if(record.position)parts.push(time(record.position)+(record.duration?' из '+time(record.duration):''));return parts.join(' · ');}
  window.WePlayProgress={get:get,update:update,reset:reset,list:list,canResume:resumable,label:label,ratio:function(r){return r&&r.duration>0?Math.max(0,Math.min(1,r.position/r.duration)):0;}};
}());

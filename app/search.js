/* Search ranks available catalog records on the TV; no search server is required. */
(function(){
  'use strict';
  var STOP=['и','в','во','на','из','по','с','со','о','об','для','а','к','у','от','за','the','a','an','and','of','in'],cache={};
  function clean(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|quot|nbsp);|&#39;/g,' ').replace(/[\u200b-\u200f\ufeff]/g,'').replace(/\s+/g,' ').trim().slice(0,160);}
  function normal(value){var s=clean(value).toLowerCase();if(s.normalize)s=s.normalize('NFKC');return s.replace(/[\u00c0-\u024f]/g,function(c){return c.normalize?c.normalize('NFD').replace(/[\u0300-\u036f]/g,''):c;}).replace(/ё/g,'е').replace(/[^a-zа-яієїґ0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function parse(value){var full=normal(value),tokens=full.split(' ').filter(Boolean),year=null;if(tokens.length>1){var last=tokens[tokens.length-1];if(/^(?:19|20)\d{2}$/.test(last)&&Number(last)<=new Date().getFullYear()+2){year=last;tokens.pop();}}var title=tokens.join(' '),words=tokens.filter(function(t){return STOP.indexOf(t)<0;});return{full:full,title:title,words:words.length?words:tokens,year:year};}
  function layout(value){var s=clean(value).toLowerCase(),latin="qwertyuiop[]asdfghjkl;'zxcvbnm,.",cyrillic='йцукенгшщзхъфывапролджэячсмитьбю',from,to;if(/[a-z]/.test(s)&&!/[а-яё]/.test(s)){from=latin;to=cyrillic;}else if(/[а-яё]/.test(s)&&!/[a-z]/.test(s)){from=cyrillic;to=latin;}else return'';return s.split('').map(function(c){var i=from.indexOf(c);return i<0?c:to[i];}).join('');}
  function distance(a,b,max){
    if(Math.abs(a.length-b.length)>max)return max+1;var prior=[],before=null;for(var j=0;j<=b.length;j++)prior[j]=j;
    for(var i=1;i<=a.length;i++){var row=[i],lowest=i;for(j=1;j<=b.length;j++){row[j]=Math.min(row[j-1]+1,prior[j]+1,prior[j-1]+(a[i-1]===b[j-1]?0:1));if(before&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],before[j-2]+1);lowest=Math.min(lowest,row[j]);}if(lowest>max)return max+1;before=prior;prior=row;}return prior[b.length];
  }
  function fields(item){return WePlayCatalogUnion.fields(item);}
  function names(item){var seen={},out=[];[item].concat(item._alternatives||[]).forEach(function(record){var x=fields(record);[record.title,x.original_title,x.title_en,x.alternative_title].forEach(function(value){var n=normal(value);if(n&&!seen[n]){seen[n]=true;out.push(n);}});});return out;}
  function textMatch(name,q){
    if(!q.title)return null;if(name===q.title)return{tier:6,edits:0,extra:0};var compact=q.title.replace(/ /g,'');if(compact.length>=5&&name.replace(/ /g,'')===compact)return{tier:5,edits:0,extra:0};
    var tokens=name.split(' ').filter(function(t){return STOP.indexOf(t)<0;}),used={},edits=0,prefix=0,positions=[];
    for(var i=0;i<q.words.length;i++){
      var word=q.words[i],best=-1,cost=Infinity,bestPrefix=false;
      for(var j=0;j<tokens.length;j++){
        if(used[j])continue;var target=tokens[j],d=Infinity,p=false;
        if(target===word)d=0;else if(i===q.words.length-1&&word.length>=2&&!/^\d+$/.test(word)&&target.indexOf(word)===0){d=.25;p=true;}
        else if(word.length>=5&&!/\d/.test(word+target)){var budget=word.length>=9?2:1;d=distance(word,target,budget);if(word[0]!==target[0])d++;if(d>budget)d=Infinity;}
        if(d<cost){cost=d;best=j;bestPrefix=p;}
      }
      if(best<0||cost===Infinity)return null;used[best]=true;positions.push(best);if(bestPrefix)prefix++;else edits+=cost;
    }
    var contiguous=positions.every(function(at,i){return i===0||at===positions[i-1]+1;}),tier=edits?2:prefix?3:contiguous&&name.indexOf(q.title)===0?5:contiguous?4:3;
    return{tier:tier,edits:edits,extra:Math.max(0,tokens.length-q.words.length)+(contiguous?0:1)};
  }
  function match(item,query){
    var q=parse(query),x=fields(item),year=String(x.year||'').match(/(?:19|20)\d{2}/),labels=names(item);if(q.year&&labels.indexOf(q.full)>=0)return{tier:7,edits:0,extra:0,year:0};if(q.year&&year&&year[0]!==q.year)return null;
    var forms=[q],converted=layout(query),best=null;if(converted&&normal(converted)!==q.full&&q.words.join('').length>=4)forms.push(parse(converted));
    labels.forEach(function(name){forms.forEach(function(form,index){var m=textMatch(name,form);if(!m)return;m.tier-=index*.5;m.year=q.year&&year?1:0;if(!best||compare(m,best)<0)best=m;});});return best;
  }
  function compare(a,b){return b.tier-a.tier||a.edits-b.edits||b.year-a.year||a.extra-b.extra;}
  function rating(item){var x=fields(item);return parseFloat(String(x.kp_rating||x.imdb_rating||'0').replace(',','.'))||0;}
  function rank(items,query){return WePlayCatalog.dedupe(items).map(function(item){return{item:item,match:match(item,query)};}).filter(function(row){return row.match;}).sort(function(a,b){return compare(a.match,b.match)||rating(b.item)-rating(a.item)||String(a.item.id).localeCompare(String(b.item.id));}).map(function(row){return row.item;});}
  function plan(query,known){
    var q=parse(query),out=[],seen={};function add(value){value=clean(value);var k=value.toLowerCase();if(value&&!seen[k]){seen[k]=true;out.push(value);}}
    add(query);if(q.year)add(q.title);var folded=normal(query);if(folded!==clean(query).toLowerCase())add(folded);var near=rank(known||[],query)[0];if(near){var m=match(near,query);if(m&&m.tier<3)add(clean(near.title));}
    var converted=layout(query);if(converted&&q.words.join('').length>=4)add(converted);
    var words=q.words.slice().sort(function(a,b){return b.length-a.length;});if(words.length>1){if(words[0].length>=4)add(words[0]);var other=words.filter(function(w){return w!==words[0]&&w.length>=4;})[0];if(other)add(other);}
    else if(words[0]&&words[0].length>=5)add(words[0].slice(0,Math.max(3,Math.min(5,Math.floor(words[0].length*.55)))));
    return out;
  }
  function aborted(signal){if(signal&&signal.aborted)throw Object.assign(new Error('Поиск отменён'),{name:'AbortError'});}
  function search(query,options){
    options=options||{};query=clean(query);if(!normal(query))return Promise.resolve({items:[],partial:false,sources:[],failed:[]});
    var signal=options.signal,sources=WePlayCatalog.searchSources(),key=sources.join(',')+'|'+normal(query),saved=cache[key];try{aborted(signal);}catch(error){return Promise.reject(error);}
    if(saved&&!options.force&&Date.now()-saved.at<300000){if(options.onUpdate)options.onUpdate(saved.data);return Promise.resolve(saved.data);}
    var known=WePlayCatalog.searchKnown(),pool=known.slice(),queries=plan(query,known).slice(0,3),used={},failed={},more={},sourceItems={},networkCount=0,matched=[];
    function result(pending){matched=rank(pool,query).slice(0,120);return{items:matched,query:query,pending:!!pending,partial:Object.keys(failed).length>0,sources:Object.keys(used),failed:Object.keys(failed),cached:!networkCount};}
    function update(){aborted(signal);if(options.onUpdate)options.onUpdate(result(true));}
    function request(source,value,page){
      aborted(signal);
      var scope={signal:signal,deadline:Date.now()+4000};return WePlayCatalog.searchRequest(source,value,page,scope).then(function(j){aborted(signal);used[source]=true;if(j._saved||j.data&&j.data.partial)failed[source]=true;else{networkCount++;delete failed[source];}var d=j.data,items=Array.isArray(d)?d:d.items||d.news||[];var matches=rank(items,query).slice(0,4);if(!matches.length&&items.length){scope.aliases=true;matches=items.slice(0,6);}return WePlayCatalog.searchDetails(matches,scope).then(function(){
        aborted(signal);pool=pool.concat(items);var own=[];
        // Ranking combines records globally. A source may finish its own query variants
        // only after a match from that source, rather than another catalog's exact hit.
        items.forEach(function(item){WePlayCatalogUnion.variants(item).forEach(function(record){if((record._source||source)===source)own.push(record);});});
        sourceItems[source]=(sourceItems[source]||[]).concat(own);
        var p=d.pagination;if(page===1&&p&&Number(p.pages)>1)(more[source]||(more[source]=[])).push({query:value,matches:own.filter(function(item){return !!match(item,query);}).length});
        update();return true;
      });}).catch(function(e){aborted(signal);failed[source]=true;return false;});
    }
    function next(source,round){
      aborted(signal);var value=queries[round];if(!value)return Promise.resolve();
      return request(source,value,1).then(function(ok){
        aborted(signal);if(!ok&&!used[source])return;
        var strong=(sourceItems[source]||[]).some(function(item){var m=match(item,query);return m&&m.tier>=4;});
        if(!strong)return next(source,round+1);
      });
    }
    update();return Promise.all(sources.map(function(source){return next(source,0);})).then(function(){
      // Give every responsive source its own next-page slot, even when a faster
      // catalog already filled the results. Keep work bounded on older televisions.
      aborted(signal);return Promise.all(sources.map(function(source){var jobs=more[source]||[];jobs.sort(function(a,b){return b.matches-a.matches;});if(jobs.length)return request(source,jobs[0].query,2);}));
    }).then(function(){aborted(signal);var top=rank(pool,query).slice(0,30);return WePlayCatalog.searchDetails(top,{signal:signal,deadline:Date.now()+4000});}).then(function(){
      aborted(signal);pool=pool.concat(WePlayCatalog.searchKnown());var final=result(false);
      if(!final.partial&&final.sources.length){cache[key]={at:Date.now(),data:final};var keys=Object.keys(cache).sort(function(a,b){return cache[a].at-cache[b].at;});while(keys.length>12)delete cache[keys.shift()];}
      return final;
    });
  }
  window.WePlaySearch={normal:normal,parse:parse,match:match,rank:rank,plan:plan,search:search,clean:clean};
}());

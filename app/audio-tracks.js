/* One voice choice can have several delivery routes. Edition/type/language remain distinct. */
(function(){
  'use strict';
  function clean(value){return typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/[\u00a0\u200b]/g,' ').replace(/\s+/g,' ').trim():'';}
  function slug(value){value=clean(value);if(value.normalize)value=value.normalize('NFKC');return value.toLowerCase().replace(/ё/g,'е').replace(/[\s()[\]{}.,!?"'«»’‘“”·•…:;\/\\_+\-=|&@#$%*^`~‐‑‒–—−]+/g,'');}
  var aliases={lostfilm:'LostFilm',лостфильм:'LostFilm',hdrezkastudio:'HDrezka Studio',hdrezka:'HDrezka Studio',хдрезкастудио:'HDrezka Studio',redheadsound:'RedHeadSound',редхедсаунд:'RedHeadSound',рэдхедсаунд:'RedHeadSound',rhs:'RedHeadSound',tvshows:'TVShows',твшоус:'TVShows',leproduction:'LE-Production',newstudio:'NewStudio',coldfilm:'ColdFilm',кубиквкубе:'Кубик в кубе',kubikvkube:'Кубик в кубе',moviedalen:'MovieDalen',cvhproduction:'CVH Production',jetvisstudio:'Jetvis Studio',newcomers:'NewComers',winmedia:'WinMedia',viruseproject:'Viruse Project',virusproject:'Viruse Project',dragonmoneystudio:'Dragon Money Studio',syncmer:'Syncmer','dubляж':'Dubляж',kyberpunk:'Михаил Яроцкий',яроцкиймихаилkyberpunk:'Михаил Яроцкий',михаиляроцкийkyberpunk:'Михаил Яроцкий',михаиляроцкий:'Михаил Яроцкий',яроцкиймихаил:'Михаил Яроцкий'};
  function type(value){value=clean(value).toLowerCase();if(/тифло|аудиодескрип|audio description/.test(value))return'ad';if(/коммент|commentary/.test(value))return'commentary';if(/оригинал|original/.test(value))return'original';if(/многоголос|\bmvo\b/.test(value))return'mvo';if(/двухголос|\bdvo\b/.test(value))return'dvo';if(/одноголос|авторск|\bavo\b|\bvo\b/.test(value))return'vo';if(/дублир|(?:^|[^а-я])дубляж(?:$|[^а-я])|\bdub(?:bed)?\b/.test(value))return'dub';return'';}
  var typeLabels={dub:'Дубляж',mvo:'Многоголосый',dvo:'Двухголосый',vo:'Авторская',original:'Оригинал',ad:'Тифлокомментарий',commentary:'Комментарии'};
  function language(value){var raw=clean(value).toLowerCase().replace('_','-'),tag=raw.match(/^([a-z]{2,3})(?:-[a-z]{2})?$/),key=tag?tag[1]:slug(raw);return{ru:'ru',rus:'ru',russian:'ru',рус:'ru',русский:'ru',en:'en',eng:'en',english:'en',англ:'en',английский:'en',uk:'uk',ua:'uk',ukr:'uk',ukrainian:'uk',украинский:'uk',fr:'fr',fra:'fr',french:'fr',французский:'fr',de:'de',deu:'de',german:'de',немецкий:'de',ja:'ja',jpn:'ja',japanese:'ja',японский:'ja'}[key]||key;}
  var languages={ru:'Русский',en:'Английский',uk:'Украинский',fr:'Французский',de:'Немецкий',ja:'Японский',original:'Язык оригинала'};
  function describe(track,scope){
    var label=clean(track.label),studio=clean(track.studio||track.voiceStudio),raw=studio||label,all=raw+' '+clean(track.voiceType),kind=type(track.voiceType)||type(label),adult=/18\s*\+|без\s*цензур|uncensored/i.test(all),censored=!adult&&/(?:с\s+цензурой|\bcensored\b)/i.test(all),role=/тифло|аудиодескрип|audio description/i.test(all)?'ad':/коммент|commentary/i.test(all)?'commentary':'';
    var lang=language(track.language||track.lang||'');if(!lang){var match=all.match(/(?:^|[\s([|.])(?:eng(?:lish)?|англ(?:ийский)?|rus(?:sian)?|рус(?:ский)?|ukr(?:ainian)?|украинский|french|французский|german|немецкий|japanese|японский)(?=$|[\s)\]|.])/i);if(match)lang=language(match[0]);}
    if(!lang)lang=kind==='original'?'original':'ru';
    var base=raw.replace(/18\s*\+|без\s*цензуры|uncensored|с\s+цензурой|\bcensored\b/gi,' ').replace(/(?:^|[\s([|.])(?:mvo|dvo|avo|vo|dub(?:bed)?|многоголосый|двухголосый|одноголосый|авторская|дублированный|дубляж|eng(?:lish)?|англ(?:ийский)?|rus(?:sian)?|рус(?:ский)?|ukr(?:ainian)?|украинский|original|оригинал)(?=$|[\s)\]|.])/gi,' ').replace(/тифлокомментарий|аудиодескрипция|audio description|commentary/gi,' ').replace(/\b(?:aac|ac3|eac3|dts|ddp|dolby|[257][.]?[01])\b/gi,' ').replace(/[()[\]|]+/g,' ').replace(/\s+/g,' ').trim();
    base=base.replace(/без\s+уточнения/gi,' ').trim();var baseSlug=slug(base),anonymous=!kind&&/^(?:|основная|default|unknown|audio|дорожка\d+)$/.test(baseSlug);if(!baseSlug)base='';
    base=aliases[baseSlug]||base||typeLabels[kind]||label||'Основная';
    var baseKey,edition=adult?'adult':censored?'censored':'';
    // A named studio and the same legacy label share identity; placeholders do not.
    baseKey=slug(base)+'|'+edition+'|'+role;
    return{key:baseKey+'|'+kind+'|'+lang+(anonymous?'|'+scope:''),baseKey:baseKey,label:base+(adult?' 18+':censored?' · С цензурой':'')+(role&&base!==typeLabels[role]?' · '+typeLabels[role]:''),type:kind,typeLabel:typeLabels[kind]||'',language:lang,languageLabel:languages[lang]||lang,anonymous:anonymous};
  }
  function root(row){while(row&&row._duplicateOf)row=row._duplicateOf;return row;}
  function decorate(rows){var visible=rows.filter(function(row){return !row._duplicateOf;});visible.forEach(function(row){var info=row._audio,peers=visible.filter(function(v){return v._audio.baseKey===info.baseKey;}),types=peers.some(function(v){return v._audio.type!==info.type;}),langs=peers.some(function(v){return v._audio.language!==info.language;}),extra=[];if(types)extra.push(info.typeLabel||'Без уточнения');if(langs)extra.push(info.languageLabel);if(peers.length>1&&!types&&!langs)extra.push('Вариант '+(peers.indexOf(row)+1));row.label=info.label+(extra.length?' · '+extra.join(' · '):'');row.caption=[!types&&info.typeLabel, !langs&&info.language!=='ru'&&info.language!=='original'&&info.languageLabel].filter(Boolean).join(' · ');});return rows;}
  function appendUnique(target,values){(values||[]).forEach(function(value){if(target.indexOf(value)<0)target.push(value);});}
  function absorb(rows,a,b,info){
    var keep=rows.indexOf(a)<rows.indexOf(b)?a:b,drop=keep===a?b:a;
    appendUnique(keep._preferenceKeys,[keep.preferenceKey,drop.preferenceKey].concat(drop._preferenceKeys||[]));appendUnique(keep.sources,drop.sources);
    (drop._sources||[]).forEach(function(route){if(!keep._sources.some(function(v){return v.streamKey===route.streamKey;}))keep._sources.push(route);});
    keep._audio=info;keep.voiceKey=info.key;keep.key=keep.preferenceKey='voice:'+info.key;keep._activeSource=keep._activeSource||drop._activeSource;drop._duplicateOf=keep;return keep;
  }
  function coalesce(rows){rows.forEach(function(row,index){if(row._duplicateOf)return;var previous=rows.slice(0,index).filter(function(other){return !other._duplicateOf&&other.voiceKey===row.voiceKey;})[0];if(previous)absorb(rows,previous,row,previous._audio);});return decorate(rows);}
  function mergeUnknown(rows){
    coalesce(rows);
    rows.filter(function(row){return !row._duplicateOf&&!row._audio.anonymous&&(!row._audio.type||row._audio.language==='original');}).forEach(function(row){
      if(row._duplicateOf)return;var info=row._audio,candidates=rows.filter(function(other){var v=other._audio;return other!==row&&!other._duplicateOf&&!v.anonymous&&v.baseKey===info.baseKey&&v.type&&(!info.type||v.type===info.type)&&(v.language===info.language||info.language==='original'&&v.language!=='original');});
      if(candidates.length!==1)return;absorb(rows,row,candidates[0],candidates[0]._audio);
    });return decorate(rows);
  }
  function unique(tracks,active){var rows=[];tracks.forEach(function(track){var info=describe(track,'track:'+track.index),row=rows.filter(function(v){return v.voiceKey===info.key;})[0];if(row){if(track.index===active)row.index=track.index;return;}rows.push(Object.assign({},track,{voiceKey:info.key,preferenceKey:'voice:'+info.key,_preferenceKeys:[],_audio:info}));});return decorate(rows);}
  function preferredIndex(rows,label,key){var indices=[];rows.forEach(function(row,i){if(row._duplicateOf)return;if(key&&(row.preferenceKey===key||(row._preferenceKeys||[]).indexOf(key)>=0))indices.push(i);});if(indices.length)return indices[0];var wanted=describe({label:label},'preference');rows.forEach(function(row,i){if(!row._duplicateOf&&(row.label===label||row._audio&&row._audio.key===wanted.key))indices.push(i);});if(indices.length===1)return indices[0];indices=[];rows.forEach(function(row,i){if(!row._duplicateOf&&row._audio&&row._audio.baseKey===wanted.baseKey&&row._audio.language===wanted.language)indices.push(i);});return indices.length===1?indices[0]:-1;}
  function preferenceKey(rows,key){var row=rows.filter(function(v){return v.preferenceKey===key||(v._preferenceKeys||[]).indexOf(key)>=0;})[0];return row?root(row).preferenceKey:key;}
  window.WePlayAudio={describe:describe,decorate:decorate,coalesce:coalesce,mergeUnknown:mergeUnknown,unique:unique,preferredIndex:preferredIndex,preferenceKey:preferenceKey,root:root};
}());

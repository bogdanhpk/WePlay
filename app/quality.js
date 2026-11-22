/* Display quality uses frame dimensions, never the screen size or requested level. */
(function(){
  'use strict';
  var formats=[[7680,4320],[4096,2160],[3840,2160],[2560,1440],[2048,1080],[1920,1080],[1280,720],[960,540],[854,480],[852,480],[640,360],[426,240],[256,144]];
  function dimension(value){value=Number(value);return isFinite(value)&&value>0&&value<=16384?Math.round(value):0;}
  function size(width,height){return{width:dimension(width),height:dimension(height)};}
  function height(value){
    var s=size(value&&value.width,value&&value.height),long=Math.max(s.width,s.height),short=Math.min(s.width,s.height);
    // Cinema frames often omit letterboxing: 1920x800 still belongs to 1080p.
    // Only known frame widths qualify; arbitrary sizes are not rounded upward.
    for(var i=0;i<formats.length;i++)if(Math.abs(long-formats[i][0])<=8&&(!short||short>=formats[i][1]*.6&&short<=formats[i][1]+8))return formats[i][1];
    return short||s.height;
  }
  function tier(value){var h=height(value);return h>=2160?'4K':h>=1080?'FHD':h>=720?'HD':h>0?'SD':'';}
  function description(level){
    var h=level.height,label=h>=2160?'Ultra HD':h>=1440?'QHD':h>=1080?'Full HD':h>=720?'HD':'';
    if(level.width&&level.rawHeight&&level.rawHeight!==h)label+=(label?' · ':'')+level.width+' × '+level.rawHeight;
    return label;
  }
  function levels(raw){
    var seen={},result=[];
    (raw||[]).forEach(function(level,index){
      if(!level)return;
      var s=size(level.width,level.height),h=height(s);if(!h)return;
      var item={height:h,index:index,width:s.width,rawHeight:s.height,rawHeights:[s.height],bitrate:Number(level.bitrate)||0},old=seen[h];
      if(level.url){item.url=level.url;item.format=level.format;}
      if(!old){seen[h]=item;result.push(item);}
      else{old.rawHeights.push(s.height);if(item.width*item.rawHeight>old.width*old.rawHeight||item.width*item.rawHeight===old.width*old.rawHeight&&item.bitrate>old.bitrate){item.rawHeights=old.rawHeights;result[result.indexOf(old)]=item;seen[h]=item;}}
    });
    return result.sort(function(a,b){return a.height-b.height;});
  }
  function preferred(available,preference){
    if(!available.length||!dimension(preference))return null;
    // Preserve old preferences saved as cropped heights, such as 800p.
    var exact=available.filter(function(level){return level.height===Number(preference);})[0];if(exact)return exact;
    var legacy=available.filter(function(level){return level.rawHeights.indexOf(Number(preference))>=0;})[0];
    if(legacy)return legacy;
    var chosen=available[0];available.forEach(function(level){if(level.height<=preference)chosen=level;});return chosen;
  }
  function wireURL(raw,transport,serverTime){
    if(transport==='plain')return raw;
    var u=new URL(raw);if(u.pathname.indexOf('/x-en-x/')===0)return raw;
    var letters='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',map='DlChEXitLONYRkFjAsnBbymWzSHMqKPgQZpvwerofJTVdIuUcxaG';
    var value=btoa(Math.round((serverTime||Date.now())/3600000)+'/'+u.pathname+u.search);
    return u.origin+'/x-en-x/'+value.split('').map(function(c){var i=letters.indexOf(c);return i<0?c:map[i];}).join('');
  }
  function manifest(text){
    if(!/^\s*#EXTM3U\b/.test(text||''))return [];
    var raw=[],pattern=/#EXT-X-STREAM-INF:([^\r\n]+)/g,match;
    while((match=pattern.exec(text))){
      var resolution=/(?:^|,)\s*RESOLUTION=(\d+)x(\d+)(?:,|$)/i.exec(match[1]),bitrate=/(?:^|,)\s*(?:AVERAGE-)?BANDWIDTH=(\d+)/i.exec(match[1]);
      if(resolution)raw.push({width:Number(resolution[1]),height:Number(resolution[2]),bitrate:bitrate?Number(bitrate[1]):0});
    }
    return levels(raw);
  }
  function word(bytes,at){return bytes[at]*16777216+bytes[at+1]*65536+bytes[at+2]*256+bytes[at+3];}
  function tag(bytes,at){return String.fromCharCode.apply(null,bytes.subarray(at,at+4));}
  function boxes(bytes,start,end){
    var found=[];end=Math.min(bytes.length,end);
    for(var at=start;at+8<=end;){
      var length=word(bytes,at),header=8;if(length===1){if(at+16>end)break;length=word(bytes,at+8)*4294967296+word(bytes,at+12);header=16;}
      if(!length)length=end-at;if(length<header||!isFinite(length)||length>Number.MAX_SAFE_INTEGER)break;
      found.push({type:tag(bytes,at+4),start:at,body:at+header,end:at+length,complete:at+length<=end});at+=length;
    }return found;
  }
  function mp4Dimensions(bytes){
    var moov=boxes(bytes,0,bytes.length).filter(function(box){return box.type==='moov';})[0];if(!moov)return null;
    var tracks=boxes(bytes,moov.body,moov.end).filter(function(box){return box.type==='trak';});
    for(var i=0;i<tracks.length;i++){
      var children=boxes(bytes,tracks[i].body,tracks[i].end),tkhd=children.filter(function(box){return box.type==='tkhd'&&box.complete;})[0],mdia=children.filter(function(box){return box.type==='mdia';})[0];
      if(!tkhd||!mdia||tkhd.end-tkhd.body<84)continue;
      var handler=boxes(bytes,mdia.body,mdia.end).filter(function(box){return box.type==='hdlr'&&box.body+12<=bytes.length&&tag(bytes,box.body+8)==='vide';})[0];
      if(handler){
        var container=mdia;
        ['minf','stbl','stsd'].forEach(function(type){container=container&&boxes(bytes,container.body,container.end).filter(function(box){return box.type===type;})[0];});
        var entry=container&&boxes(bytes,container.body+8,container.end).filter(function(box){return box.body+28<=bytes.length;})[0];
        var dimensions=entry?size(bytes[entry.body+24]*256+bytes[entry.body+25],bytes[entry.body+26]*256+bytes[entry.body+27]):size(word(bytes,tkhd.end-8)/65536,word(bytes,tkhd.end-4)/65536);
        if(dimensions.width&&dimensions.height)return dimensions;
      }
    }return null;
  }
  function readBytes(response,limit,offset){
    if(response.status===200&&offset>0)throw new Error('Source ignored metadata range');
    if(!response.body||!response.body.getReader){
      var length=Number(response.headers.get('Content-Length'));if(!length||length>limit)throw new Error('Unbounded metadata response');
      return response.arrayBuffer().then(function(buffer){if(buffer.byteLength>limit)throw new Error('Metadata exceeds limit');return new Uint8Array(buffer);});
    }
    var reader=response.body.getReader(),chunks=[],length=0;
    function done(){var data=new Uint8Array(length),at=0;chunks.forEach(function(chunk){data.set(chunk,at);at+=chunk.length;});return data;}
    function next(){return reader.read().then(function(result){if(result.done)return done();var chunk=result.value.subarray(0,limit-length);chunks.push(chunk);length+=chunk.length;if(length===limit){return reader.cancel().catch(function(){}).then(done);}return next();});}return next();
  }
  function mp4Probe(raw,options){
    function read(offset,limit){return WePlayNetwork.request(raw,{credentials:'omit',headers:{Range:'bytes='+offset+'-'+(offset+limit-1)}},Object.assign({},options,{read:function(response){return readBytes(response,limit,offset);}}));}
    function inspect(offset,attempt,limit){return read(offset,limit).then(function(bytes){
      var dimensions=mp4Dimensions(bytes);if(dimensions)return dimensions;if(attempt>=3)return null;
      var atoms=boxes(bytes,0,bytes.length),moov=atoms.filter(function(box){return box.type==='moov';})[0];
      if(moov&&!moov.complete&&limit<262144)return inspect(offset+moov.start,attempt+1,262144);
      var last=atoms[atoms.length-1];return last&&last.end>bytes.length&&last.type!=='moov'?inspect(offset+last.end,attempt+1,65536):null;
    });}return inspect(0,0,65536);
  }
  function probe(stream,options){
    if(!stream||!stream.url)return Promise.resolve([]);
    options=Object.assign({timeout:3000,maxBytes:262144,media:true},options||{});
    var mp4=stream.format==='mp4'||/\.mp4(?:[?#]|$)/i.test(stream.url),raw=[],failed=false;
    var first=mp4?mp4Probe(stream.url,options).then(function(dimensions){if(dimensions)raw.push(Object.assign({},dimensions,{url:stream.url,format:'mp4'}));}):WePlayNetwork.request(wireURL(stream.url,stream.transport,stream.serverTime),{credentials:'omit'},options).then(function(text){raw=manifest(text).map(function(level){return{width:level.width,height:level.rawHeight,bitrate:level.bitrate};});});
    return first.catch(function(){failed=true;}).then(function(){
      var seen={};seen[stream.url]=true;
      var candidates=(stream.renditions||[]).filter(function(candidate){if(!candidate||candidate.format!=='mp4'||!/^https:\/\//.test(candidate.url||'')||seen[candidate.url])return false;seen[candidate.url]=true;return true;}),at=0;
      function worker(){var candidate=candidates[at++];if(!candidate)return Promise.resolve();if(raw.some(function(level){return height(level)===candidate.hint;}))return worker();return mp4Probe(candidate.url,options).then(function(dimensions){if(dimensions)raw.push(Object.assign({},dimensions,{url:candidate.url,format:'mp4'}));},function(){failed=true;}).then(worker);}
      return Promise.all([worker(),worker()]).then(function(){if(failed&&!raw.length)throw new Error('Quality metadata unavailable');var result=levels(raw);result.partial=failed;return result;});
    });
  }
  window.WePlayQuality={size:size,height:height,tier:tier,description:description,levels:levels,preferred:preferred,wireURL:wireURL,manifest:manifest,mp4Dimensions:mp4Dimensions,probe:probe};
}());

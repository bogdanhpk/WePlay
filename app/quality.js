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
    for(var i=0;i<formats.length;i++)if(Math.abs(long-formats[i][0])<=8&&(!short||short>=formats[i][1]*.65&&short<=formats[i][1]+8))return formats[i][1];
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
  function probe(stream,options){
    if(!stream||stream.format==='mp4'||/\.mp4(?:[?#]|$)/i.test(stream.url||''))return Promise.resolve([]);
    return WePlayNetwork.request(wireURL(stream.url,stream.transport,stream.serverTime),{credentials:'omit'},Object.assign({timeout:3000,maxBytes:262144,media:true},options||{})).then(manifest);
  }
  window.WePlayQuality={size:size,height:height,tier:tier,description:description,levels:levels,preferred:preferred,wireURL:wireURL,manifest:manifest,probe:probe};
}());

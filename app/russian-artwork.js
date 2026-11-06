(function(){
  'use strict';
  var byId=Object.create(null),byTitle=Object.create(null),sources=['START','Wink'];
  function add(index,key,source,record){
    var matches=index[key]||(index[key]=Object.create(null));
    // An ambiguous match in one provider may still be exact in the other.
    matches[source]=Object.prototype.hasOwnProperty.call(matches,source)?null:record;
  }
  (window.WePlayRussianArtworkIndex||[]).forEach(function(row){
    var source=row[0],slug=row[1],kind=row[2],id=row[5],start=source==='START';
    var record={
      id:id,
      source:source,
      page:start?'https://start.ru/watch/'+slug:'https://wink.ru/'+(kind==='series'?'series':'movies')+'/'+slug,
      titleLogo:start&&row[7]?'https://api.start.ru'+row[7]+'?poster_type=logotype':'',
      images:(start?[row[6]]:row.slice(6)).map(function(path){
        return start?'https://api.start.ru'+path+'?poster_type=background&dsize=1920x1080':'https://images.restream-media.net'+path;
      })
    };
    if(id)add(byId,kind+':'+id,source,record);
    add(byTitle,[kind,row[4],WePlayCatalogUnion.normal(row[3])].join(':'),source,record);
  });
  delete window.WePlayRussianArtworkIndex;

  function find(identity){
    var id=identity.ids.kp,verified=byId[identity.kind+':'+id];
    return sources.map(function(source){
      if(verified&&verified[source])return verified[source];
      var records=identity.names.map(function(name){
        var matches=byTitle[[identity.kind,identity.year,name].join(':')];
        return matches&&matches[source];
      }).filter(function(record){return record&&(!id||!record.id||record.id===id);});
      return records.every(function(record){return record===records[0];})?records[0]:null;
    }).filter(Boolean);
  }

  window.WePlayRussianArtwork={find:find};
}());

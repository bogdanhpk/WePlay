async(page)=>{
 const origin=new URL(page.url()).origin,context=await page.context().browser().newContext({viewport:{width:1920,height:1080},userAgent:'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) AppleWebKit/537.36 Chrome/69.0.3497.106 TV Safari/537.36'}),p=await context.newPage(),requests=[],errors=[];let stage='setup';
 const svg=height=>'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="'+height+'"><rect x="20" y="2" width="560" height="'+(height-4)+'" fill="white"/></svg>';
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin===origin)return u.pathname.includes('$WEBAPIS')?route.fulfill({body:'',contentType:'text/javascript'}):route.continue();
  if(!['image.tmdb.org','wsrv.nl','images.metahub.space'].includes(u.hostname))return route.fulfill({body:'Ничего не найдено',contentType:'text/html'});
  const relay=u.hostname==='wsrv.nl',source=relay?new URL(u.searchParams.get('url')):u,key=source.pathname.split('/').pop();
  requests.push({relay,host:source.hostname,key,output:u.searchParams.get('output'),at:Date.now()});
  if(relay&&u.searchParams.get('output')!=='png')throw Error('Logo proxy discards transparency');
  if(key==='QaMissingRu.png'||relay&&key==='QaRelayBrokenRu.png')return route.fulfill({status:404,body:''});
  if(!relay&&key!=='QaRelayBrokenRu.png')return route.abort('connectionrefused');
  if(key==='QaSlowRu.png')await new Promise(resolve=>setTimeout(resolve,3200));
  return route.fulfill({body:svg(key==='QaWideEn.png'?20:80),contentType:'image/svg+xml'});
 });
 try{
  await p.goto(origin+'/app.html');await p.waitForFunction(()=>window.WePlayArtwork&&window.WePlayTMDB);
  await p.evaluate(()=>{
   window.QA_ROOT=document.createElement('section');document.body.appendChild(QA_ROOT);
   window.QA_ADD=(id,title,candidates,imdb)=>{const item={id:'pub-'+id,_source:'pub',_kind:'movie',_detail:true,title,xfields:{year:'2026',kinopoisk_id:String(id),film:'https://fixture.invalid/player'}},art={tmdbAPI:true,imdbId:imdb||'',titleLogoCandidates:candidates.map(([name,language])=>({url:'https://image.tmdb.org/t/p/w500/'+name+'.png',language})),cast:[],backgrounds:[]};art.titleLogos=art.titleLogoCandidates.map(c=>c.url);WEPLAY_TMDB_INDEX.entries.push({kind:'movie',year:'2026',names:[WePlayCatalogUnion.normal(title)],ids:{kp:String(id)},art});const h=document.createElement('h1');h.id='qa-'+id;h.textContent=title;QA_ROOT.appendChild(h);WePlayArtwork.attachTitle(h,item);return item;};
  });
  stage='Russian unavailable';let start=Date.now();await p.evaluate(()=>QA_ADD(9001001,'Нет русского',[['QaMissingRu','ru'],['QaFallbackEn','en'],['QaNeutral',null]]));
  await p.waitForFunction(()=>document.querySelector('#qa-9001001 img')?.src.includes('QaFallbackEn'),null,{timeout:2500});const missingElapsed=Date.now()-start;
  if(requests.some(r=>r.key==='QaNeutral.png'))throw Error('Neutral logo outranked English');
  stage='slow Russian';start=Date.now();await p.evaluate(()=>QA_ADD(9001002,'Медленный русский',[['QaSlowRu','ru'],['QaQuickEn','en']]));
  await p.waitForFunction(()=>document.querySelector('#qa-9001002 img')?.src.includes('QaQuickEn'),null,{timeout:2500});const fallbackElapsed=Date.now()-start;
  await p.waitForFunction(()=>document.querySelector('#qa-9001002 img')?.src.includes('QaSlowRu'),null,{timeout:6000});
  stage='English before neutral';await p.evaluate(()=>QA_ADD(9001003,'Английский без русского',[['QaUnknown',null],['QaOnlyEn','en']]));
  await p.waitForFunction(()=>document.querySelector('#qa-9001003 img')?.src.includes('QaOnlyEn'));if(requests.some(r=>r.key==='QaUnknown.png'))throw Error('English waited for neutral logo');
  stage='Tizen delivery';await p.evaluate(()=>{window.QA_TV=QA_ADD(9001004,'Рабочий русский',[['QaGoodRu','ru']]);});
  await p.waitForFunction(()=>document.querySelector('#qa-9001004 img')?.naturalWidth===600);
  if(requests.some(r=>!r.relay&&r.key==='QaGoodRu.png'))throw Error('Tizen used blocked CDN before working relay');
  stage='relay unavailable';await p.evaluate(()=>QA_ADD(9001005,'Прямой сервер работает',[['QaRelayBrokenRu','ru']]));await p.waitForFunction(()=>document.querySelector('#qa-9001005 img')?.src.includes('image.tmdb.org/t/p/w500/QaRelayBrokenRu'));
  stage='wide English logo';await p.evaluate(()=>QA_ADD(9001006,'Длинное название',[['QaWideEn','en']]));await p.waitForFunction(()=>document.querySelector('#qa-9001006 img')?.naturalHeight===20);
  stage='IMDb fallback';await p.evaluate(()=>{window.QA_IMDB=QA_ADD(9001007,'Логотип из резервного каталога',[],'tt33764258');});await p.waitForFunction(()=>document.querySelector('#qa-9001007 img')?.src.includes('metahub.space'));
  stage='late English metadata';await p.evaluate(()=>{const entry=WePlayArtwork.cached(QA_IMDB),url='https://image.tmdb.org/t/p/w500/QaLaterEn.png';entry.updateMetadata({...entry.metadata,titleLogoCandidates:[{url,language:'en'}],titleLogos:[url]});});await p.waitForFunction(()=>document.querySelector('#qa-9001007 img')?.src.includes('QaLaterEn'));
  stage='player and profile restoration';const before=requests.length;
  await p.evaluate(()=>{WePlayNetwork.setPlayback(true);window.QA_PLAYER_TITLE=document.createElement('h2');QA_PLAYER_TITLE.textContent=QA_TV.title;QA_ROOT.appendChild(QA_PLAYER_TITLE);window.QA_PLAYER_CLEANUP=WePlayArtwork.attachPlayerTitle(QA_PLAYER_TITLE,QA_TV);});
  await p.waitForFunction(()=>QA_PLAYER_TITLE.querySelector('img')?.naturalWidth===600);await p.waitForTimeout(250);if(requests.length!==before)throw Error('Player reloaded the logo during playback');
  await p.evaluate(()=>{WePlayNetwork.setPlayback(false);QA_PLAYER_CLEANUP();QA_PLAYER_TITLE.remove();});await p.waitForFunction(()=>document.querySelector('#qa-9001004 img')?.naturalWidth===600);
  await p.evaluate(()=>WePlayArtwork.release(QA_ROOT));if(errors.length)throw Error(JSON.stringify(errors));
  return{result:'PASS',russianMissingUsesEnglish:true,missingElapsed,slowRussianDoesNotBlockEnglish:true,fallbackElapsed,lateRussianReplacesEnglish:true,englishBeforeNeutral:true,tizenUsesTransparentRelay:true,directFallbackWhenRelayFails:true,wideLogoAccepted:true,imdbFallback:true,lateEnglishUpgradesNeutral:true,playerWithoutNewRequests:true,profileRestoredAfterPlayer:true,errors};
 }catch(e){throw Error(stage+': '+e.message);}finally{await context.close();}
}

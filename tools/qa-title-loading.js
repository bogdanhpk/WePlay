async(page)=>{
 const origin=new URL(page.url()).origin,context=await page.context().browser().newContext({viewport:{width:1920,height:1080}}),p=await context.newPage(),errors=[],requests=[];let retry=0,stage='setup';
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',async r=>{
  const u=new URL(r.request().url());
  if(u.origin===origin)return u.pathname.includes('$WEBAPIS')?r.fulfill({body:'',contentType:'text/javascript'}):r.continue();
  if(u.hostname!=='logos.fixture.invalid')return r.fulfill({body:'Ничего не найдено',contentType:'text/html'});
  requests.push(u.pathname);
  if(u.pathname==='/retry.svg'&&++retry===1||u.pathname==='/removed.svg')return r.fulfill({status:503,body:''});
  if(u.pathname==='/slow.svg')await new Promise(resolve=>setTimeout(resolve,2400));
  await r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120"><text x="8" y="90" font-size="80" fill="white">ЛОГОТИП</text></svg>'});
 });
 try{
  await p.goto(origin+'/app.html');await p.waitForFunction(()=>window.WePlayArtwork&&window.WePlayTMDB);
  await p.evaluate(()=>{
   window.QA_HOLDER=document.createElement('section');document.body.appendChild(QA_HOLDER);
   window.QA_ITEM=(id,name)=>({id:'pub-'+id,_source:'pub',_kind:'movie',_detail:true,title:name,xfields:{year:'2026',kinopoisk_id:String(id),film:'https://fixture.invalid/player'}});
   window.QA_ART=path=>({tmdbAPI:true,titleLogos:['https://logos.fixture.invalid/'+path],titleLogoCandidates:[{url:'https://logos.fixture.invalid/'+path,language:'ru'}],cast:[],backgrounds:[]});
   window.QA_FIXTURE=(id,name,path)=>{const item=QA_ITEM(id,name);WEPLAY_TMDB_INDEX.entries.push({kind:'movie',year:'2026',names:[WePlayCatalogUnion.normal(name)],ids:{kp:String(id)},art:QA_ART(path)});return item;};
   window.QA_HEADING=(id,item)=>{const heading=document.createElement('h1');heading.id=id;heading.textContent=item.title;QA_HOLDER.appendChild(heading);WePlayArtwork.attachTitle(heading,item);return heading;};
  });
  stage='slow cold image';await p.evaluate(()=>{window.QA_SLOW=QA_FIXTURE(9000901,'Медленный логотип','slow.svg');QA_HEADING('slow-logo',QA_SLOW);});
  await p.waitForFunction(()=>document.querySelector('#slow-logo img')?.naturalWidth===600,null,{timeout:10000});
  const reuse=await p.evaluate(()=>document.querySelector('#slow-logo img')===WePlayArtwork.cached(QA_SLOW).titleLogo);if(!reuse||requests.filter(x=>x==='/slow.svg').length!==1)throw Error('Decoded image was requested again');
  stage='automatic recovery';await p.evaluate(()=>QA_HEADING('retry-logo',QA_FIXTURE(9000902,'Повторный логотип','retry.svg')));
  await p.waitForFunction(()=>document.querySelector('#retry-logo img')?.naturalWidth===600,null,{timeout:12000});if(retry!==2)throw Error('Retry did not recover '+retry);
  stage='old cache migration';await p.evaluate(async()=>{
   const original=WePlayTMDB.artwork;window.QA_MIGRATE_CALLS=0;window.QA_OLD=QA_ITEM(9000903,'Старый кэш');WePlayTMDB.artwork=(item,refresh,options)=>{
    if(item.id!==QA_OLD.id)return original(item,refresh,options);
    QA_MIGRATE_CALLS++;return Promise.resolve(QA_MIGRATE_CALLS===1?{tmdbAPI:true,cast:[],backgrounds:[]}:QA_ART('migrated.svg'));
   };
   window.QA_OLD_ENTRY=await WePlayArtwork.resolve(QA_OLD);await QA_OLD_ENTRY.metadataTask;QA_HEADING('migrated-logo',QA_OLD);
  });
  await p.waitForFunction(()=>document.querySelector('#migrated-logo img')?.naturalWidth===600,null,{timeout:10000});
  const migration=await p.evaluate(()=>{const old={tmdbAPI:true,cast:[],backgrounds:[]};QA_OLD_ENTRY.updateMetadata(old);return{calls:QA_MIGRATE_CALLS,preserved:QA_OLD_ENTRY.metadata.titleLogoCandidates?.[0].url.endsWith('/migrated.svg'),persisted:Object.values(JSON.parse(localStorage.getItem('lord.artwork.v1'))).some(x=>x.data.titleLogosCheckedAt&&x.data.titleLogoCandidates?.[0].url.endsWith('/migrated.svg'))};});
  if(migration.calls!==2||!migration.preserved||!migration.persisted)throw Error('Legacy metadata did not migrate '+JSON.stringify(migration));
  stage='playback pause and resume';await p.evaluate(()=>{WePlayNetwork.setPlayback(true);window.QA_PAUSED=QA_FIXTURE(9000904,'Отложенный логотип','paused.svg');QA_HEADING('paused-logo',QA_PAUSED);});await p.waitForTimeout(300);
  if(requests.includes('/paused.svg'))throw Error('Background logo competed with playback');
  await p.evaluate(()=>WePlayNetwork.setPlayback(false));await p.waitForFunction(()=>document.querySelector('#paused-logo img')?.naturalWidth===600,null,{timeout:10000});
  stage='removed heading';await p.evaluate(()=>{window.QA_REMOVED=QA_FIXTURE(9000905,'Закрытый профиль','removed.svg');QA_HEADING('removed-logo',QA_REMOVED);});await p.waitForFunction(()=>WePlayArtwork.cached(QA_REMOVED)?.titleLogoRetry);
  const before=requests.filter(x=>x==='/removed.svg').length;await p.evaluate(()=>{const h=document.getElementById('removed-logo');WePlayArtwork.release(h);h.remove();});await p.waitForTimeout(4500);
  if(requests.filter(x=>x==='/removed.svg').length!==before)throw Error('Detached page kept requesting logos');
  if(errors.length)throw Error(JSON.stringify(errors));return{result:'PASS',coldImageAfter2400ms:true,reusesDecodedImage:reuse,automaticRecovery:true,oldCacheMigration:migration,pauseAndResume:true,removedPageStopsRetries:true,errors};
 }catch(error){throw Error(stage+': '+error.message);}finally{await context.close();}
}

async(page)=>{
 const origin=new URL(page.url()).origin,reports=[];
 for(const platform of ['android','tizen']){
  const context=await page.context().browser().newContext({viewport:{width:1920,height:1080},userAgent:platform==='tizen'?'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5)':'Mozilla/5.0 (Linux; Android 12; Android TV)'}),p=await context.newPage(),requests=[],errors=[];
  if(platform==='tizen')await context.addInitScript(()=>{Object.defineProperty(window,'WePlayAndroid',{get:()=>undefined,set:()=>{}});window.tizen={};});
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin===origin){if(u.pathname.includes('$WEBAPIS'))return route.fulfill({body:'',contentType:'text/javascript'});if(/\/(?:app|capture-adapter)\.js$/.test(u.pathname)&&platform==='tizen'&&u.pathname.endsWith('capture-adapter.js'))return route.fulfill({body:'',contentType:'text/javascript'});if(u.pathname==='/app.js')return route.fulfill({body:'',contentType:'text/javascript'});return route.continue();}
   const raw=u.hostname==='wsrv.nl'?new URL(u.searchParams.get('url')):u;
   if(!['image.tmdb.org','images.metahub.space','static.tvmaze.com'].includes(raw.hostname))return route.fulfill({body:'Ничего не найдено',contentType:'text/html'});
   const name=raw.pathname.split('/').pop();requests.push({name,relay:u.hostname==='wsrv.nl',output:u.searchParams.get('output'),width:Number(u.searchParams.get('w'))||null});
   if(name==='LogoRu.png'||name==='Fallback.jpg'&&u.hostname==='wsrv.nl')return route.fulfill({status:503,body:''});
   if(u.hostname!=='wsrv.nl'&&name!=='Fallback.jpg')return route.fulfill({status:503,body:''});
   const logo=name==='LogoEn.png',person=name==='Actor.jpg',width=logo?960:person?384:Number(u.searchParams.get('w'))||2560,height=logo?512:person?576:Math.round(width*9/16);
   const svg=logo?`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="512"><rect x="160" y="180" width="640" height="160" fill="white"/></svg>`:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#183b50"/></svg>`;
   return route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:svg});
  });
  try{
   await p.goto(origin+'/app.html');await p.waitForFunction(()=>window.WePlayArtwork&&window.WePlayTMDB);
   await p.evaluate(()=>{
    const item={id:'pub-990001',title:'Изображения',_source:'pub',_kind:'movie',_detail:true,xfields:{year:'2026',kinopoisk_id:'990001',film:'https://fixture.invalid/player'}};
    WEPLAY_TMDB_INDEX.entries.push({kind:'movie',year:'2026',names:['изображения'],ids:{kp:'990001'},art:{tmdbAPI:true,background:'https://image.tmdb.org/t/p/original/Frame.jpg',backgrounds:['https://image.tmdb.org/t/p/original/Frame.jpg'],cast:[],titleLogoCandidates:[{url:'https://image.tmdb.org/t/p/w500/LogoRu.png',language:'ru'},{url:'https://image.tmdb.org/t/p/w500/LogoEn.png',language:'en'}]}});
    const holder=document.createElement('section');document.body.appendChild(holder);window.PARITY_ITEM=item;window.PARITY_HOLDER=holder;
    for(const [id,role] of [['hero','backdrop'],['card','preview']]){const box=document.createElement('div'),img=document.createElement('img');img.id=id;box.appendChild(img);holder.appendChild(box);WePlayArtwork.attach(img,item,role);}
    const actorBox=document.createElement('div'),actor=document.createElement('img');actor.id='actor';actorBox.appendChild(actor);holder.appendChild(actorBox);WePlayArtwork.profile(actor,{id:'990001',name:'Актёр',image:'https://image.tmdb.org/t/p/h632/Actor.jpg'});
    const title=document.createElement('h1');title.id='title';title.textContent=item.title;holder.appendChild(title);WePlayArtwork.attachTitle(title,item);
   });
   await p.waitForFunction(()=>['hero','card','actor'].every(id=>document.getElementById(id).naturalWidth>0&&document.getElementById(id).style.visibility==='visible')&&document.querySelector('#title img')?.naturalWidth===640,null,{timeout:15000});
   const result=await p.evaluate(()=>({platform:WePlayTV.name,hero:document.getElementById('hero').naturalWidth,card:document.getElementById('card').naturalWidth,actor:document.getElementById('actor').naturalWidth,logoSource:document.querySelector('#title img').getAttribute('data-logo-source'),logoWidth:document.querySelector('#title img').naturalWidth,logoHeight:document.querySelector('#title img').naturalHeight}));
   for(const name of ['Frame.jpg','Actor.jpg'])if(requests.find(r=>r.name===name)?.relay!==true)throw Error(platform+' tried a blocked direct image before the shared relay: '+name);
   if(result.hero<1280||result.card!==640||result.logoWidth!==640||result.logoHeight!==160||!result.logoSource.endsWith('/LogoEn.png'))throw Error('Incorrect artwork size or logo fallback '+JSON.stringify(result));
   const before=requests.filter(r=>r.name==='LogoEn.png').length;await p.evaluate(()=>{const h=document.createElement('h1');h.textContent=PARITY_ITEM.title;PARITY_HOLDER.appendChild(h);WePlayArtwork.attachTitle(h,PARITY_ITEM);});await p.waitForTimeout(300);if(requests.filter(r=>r.name==='LogoEn.png').length!==before)throw Error('Decoded logo was downloaded again');
   await p.evaluate(()=>{const item={id:'pub-990002',title:'Резервное изображение',_kind:'movie',xfields:{year:'2026',kinopoisk_id:'990002'}};WEPLAY_TMDB_INDEX.entries.push({kind:'movie',year:'2026',names:['резервное изображение'],ids:{kp:'990002'},art:{tmdbAPI:true,background:'https://image.tmdb.org/t/p/original/Fallback.jpg',cast:[]}});const box=document.createElement('div'),img=document.createElement('img');img.id='fallback';box.appendChild(img);PARITY_HOLDER.appendChild(box);WePlayArtwork.attach(img,item,'backdrop');});
   await p.waitForFunction(()=>document.getElementById('fallback').naturalWidth>=1280&&document.getElementById('fallback').style.visibility==='visible',null,{timeout:10000});
   if(errors.length)throw Error(JSON.stringify(errors));reports.push({...result,relayFirst:true,englishLogoFallback:true,transparentCrop:true,decodedLogoReuse:true,directCoverFallback:true,errors});
  }finally{await context.close();}
 }
 return{result:'PASS',reports};
}

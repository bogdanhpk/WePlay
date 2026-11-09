async(page)=>{
 const origin=new URL(page.url()).origin,context=await page.context().browser().newContext(),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{
  const u=new URL(r.request().url());if(u.origin===origin)return u.pathname.includes('$WEBAPIS')?r.fulfill({body:'',contentType:'text/javascript'}):r.continue();
  if(!['image.tmdb.org','wsrv.nl','logos.fixture.invalid'].includes(u.hostname))return r.fulfill({body:'Ничего не найдено',contentType:'text/html'});
  const source=u.hostname==='wsrv.nl'?u.searchParams.get('url'):u.href,empty=source.includes('BoundsEmptyRu'),opaque=source.includes('BoundsOpaque'),white=source.includes('BoundsWhite')||source.includes('BoundsEmptyEn');
  const body='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="160">'+(empty?'':(opaque?'<rect width="600" height="160" fill="black"/>':'<rect width="600" height="160" fill="white" opacity=".02"/>')+'<rect x="100" y="40" width="300" height="80" fill="'+(white?'white':'black')+'"/>')+'</svg>';
  return r.fulfill({body,contentType:'image/svg+xml',headers:{'access-control-allow-origin':source.includes('BoundsNoCors')?'https://other.fixture.invalid':'*'}});
 });
 try{await p.goto(origin+'/app.html');await p.waitForFunction(()=>window.WePlayArtwork);
  await p.evaluate(()=>{
   window.QA_ROOT=document.createElement('section');document.body.appendChild(QA_ROOT);
   window.QA_ADD=(id,name,files)=>{const item={id:'pub-'+id,_source:'pub',_kind:'movie',_detail:true,title:name,xfields:{year:'2026',kinopoisk_id:String(id)}},art={tmdbAPI:true,titleLogoCandidates:files.map(([file,language])=>({url:'https://image.tmdb.org/t/p/w500/'+file+'.png',language})),cast:[],backgrounds:[]};art.titleLogos=art.titleLogoCandidates.map(c=>c.url);WEPLAY_TMDB_INDEX.entries.push({kind:'movie',year:'2026',names:[WePlayCatalogUnion.normal(name)],ids:{kp:String(id)},art});const h=document.createElement('h1');h.id='qa-'+id;h.textContent=name;QA_ROOT.appendChild(h);WePlayArtwork.attachTitle(h,item);};
   QA_ADD(9001101,'Чёрный логотип',[['BoundsBlack','ru']]);QA_ADD(9001102,'Белый логотип',[['BoundsWhite','ru']]);QA_ADD(9001103,'Непрозрачный логотип',[['BoundsOpaque','ru']]);QA_ADD(9001104,'Пустой русский файл',[['BoundsEmptyRu','ru'],['BoundsEmptyEn','en']]);QA_ADD(9001105,'Сервер без CORS',[['BoundsNoCors','ru']]);
  });
  await p.waitForFunction(()=>[9001101,9001102,9001103,9001104].every(id=>document.querySelector('#qa-'+id+' img')?.naturalWidth>0));
  const rows=await p.evaluate(()=>[9001101,9001102,9001103,9001104].map(id=>{const img=document.querySelector('#qa-'+id+' img'),c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return{id,width:img.naturalWidth,height:img.naturalHeight,source:img.getAttribute('data-logo-source'),pixel:Array.from(ctx.getImageData(0,0,1,1).data)};}));
  for(const row of rows.filter(r=>r.id!==9001103))if(row.width!==300||row.height!==80)throw Error('Transparent fields remain '+JSON.stringify(row));
  if(JSON.stringify(rows[0].pixel)!=='[0,0,0,255]'||JSON.stringify(rows[1].pixel)!=='[255,255,255,255]')throw Error('Visible black/white pixels were changed');
  if(rows[2].width!==600||rows[2].height!==160||JSON.stringify(rows[2].pixel)!=='[0,0,0,255]')throw Error('Opaque background was cropped');
  if(!rows[3].source.includes('BoundsEmptyEn'))throw Error('Empty Russian image hid English fallback');
  await p.waitForFunction(()=>document.querySelector('#qa-9001105 img')?.naturalWidth===600);
  await p.evaluate(()=>WePlayArtwork.release(QA_ROOT));if(errors.length)throw Error(JSON.stringify(errors));return{result:'PASS',asymmetricTransparentFieldsRemoved:true,faintExportNoiseRemoved:true,blackAndWhiteArtworkPreserved:true,opaqueArtworkUnchanged:true,emptyRussianUsesEnglish:true,unavailableCorsKeepsLogo:true,rows,errors};
 }catch(e){const headings=await p.evaluate(()=>Array.from(document.querySelectorAll('[id^="qa-90011"]')).map(h=>({id:h.id,width:h.querySelector('img')?.naturalWidth,source:h.querySelector('img')?.getAttribute('data-logo-source')})));throw Error(e.message+' '+JSON.stringify(headings));}finally{await context.close();}
}

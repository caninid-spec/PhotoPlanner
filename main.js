// ════════════════════════════════════════════════════════════
// main.js — PhotoWeather (Refactored)
// ════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // 1. SERVICE WORKER
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
        .then(reg => console.log('Service Worker registrato:', reg))
        .catch(err => console.log('Registrazione Service Worker fallita:', err));
    });
  }

  // 2. STATE & CONFIG
  const S = {
    lat: 46.0, lon: 10.5, timeHour: 6,
    param: 'cloud_cover_low', paramLabel: 'Cielo Rosso', paramGrad: 'rg',
    weatherData: null,
    spots: JSON.parse(localStorage.getItem('photoweather_spots')) || [
      {id:'1',name:'Monte Rosa',lat:45.937,lon:7.867,emoji:'🏔',type:'Montagna',alt:'4634m',rat:'4.8',w:[{i:'🔴',n:'Cielo Rosso',p:82},{i:'🌅',n:'Alba Visibile',p:91},{i:'🌫',n:'Nebbia',p:12,b:1}]},
      {id:'2',name:'Lago Maggiore',lat:46.0,lon:8.6,emoji:'🌊',type:'Lago',alt:'193m',rat:'4.5',w:[{i:'🌊',n:'Riflesso',p:76},{i:'🌫',n:'Nebbia Matt.',p:68},{i:'☀️',n:'Contrasto',p:55}]},
      {id:'3',name:'Dolomiti — Tre Cime',lat:46.617,lon:12.3,emoji:'🏔',type:'Montagna',alt:'2999m',rat:'4.9',w:[{i:'🔴',n:'Cielo Rosso',p:88},{i:'⛈',n:'Temporale',p:33,b:1},{i:'🌅',n:'Tramonto',p:95}]},
    ],
    saved: new Set(JSON.parse(localStorage.getItem('photoweather_saved_spots')) || ['1', '3']),
    mapStyleIdx: 0, sunOn: false, pendingLL: null, curSpotId: null,
    sunLineLayer: null, sunMarker: null, locMarker: null, tempMarker: null,
  };
  
  const OM_PARAMS='temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,precipitation_probability,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,shortwave_radiation,direct_radiation,diffuse_radiation,wind_speed_10m,wind_direction_10m,visibility,is_day';
  const TILES = [
    {l:'Dark',  u:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'},
    {l:'Terrain',u:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'},
    {l:'Satellite',u:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'},
    {l:'OSM',   u:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'},
  ];
  const GRADS={rg:[[26,30,40],[255,107,53],[255,71,87]],bw:[[26,30,40],[126,184,247],[200,220,255]],pu:[[26,30,40],[167,139,250],[255,71,87]],in:[[26,30,40],[99,102,241],[167,139,250]],or:[[26,30,40],[255,165,2],[255,200,80]],ye:[[26,30,40],[232,240,60],[255,220,100]],te:[[26,30,40],[20,184,166],[126,211,200]],bl:[[26,30,40],[59,130,246],[147,197,253]]};
  const RANGES={cloud_cover_low:[0,100],visibility:[0,24140],precipitation_probability:[0,100],cloud_cover:[0,100],direct_radiation:[0,800],shortwave_radiation:[0,1000],wind_speed_10m:[0,60],cloud_cover_high:[0,100]};
  const MCOL={Montagna:'pm-r',Lago:'pm-b',Colline:'pm-g',Città:'pm-o',Foresta:'pm-g',Costa:'pm-b'};

  // 3. MAP INITIALIZATION
  const map = L.map('lmap',{zoomControl:false,attributionControl:true}).setView([S.lat, S.lon],7);
  let tile = L.tileLayer(TILES[S.mapStyleIdx].u,{maxZoom:19}).addTo(map);
  const markers={};

  // 4. API & DATA HANDLING
  function saveState() {
    localStorage.setItem('photoweather_spots', JSON.stringify(S.spots));
    localStorage.setItem('photoweather_saved_spots', JSON.stringify(Array.from(S.saved)));
  }

  async function loadWeather(lat,lon){
    const weatherContent = document.getElementById('weather-card-content');
    weatherContent.innerHTML=`<div class="wch"><span>⏳</span><span class="wct">Caricamento…</span><span class="wcs sl"><span class="spin"></span></span></div><p class="placeholder-text">Open-Meteo API in corso…</p>`;
    try{
      const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}&hourly=${OM_PARAMS}&timezone=auto&forecast_days=3`;
      const r=await fetch(url);
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      S.weatherData=d;
      let place=`${lat.toFixed(3)}, ${lon.toFixed(3)}`;
      try{
        const gr=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`,{headers:{'Accept-Language':'it'}});
        const gd=await gr.json();
        place=gd.name||gd.address?.city||gd.address?.town||gd.address?.village||gd.address?.county||gd.address?.state||place;
      }catch(_){}
      renderWeather(d,place);
      updateSunTimes(d);
      drawHeat(d);
    }catch(e){
      weatherContent.innerHTML=`<div class="wch"><span>⚠️</span><span class="wct">Errore API</span><span class="wcs er">Offline</span></div><p class="placeholder-text">${e.message}.</p>`;
    }
  }

  async function getAIAdvice(locationName, weatherSummary, time) {
    const aiContent = document.getElementById('assistant-card-content');
    aiContent.innerHTML = `
        <div class="wch"><span>⏳</span><span class="wct">L'assistente AI sta pensando...</span><span class="wcs sl"><span class="spin"></span></span></div>
        <p class="placeholder-text">Sto analizzando le condizioni per <b>${locationName}</b>...</p>
    `;
    try {
        const WORKER_URL = 'https://photoscoutai.canini-d.workers.dev';
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locationName, weatherSummary, time }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Errore del worker: ${response.status}`);
        }
        const { result } = await response.json();
        const formattedResult = result.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
        aiContent.innerHTML = `
            <div class="wch"><span>💡</span><span class="wct">Consigli per ${locationName}</span></div>
            <div style="font-size:13px; line-height:1.7; color: var(--text);">${formattedResult}</div>
        `;
    } catch (error) {
        aiContent.innerHTML = `
            <div class="wch"><span>⚠️</span><span class="wct">Errore</span><span class="wcs er">Offline</span></div>
            <p class="placeholder-text">Impossibile contattare l'assistente AI: ${error.message}</p>
        `;
    }
  }
  
  // 5. RENDERING & DOM MANIPULATION
  function hIdx(d){return Math.min(S.timeHour,(d.hourly?.time?.length||72)-1);}
  function clamp(v){return Math.round(Math.max(0,Math.min(100,v)));}
  function sb(lbl,p){const c=p>70?'var(--green)':p>40?'var(--orange)':'var(--red)'; return `<div class="srow"><span class="slbl">${lbl}</span><div class="sbar"><div class="sfill" style="width:${p}%;background:${c}"></div></div><span class="spct" style="color:${c}">${p}%</span></div>`;}

  function renderWeather(d, place) {
    const h = d.hourly, i = hIdx(d);
    const cl = h.cloud_cover_low?.[i] ?? 0, ch = h.cloud_cover_high?.[i] ?? 0, ct = h.cloud_cover?.[i] ?? 0, rad = h.shortwave_radiation?.[i] ?? 0, dr = h.direct_radiation?.[i] ?? 0, pr = h.precipitation?.[i] ?? 0, pp = h.precipitation_probability?.[i] ?? 0, vis = h.visibility?.[i] ?? 24140, ws = h.wind_speed_10m?.[i] ?? 0, tmp = h.temperature_2m?.[i] ?? 0;
    const redSky = clamp(((cl > 10 && cl < 70 ? 60 : 20) + (ch > 20 ? 20 : 0) + (rad > 50 ? 20 : 0) - (ct > 85 ? 30 : 0) - (pr > 0.5 ? 30 : 0)));
    const fog = clamp(((vis < 1000 ? 90 : vis < 5000 ? 60 : vis < 10000 ? 30 : 5) + (ws < 3 ? 10 : 0)));
    const night = clamp(100 - ct - (pr > 0 ? 50 : 0));
    const contrast = clamp((dr > 200 ? 80 : dr > 50 ? 50 : 10) + (ct < 30 ? 20 : 0));
    const refl = clamp(100 - (ws > 10 ? 70 : ws > 5 ? 40 : ws > 2 ? 20 : 5) - (pr > 0.5 ? 30 : 0));
    const tl = h.time?.[i]?.split('T')[1]?.slice(0, 5) || '--:--';

    const weatherSummaryForAI = `- Temperatura: ${tmp.toFixed(1)}°C\n- Copertura nuvolosa: ${ct}% (${cl}% basse, ${h.cloud_cover_mid?.[i]??0}% medie, ${ch}% alte)\n- Probabilità di precipitazioni: ${pp}%\n- Vento: ${ws.toFixed(0)} km/h\n- Visibilità: ${(vis / 1000).toFixed(1)} km\n- Radiazione solare diretta: ${dr} W/m²`;

    const htmlContent = `
        <div class="wch"><span>📍</span><span class="wct" style="font-size:12px">${place}</span><span class="wcs ok">Live</span></div>
        <div class="wgrid">
            <div class="wmet"><div class="wml">Temp.</div><div class="wmv">${tmp.toFixed(1)}<span class="wmu">°C</span></div></div>
            <div class="wmet"><div class="wml">Vento</div><div class="wmv">${ws.toFixed(0)}<span class="wmu">km/h</span></div></div>
            <div class="wmet"><div class="wml">Nuvole</div><div class="wmv">${ct}<span class="wmu">%</span></div></div>
            <div class="wmet"><div class="wml">Visib.</div><div class="wmv">${vis >= 24140 ? '>24' : (vis / 1000).toFixed(1)}<span class="wmu">km</span></div></div>
        </div>
        <p class="slabel" style="margin-top:10px">📸 Score Fotografici — ${tl}</p>
        ${sb('🔴 Cielo Rosso', redSky)} ${sb('🌫 Nebbia', fog)} ${sb('🌌 Cielo Notturno', night)} ${sb('☀️ Contrasto', contrast)} ${sb('🌊 Riflesso', refl)}
        <button class="bprim" style="margin-top: 15px;" onclick="getAIAdvice('${place.replace(/'/g, "\\'")}', \`${weatherSummaryForAI}\`, '${tl}')">✨ Chiedi all'AI</button>
    `;
    document.getElementById('weather-card-content').innerHTML = htmlContent;
  }
  
  function updateSunTimes(d){
    const dr=d.hourly?.direct_radiation||[]; let rise=null,set=null;
    for(let i=0;i<24;i++){if(dr[i]>0&&rise===null)rise=i;if(dr[i]>0)set=i;}
    const f=h=>h!==null?String(h).padStart(2,'0')+':00':'—:—';
    document.getElementById('srTime').textContent=f(rise); document.getElementById('ssTime').textContent=f(set);
    const cyc=(Math.floor(Date.now()/86400000)%30)/30;
    const pnames=['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
    document.getElementById('moonTxt').textContent=pnames[Math.floor(cyc*8)];
  }

  function drawHeat(d){
    const canvas=document.getElementById('heatCanvas'); const md=document.getElementById('lmap');
    canvas.width=md.offsetWidth; canvas.height=md.offsetHeight; const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height); const h=d?.hourly; if(!h) return;
    const i=hIdx(d); const val=h[S.param]?.[i]??0; const [mn,mx]=RANGES[S.param]||[0,100];
    let norm=Math.max(0,Math.min(1,(val-mn)/(mx-mn)));
    if(S.param==='wind_speed_10m'||S.param==='visibility') norm=1-norm;
    const cols=GRADS[S.paramGrad]||GRADS.rg; const lerp=(c1,c2,t)=>c1.map((v,i)=>v+(c2[i]-v)*t);
    const col=t=>t<0.5?lerp(cols[0],cols[1],t*2):lerp(cols[1],cols[2],(t-0.5)*2);
    const cx=canvas.width/2, cy=canvas.height/2; const r=Math.min(canvas.width,canvas.height)*0.5;
    for(let b=0;b<4;b++){
      const bx=b===0?cx:cx+(Math.random()-.5)*canvas.width*.5, by=b===0?cy:cy+(Math.random()-.5)*canvas.height*.5, br=r*(b===0?.6:.2+Math.random()*.25);
      const n2=Math.max(0,Math.min(1,norm+(b===0?0:(Math.random()-.5)*.3))), c=col(n2);
      const g=ctx.createRadialGradient(bx,by,0,bx,by,br);
      g.addColorStop(0,`rgba(${c.join(',')},${b===0?.5:.25})`); g.addColorStop(1,`rgba(${c.join(',')},0)`);
      ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
    }
  }

  function mkIcon(sp){
    const cls=(MCOL[sp.type]||'pm-o')+(S.saved.has(sp.id)?' pm-saved':'');
    return L.divIcon({className:'',html:`<div class="pmarker ${cls}"><span class="mi">${sp.emoji}</span></div>`,iconSize:[34,34],iconAnchor:[17,34]});
  }
  function addMarker(sp){
    const m=L.marker([sp.lat,sp.lon],{icon:mkIcon(sp)}).addTo(map).on('click',()=>openSpot(sp.id));
    markers[sp.id]=m;
  }
  
  // Make these functions global so inline HTML onclicks can find them
  window.selParam = (el,param,label,grad) => {
    document.querySelectorAll('.pc.active').forEach(c=>c.classList.remove('active')); el.classList.add('active');
    S.param=param; S.paramLabel=label; S.paramGrad=grad;
    const LEGG = { rg:'linear-gradient(90deg, #1a1e28, #ff6b35, #ff4757)', bw:'linear-gradient(90deg, #1a1e28, #7eb8f7, #c8dcff)', pu:'linear-gradient(90deg, #1a1e28, #a78bfa, #ff4757)', in:'linear-gradient(90deg, #1a1e28, #6366f1, #a78bfa)', or:'linear-gradient(90deg, #1a1e28, #ffa502, #ffc850)', ye:'linear-gradient(90deg, #1a1e28, #e8f03c, #ffe064)', te:'linear-gradient(90deg, #1a1e28, #14b8a6, #7ed3c8)', bl:'linear-gradient(90deg, #1a1e28, #3b82f6, #93c5fd)' };
    document.getElementById('legTitle').textContent='Prob. '+label;
    document.getElementById('legBar').style.background=LEGG[grad]||LEGG.rg;
    if(S.weatherData)drawHeat(S.weatherData);
  }
  window.selModel = (el,name) => {
    document.querySelectorAll('.mo.active').forEach(m=>m.classList.remove('active')); el.classList.add('active');
    notify('📡 Modello: '+name,'success');
  }
  window.onTime = v => {
    S.timeHour=parseInt(v);
    const BD=new Date(); BD.setHours(0,0,0,0); const DAYS=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'], MONTHS=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const d=new Date(BD.getTime()+S.timeHour*3600000);
    document.getElementById('timeDisplay').textContent=String(d.getHours()).padStart(2,'0')+':00';
    document.getElementById('timeDate').textContent=`${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    if(S.sunOn) window.drawSun();
    if(S.weatherData){
        drawHeat(S.weatherData);
        renderWeather(S.weatherData,document.querySelector('#weather-card-content .wct')?.textContent||'—');
    }
  }
  window.setHr = h => { document.getElementById('timeSlider').value=h; onTime(h); }
  window.toggleSunTool = () => {
    S.sunOn=!S.sunOn;
    document.getElementById('sunBtn').classList.toggle('active',S.sunOn);
    if(S.sunOn){drawSun();notify('☀️ Strumento sole attivo','success');}
    else{if(S.sunMarker)map.removeLayer(S.sunMarker);if(S.sunLineLayer)map.removeLayer(S.sunLineLayer);S.sunMarker=null;S.sunLineLayer=null;}
  }
  window.drawSun = () => {
    if(!S.sunOn)return;
    if(S.sunMarker)map.removeLayer(S.sunMarker); if(S.sunLineLayer)map.removeLayer(S.sunLineLayer);
    const hr=S.timeHour%24, az=((hr-6)/12)*180, r2d=Math.PI/180, dist=0.07;
    const slat=S.lat+dist*Math.cos(az*r2d), slon=S.lon+dist*Math.sin(az*r2d);
    S.sunMarker=L.marker([slat,slon],{icon:L.divIcon({className:'',html:'<div style="background:#ffa502;width:18px;height:18px;border-radius:50%;box-shadow:0 0 12px #ffa502"></div>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);
    S.sunLineLayer=L.polyline([[S.lat,S.lon],[slat,slon]],{color:'rgba(255,165,2,.5)',weight:2,dashArray:'5,5'}).addTo(map);
  }
  
  // 6. UI ACTIONS & CONTROLS
  let tTimer;
  window.notify = (msg,type) => {
    clearTimeout(tTimer);
    const t=document.getElementById('toast');
    t.className='toast show '+(type||'');
    t.querySelector('#toastMsg').textContent=msg;
    tTimer=setTimeout(()=>t.classList.remove('show'),3000);
  }
  
  let sdTimer=null, sdCtrl=null;
  async function doSearch(q){
    if(sdCtrl)sdCtrl.abort(); sdCtrl=new AbortController();
    try{
      const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,{signal:sdCtrl.signal,headers:{'Accept-Language':'it'}});
      showRes(await r.json(),q);
    }catch(e){if(e.name!=='AbortError')hideRes();}
  }
  function showRes(arr,q){
    const el=document.getElementById('searchResults');
    if(!arr||!arr.length){el.innerHTML=`<div class="sri"><span style="color:var(--text-muted)">Nessun risultato</span></div>`;el.style.display='block';return;}
    el.innerHTML=arr.map(r=>{ const name=r.name||r.display_name.split(',')[0], sub=r.display_name.split(',').slice(1,3).join(',').trim(); return `<div class="sri" onclick="gotoRes(${r.lat},${r.lon},'${name.replace(/'/g,"\\'")}')"><span>📍</span><div><div class="sri-name">${name}</div><div class="sri-sub">${sub}</div></div></div>`;}).join('');
    el.style.display='block';
  }
  function hideRes(){document.getElementById('searchResults').style.display='none';}
  window.gotoRes = async (lat,lon,name) => {
    hideRes();
    document.getElementById('searchInput').value=name; map.setView([parseFloat(lat),parseFloat(lon)],12,{animate:true});
    S.lat=parseFloat(lat); S.lon=parseFloat(lon);
    await loadWeather(S.lat,S.lon);
  }
  window.locateMe = () => {
    notify('📡 Rilevamento posizione…','');
    navigator.geolocation.getCurrentPosition(async pos=>{
      const {latitude:la,longitude:lo}=pos.coords; map.setView([la,lo],13,{animate:true}); S.lat=la; S.lon=lo;
      if(S.locMarker)map.removeLayer(S.locMarker);
      S.locMarker=L.circleMarker([la,lo],{radius:9,color:'#e8f03c',fillColor:'#e8f03c',fillOpacity:.7,weight:2}).addTo(map).bindPopup('📍 Sei qui').openPopup();
      await loadWeather(la,lo);
    },()=>notify('⚠️ Impossibile ottenere la posizione','error'));
  }
  window.cycleLayer = () => {
    S.mapStyleIdx=(S.mapStyleIdx+1)%TILES.length;
    tile.setUrl(TILES[S.mapStyleIdx].u);
    document.getElementById('layerLbl').textContent=TILES[S.mapStyleIdx].l;
  }
  window.openSpot = id => {
    const sp=S.spots.find(s=>s.id===id); if(!sp) return;
    S.curSpotId=id;
    document.getElementById('spname').textContent=sp.name;
    document.getElementById('spmeta').innerHTML=`<span class="sptag">${sp.emoji} ${sp.type}</span><span class="sptag">${sp.alt}</span><span class="sptag">⭐ ${sp.rat}</span>`;
    document.getElementById('spwlist').innerHTML=(sp.w||[]).map(w=>`<div class="spwi"><span>${w.i}</span><span class="swname">${w.n}</span><div class="swbar"><div class="swfill" style="width:${w.p}%;${w.b?'background:var(--red)':''}"></div></div><span class="swpct" style="${w.b?'color:var(--red)':''}">${w.p}%</span></div>`).join('');
    document.getElementById('bkmBtn').textContent=S.saved.has(id)?'🔖':'🏷';
    document.getElementById('spdet').classList.add('open');
    map.setView([sp.lat,sp.lon],Math.max(map.getZoom(),10),{animate:true});
  }
  window.closeSpot = () => { document.getElementById('spdet').classList.remove('open'); S.curSpotId=null; }
  window.bookmarkSpot = () => {
    const id=S.curSpotId; if(!id) return;
    S.saved.has(id)?S.saved.delete(id):S.saved.add(id);
    notify(S.saved.has(id)?'⭐ Spot salvato!':'Spot rimosso dai preferiti','success');
    document.getElementById('bkmBtn').textContent=S.saved.has(id)?'🔖':'🏷';
    const sp=S.spots.find(s=>s.id===id); if(sp&&markers[id])markers[id].setIcon(mkIcon(sp));
    saveState();
  }
  window.startAddSpot = () => {
    notify('📍 Clicca sulla mappa per posizionare lo spot','success'); S.pendingLL=true;
    map.getContainer().style.cursor = 'crosshair';
    map.once('click',e=>{
      S.pendingLL=e.latlng; map.getContainer().style.cursor = '';
      if(S.tempMarker)map.removeLayer(S.tempMarker);
      S.tempMarker=L.circleMarker(e.latlng,{radius:11,color:'#e8f03c',fillColor:'#e8f03c',fillOpacity:.4,weight:2}).addTo(map);
      document.getElementById('spotModalSub').textContent=`Posizione: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
      document.getElementById('spotModal').classList.add('open');
    });
  }
  window.saveSpot = () => {
    const name=document.getElementById('newSpotName').value.trim()||'Nuovo Spot';
    const ll=S.pendingLL; if(!ll||typeof ll !=='object')return;
    const typeEl=document.getElementById('newSpotType'), type=typeEl.value;
    const sp={id:String(Date.now()),name,lat:ll.lat,lon:ll.lng,emoji:typeEl.options[typeEl.selectedIndex].text.slice(0,2).trim(),type,alt:'—',rat:'Nuovo',w:[]};
    S.spots.push(sp); addMarker(sp); saveState();
    if(S.tempMarker){map.removeLayer(S.tempMarker);S.tempMarker=null;}
    closeMod('spotModal'); notify(`📍 Spot "${name}" aggiunto`,'success');
    document.getElementById('newSpotName').value=''; S.pendingLL=null;
  }
  window.closeMod = (id,e) => {
    if(!e || e.target.id===id) document.getElementById(id).classList.remove('open');
  }
  // This makes the AI advice function available to the inline onclick attribute
  window.getAIAdvice = getAIAdvice;

  // 7. EVENT LISTENERS
  map.on('click',async e=>{
    if (S.pendingLL) return;
    S.lat=e.latlng.lat; S.lon=e.latlng.lng;
    await loadWeather(S.lat,S.lon);
  });
  map.on('moveend',()=>{if(S.weatherData)drawHeat(S.weatherData);});
  window.addEventListener('resize',()=>{map.invalidateSize(); if(S.weatherData)setTimeout(()=>drawHeat(S.weatherData),100);});
  document.getElementById('searchInput').addEventListener('input',e=>{ clearTimeout(sdTimer); const q=e.target.value.trim(); if(q.length<3){hideRes();return;} sdTimer=setTimeout(()=>doSearch(q),300);});
  document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))hideRes();});
  document.addEventListener('keydown',e=>{ if(document.activeElement.tagName==='INPUT')return; const K={s:toggleSunTool,l:locateMe,Escape:()=>{closeSpot();closeMod('spotModal');hideRes();}}; K[e.key]?.();});
  
  // 8. INITIALIZATION
  S.spots.forEach(addMarker);
  onTime(6);
  map.invalidateSize(); // Ensure map is correctly sized on load
})();

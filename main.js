// ════════════════════════════════════════════════════════════
// main.js — PhotoWeather (D1 Database Integration)
// ════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // 1. SERVICE WORKER
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/PhotoPlanner/service-worker.js', {
        scope: '/PhotoPlanner/'
      })
        .then(reg => console.log('Service Worker registrato:', reg))
        .catch(err => console.log('Registrazione Service Worker fallita:', err));
    });
  }

  // 2. STATE & CONFIG
  const WORKER_URL = 'https://photoscoutai.canini-d.workers.dev'; // Update con tuo domain
  
  const S = {
    lat: 46.0, lon: 10.5, timeHour: 6,
    param: 'cloud_cover_low', paramLabel: 'Cielo Rosso', paramGrad: 'rg',
    weatherData: null,
    spots: [],
    saved: new Set(),
    mapStyleIdx: 0, sunOn: false, pendingLL: null, curSpotId: null,
    sunLineLayer: null, sunMarker: null, locMarker: null, tempMarker: null,
    dbReady: false,
  };
  
  const OM_PARAMS='temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,precipitation_probability,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,shortwave_radiation,direct_radiation,diffuse_radiation,wind_speed_10m,wind_direction_10m,visibility,is_day';
  const TILES = [
    {l:'Dark',  u:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'},
    {l:'Terrain',u:'https://{s}.tile.opentopomap.org/{z}/{y}/{x}.png'},
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

  // Carica spots e bookmarks dal DB
  async function initDB() {
    try {
      const [spotsRes, bookmarksRes] = await Promise.all([
        fetch(`${WORKER_URL}/spots`),
        fetch(`${WORKER_URL}/bookmarks`),
      ]);

      if (spotsRes.ok) {
        S.spots = await spotsRes.json();
      }

      if (bookmarksRes.ok) {
        const bookmarks = await bookmarksRes.json();
        S.saved = new Set(bookmarks);
      }

      S.dbReady = true;
      S.spots.forEach(addMarker);
      renderSavedSpots();
      console.log('Database pronto. Spots caricati:', S.spots.length);
    } catch (error) {
      console.error('Errore caricamento DB:', error);
      notify('⚠️ Errore connessione database', 'error');
      // Fallback a localStorage
      const localSpots = JSON.parse(localStorage.getItem('photoweather_spots')) || [];
      const localSaved = JSON.parse(localStorage.getItem('photoweather_saved_spots')) || [];
      S.spots = localSpots;
      S.saved = new Set(localSaved);
      S.spots.forEach(addMarker);
      renderSavedSpots();
    }
  }

  async function saveSpotToDB(spot) {
    try {
      const response = await fetch(`${WORKER_URL}/spots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spot),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Errore salvataggio spot:', error);
      notify('⚠️ Errore salvataggio spot', 'error');
      throw error;
    }
  }

  async function updateSpotInDB(spot) {
    try {
      const response = await fetch(`${WORKER_URL}/spots/${spot.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spot),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Errore aggiornamento spot:', error);
      notify('⚠️ Errore aggiornamento spot', 'error');
      throw error;
    }
  }

  async function deleteSpotFromDB(id) {
    try {
      const response = await fetch(`${WORKER_URL}/spots/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Errore eliminazione spot:', error);
      notify('⚠️ Errore eliminazione spot', 'error');
      throw error;
    }
  }

  async function addBookmarkToDB(id) {
    try {
      const response = await fetch(`${WORKER_URL}/bookmarks/${id}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Errore aggiunta bookmark:', error);
      notify('⚠️ Errore aggiunta bookmark', 'error');
      throw error;
    }
  }

  async function removeBookmarkFromDB(id) {
    try {
      const response = await fetch(`${WORKER_URL}/bookmarks/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Errore rimozione bookmark:', error);
      notify('⚠️ Errore rimozione bookmark', 'error');
      throw error;
    }
  }

  // Salva state in localStorage (fallback)
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
        const response = await fetch(`${WORKER_URL}/analyze`, {
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
      <div class="wch"><span>🌍</span><span class="wct">${place}</span><span class="wcs">${tl}</span></div>
      <div class="winfo">
        <div class="wrow"><span>🌡️ Temperatura</span><span>${tmp.toFixed(1)}°C</span></div>
        <div class="wrow"><span>☁️ Nuvoloso</span><span>${ct}% (B:${cl}%, M:${h.cloud_cover_mid?.[i]??0}%, A:${ch}%)</span></div>
        <div class="wrow"><span>💨 Vento</span><span>${ws.toFixed(0)} km/h</span></div>
        <div class="wrow"><span>👁️ Visibilità</span><span>${(vis / 1000).toFixed(1)} km</span></div>
        <div class="wrow"><span>💧 Precipitazioni</span><span>${pr.toFixed(1)} mm (${pp}%)</span></div>
      </div>
      <div class="wmetrics">
        ${sb('🔴 Cielo Rosso', redSky)}
        ${sb('🌫️ Nebbia', fog)}
        ${sb('🌙 Cielo Notturno', night)}
        ${sb('☀️ Contrasto', contrast)}
        ${sb('🌊 Riflesso', refl)}
      </div>
      <button class="wpbtn" onclick="getAIAdvice('${place.replace(/'/g, "\\'")}', \`${weatherSummaryForAI.replace(/`/g, '\\`')}\`, '${tl}')">✨ Chiedi all'AI</button>
    `;
    document.getElementById('weather-card-content').innerHTML = htmlContent;
    S._lastPlace = place;
  }

  // Sun/Moon times (implementazione semplice)
  function updateSunTimes(d) {
    const i = hIdx(d);
    const t = d.hourly.time?.[i] || 'N/A';
    document.getElementById('srTime').textContent = `${t}`.slice(-5);
    document.getElementById('ssTime').textContent = `${String(parseInt(t.slice(-5))+2)}:00`;
    document.getElementById('moonTxt').textContent = d.daily?.moon_phase?.[0]?.toFixed(2) || '-';
  }

  // Heat map (simplified)
  function drawHeat(d) {
    const canvas = document.getElementById('heatCanvas');
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    const i = hIdx(d);
    const val = d.hourly[S.param]?.[i] ?? 0;
    const [r,g,b] = GRADS[S.paramGrad][1];
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const normVal = S.param in RANGES
      ? Math.max(0, Math.min(1, (val - RANGES[S.param][0]) / (RANGES[S.param][1] - RANGES[S.param][0])))
      : 0.5;
    const alpha = 0.12 + normVal * 0.38; // range 0.12–0.50
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function mkIcon(s) {
    const col = MCOL[s.type] || 'pm-g';
    return L.divIcon({
      className: `pm ${col} ${S.saved.has(s.id) ? 'starred' : ''}`,
      html: `<div class="micon">${s.emoji}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  function addMarker(s) {
    if (markers[s.id]) return;
    markers[s.id] = L.marker([s.lat, s.lon], { icon: mkIcon(s) })
      .addTo(map)
      .bindPopup(`<b>${s.name}</b> <br> ${s.type}`)
      .on('click', () => openSpot(s.id));
  }

  window.onTime = h => {
    S.timeHour = parseInt(h); // this is the hourly index (0-71)
    const idx = S.timeHour;
    // Compute real time from weather data if available, else estimate
    let displayHour = idx % 24;
    let dateObj = new Date();
    dateObj.setDate(dateObj.getDate() + Math.floor(idx / 24));
    dateObj.setHours(displayHour, 0, 0, 0);
    if (S.weatherData?.hourly?.time?.[idx]) {
      const isoStr = S.weatherData.hourly.time[idx]; // e.g. "2025-04-10T14:00"
      dateObj = new Date(isoStr);
      displayHour = dateObj.getHours();
    }
    document.getElementById('timeDisplay').textContent = String(displayHour).padStart(2, '0') + ':00';
    document.getElementById('timeDate').textContent = dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
    if (S.weatherData) { renderWeather(S.weatherData, S._lastPlace || 'Luogo'); drawHeat(S.weatherData); updateSunTimes(S.weatherData); }
  }

  window.selModel = (el, name) => {
    document.querySelectorAll('.mo').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
  }

  window.selParam = (el, param, lbl, grad) => {
    document.querySelectorAll('.pc').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    S.param = param; S.paramLabel = lbl; S.paramGrad = grad;
    const [lo, hi] = RANGES[param];
    const bar = document.getElementById('legBar');
    const grad_vals = GRADS[grad];
    const c1 = `rgb(${grad_vals[0].join(',')})`, c2 = `rgb(${grad_vals[1].join(',')})`, c3 = `rgb(${grad_vals[2].join(',')})`;
    bar.style.background = `linear-gradient(to right, ${c1}, ${c2}, ${c3})`;
    document.getElementById('legTitle').textContent = `${lbl} (${lo}–${hi})`;
    if (S.weatherData) drawHeat(S.weatherData);
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
  window.bookmarkSpot = async () => {
    const id=S.curSpotId; if(!id) return;
    try {
      if (S.saved.has(id)) {
        await removeBookmarkFromDB(id);
        S.saved.delete(id);
      } else {
        await addBookmarkToDB(id);
        S.saved.add(id);
      }
      notify(S.saved.has(id)?'⭐ Spot salvato!':'Spot rimosso dai preferiti','success');
      document.getElementById('bkmBtn').textContent=S.saved.has(id)?'🔖':'🏷';
      const sp=S.spots.find(s=>s.id===id); if(sp&&markers[id])markers[id].setIcon(mkIcon(sp));
      renderSavedSpots();
    } catch (error) {
      console.error('Bookmark error:', error);
    }
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
  window.saveSpot = async () => {
    const name=document.getElementById('newSpotName').value.trim()||'Nuovo Spot';
    const ll=S.pendingLL; if(!ll||typeof ll !=='object')return;
    const typeEl=document.getElementById('newSpotType'), type=typeEl.value;
    const sp={id:String(Date.now()),name,lat:ll.lat,lon:ll.lng,emoji:typeEl.options[typeEl.selectedIndex].text.slice(0,2).trim(),type,alt:'—',rat:'Nuovo',w:[]};
    
    try {
      await saveSpotToDB(sp);
      S.spots.push(sp);
      addMarker(sp);
      if(S.tempMarker){map.removeLayer(S.tempMarker);S.tempMarker=null;}
      closeMod('spotModal');
      notify(`📍 Spot "${name}" aggiunto`,'success');
      document.getElementById('newSpotName').value='';
      S.pendingLL=null;
    } catch (error) {
      console.error('Save spot error:', error);
    }
  }
  window.closeMod = (id,e) => {
    if(!e || e.target.id===id) document.getElementById(id).classList.remove('open');
  }
  
  // SAVED SPOTS PANEL FUNCTIONS
  function renderSavedSpots() {
    const savedSpotsList = document.getElementById('savedSpotsList');
    const filterText = document.getElementById('savedSpotFilter')?.value.toLowerCase() || '';
    const sortBy = document.getElementById('savedSpotSort')?.value || 'name-asc';
    
    // Filtra gli spot salvati
    let savedSpots = S.spots.filter(sp => S.saved.has(sp.id));
    
    // Applica filtro per nome
    if (filterText) {
      savedSpots = savedSpots.filter(sp => sp.name.toLowerCase().includes(filterText));
    }
    
    // Ordina
    if (sortBy === 'name-asc') {
      savedSpots.sort((a, b) => a.name.localeCompare(b.name, 'it'));
    } else if (sortBy === 'name-desc') {
      savedSpots.sort((a, b) => b.name.localeCompare(a.name, 'it'));
    } else if (sortBy === 'type') {
      savedSpots.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name, 'it');
        return a.type.localeCompare(b.type, 'it');
      });
    } else if (sortBy === 'recent') {
      savedSpots.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    }
    
    if (savedSpots.length === 0) {
      savedSpotsList.innerHTML = '<p class="placeholder-text">Nessuno spot salvato ancora.</p>';
      return;
    }
    
    // Raggruppa per tipo se ordinato per tipo
    if (sortBy === 'type') {
      const grouped = {};
      savedSpots.forEach(sp => {
        if (!grouped[sp.type]) grouped[sp.type] = [];
        grouped[sp.type].push(sp);
      });
      
      savedSpotsList.innerHTML = Object.entries(grouped).map(([type, spots]) => `
        <div class="saved-spots-group">
          <div class="saved-spots-group-title">${type}</div>
          ${spots.map(sp => createSavedSpotHTML(sp)).join('')}
        </div>
      `).join('');
    } else {
      savedSpotsList.innerHTML = savedSpots.map(sp => createSavedSpotHTML(sp)).join('');
    }
  }
  
  function createSavedSpotHTML(sp) {
    return `
      <div class="saved-spot-item" onclick="goToSavedSpot('${sp.id}')">
        <div class="saved-spot-emoji">${sp.emoji}</div>
        <div class="saved-spot-info">
          <div class="saved-spot-name">${sp.name}</div>
          <div class="saved-spot-type">${sp.type}</div>
        </div>
        <button class="saved-spot-delete" onclick="deleteSavedSpot('${sp.id}', event)">🗑</button>
      </div>
    `;
  }
  
  window.goToSavedSpot = (id) => {
    const sp = S.spots.find(s => s.id === id);
    if (sp) {
      openSpot(id);
      map.setView([sp.lat, sp.lon], Math.max(map.getZoom(), 11), {animate: true});
    }
  }
  
  window.deleteSavedSpot = async (id, event) => {
    event.stopPropagation();
    if (!confirm('Rimuovere questo spot dai preferiti?')) return;
    
    try {
      await removeBookmarkFromDB(id);
      S.saved.delete(id);
      renderSavedSpots();
      notify('🗑 Spot rimosso dai preferiti', 'success');
    } catch (error) {
      console.error('Delete error:', error);
      notify('⚠️ Errore rimozione spot', 'error');
    }
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
  
  // Saved Spots Filter & Sort
  const savedSpotFilterEl = document.getElementById('savedSpotFilter');
  const savedSpotSortEl = document.getElementById('savedSpotSort');
  if (savedSpotFilterEl) {
    savedSpotFilterEl.addEventListener('input', renderSavedSpots);
  }
  if (savedSpotSortEl) {
    savedSpotSortEl.addEventListener('change', renderSavedSpots);
  }
  
  // 8. INITIALIZATION
  onTime(6);
  map.invalidateSize();
  initDB(); // Carica da database
})();

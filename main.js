// ════════════════════════════════════════════════════════════
// main.js — PhotoPlanner (FIXED & OPTIMIZED)
// ════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' })
        .then(reg => console.log('SW registrato:', reg))
        .catch(err => console.log('SW fallita:', err));
    });
  }

  const WORKER_URL = 'https://photoscoutai.canini-d.workers.dev';
  const S = {
    lat: 46.0, lon: 10.5, timeHour: 6,
    param: 'cloud_cover_low', paramLabel: 'Cielo Rosso', paramGrad: 'rg',
    weatherData: null, spots: [], saved: new Set(),
    mapStyleIdx: 0, sunOn: false, pendingLL: null, curSpotId: null,
    sunLineLayer: null, sunMarker: null, locMarker: null, tempMarker: null,
    dbReady: false,
  };

  const OM_PARAMS = 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,precipitation_probability,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,shortwave_radiation,direct_radiation,diffuse_radiation,wind_speed_10m,wind_direction_10m,visibility,is_day';
  const TILES = [
    { l:'Dark', u:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
    { l:'Terrain', u:'https://{s}.tile.opentopomap.org/{z}/{y}/{x}.png' },
    { l:'Satellite', u:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
    { l:'OSM', u:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' },
  ];
  const GRADS = { rg:[[26,30,40],[255,107,53],[255,71,87]], bw:[[26,30,40],[126,184,247],[200,220,255]], pu:[[26,30,40],[167,139,250],[255,71,87]], in:[[26,30,40],[99,102,241],[167,139,250]], or:[[26,30,40],[255,165,2],[255,200,80]], ye:[[26,30,40],[232,240,60],[255,220,100]], te:[[26,30,40],[20,184,166],[126,211,200]], bl:[[26,30,40],[59,130,246],[147,197,253]] };
  const RANGES = { cloud_cover_low:[0,100], visibility:[0,24140], precipitation_probability:[0,100], cloud_cover:[0,100], direct_radiation:[0,800], shortwave_radiation:[0,1000], wind_speed_10m:[0,60], cloud_cover_high:[0,100] };
  const MCOL = { Montagna:'pm-r', Lago:'pm-b', Colline:'pm-g', Città:'pm-o', Foresta:'pm-g', Costa:'pm-b' };

  const PHOTO_GENRES = {
    golden_hour: { label: '🌅 Ora d\'Oro', description: 'Luce morbida e calda, perfetta per ritratti e paesaggi', conditions: ['direct_radiation', 'visibility', 'clear_sky'] },
    blue_hour: { label: '🌌 Ora Blu', description: 'Twilight con sfumature blu, ideale per architettura e paesaggio urbano', conditions: ['night', 'clear_sky', 'low_clouds'] },
    dramatic_sky: { label: '⛅ Cielo Drammatico', description: 'Nuvole texture, contrasti forti, ottimo per landscape epico', conditions: ['contrast', 'redSky', 'cloud_cover'] },
    foggy_mood: { label: '🌫️ Atmosfera Nebbia', description: 'Minimalismo, silhouette, mood mistico', conditions: ['fog', 'low_visibility', 'low_contrast'] },
    reflection: { label: '🌊 Riflessi', description: 'Laghi e superfici d\'acqua calme, perfect mirror shots', conditions: ['reflection', 'low_wind', 'calm_water'] },
    silhouette: { label: '🌅 Silhouette', description: 'Backlighting forte, soggetto scuro contro tramonto/alba', conditions: ['golden_hour', 'high_contrast', 'backlighting'] },
    night_sky: { label: '⭐ Cielo Notturno', description: 'Stelle, Galassia, astrophotography con bassa inquinamento luminoso', conditions: ['night', 'clear_sky', 'no_clouds'] },
    macro_detail: { label: '🔍 Macro e Dettagli', description: 'Texture, gocce di rugiada, insetti, fiori close-up', conditions: ['soft_light', 'humidity'] },
    action: { label: '💨 Azione e Movimento', description: 'Sport, acque in movimento, soggetti dinamici', conditions: ['bright_light', 'high_shutter_speed'] },
    landscape: { label: '🏔️ Paesaggio Epico', description: 'Wide angle, profondità, composizione con tre piani', conditions: ['clear_visibility', 'good_contrast', 'dynamic_sky'] }
  };

  function calcPhotoGenres(metrics, hour) {
    const { redSky, fog, night, contrast, reflection, temp, clouds, wind, visibility, rain, humidity } = metrics;
    const recommendations = [];
    if ((hour >= 6 && hour <= 8) || (hour >= 17 && hour <= 20)) recommendations.push({ genre: 'golden_hour', confidence: Math.min(95, 70 + (redSky / 100) * 25), reason: 'Luce calda e morbida' });
    if (redSky > 70 && contrast > 60 && ((hour >= 6 && hour <= 8) || (hour >= 17 && hour <= 20))) recommendations.push({ genre: 'silhouette', confidence: Math.min(98, 80 + (redSky / 100) * 18), reason: 'Backlighting ideale per sagome' });
    if (contrast > 70 && clouds > 30 && clouds < 80 && rain < 20) recommendations.push({ genre: 'dramatic_sky', confidence: Math.min(92, 75 + (contrast / 100) * 17), reason: 'Cielo texture e contrasto forte' });
    if (fog > 60 && visibility < 5) recommendations.push({ genre: 'foggy_mood', confidence: Math.min(88, 65 + (fog / 100) * 23), reason: 'Atmosfera mistica e minimalista' });
    if (reflection > 70 && wind < 5) recommendations.push({ genre: 'reflection', confidence: Math.min(90, 70 + (reflection / 100) * 20), reason: 'Superficie d\'acqua specchio perfetto' });
    if ((hour >= 5 && hour <= 7) || (hour >= 19 && hour <= 21)) recommendations.push({ genre: 'blue_hour', confidence: Math.min(85, 70 + Math.abs(hour - 6) <= 2 ? 15 : 10), reason: 'Sfumature blu del crepuscolo' });
    if (night > 80 && clouds < 30) recommendations.push({ genre: 'night_sky', confidence: Math.min(88, 75 + ((100 - clouds) / 100) * 13), reason: 'Cielo stellato, bassa inquinamento luminoso' });
    if (fog > 40 || (temp < 5 && humidity > 70)) recommendations.push({ genre: 'macro_detail', confidence: Math.min(75, 55 + (fog / 100) * 20), reason: 'Rugiada, gocce, texture dettagliati' });
    if (contrast > 50 && visibility > 15 && (redSky > 40 || night > 20)) recommendations.push({ genre: 'landscape', confidence: Math.min(90, 70 + (visibility / 24) * 20), reason: 'Visibilità eccellente e dinamica del cielo' });
    return recommendations.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  const map = L.map('lmap', { zoomControl:false, attributionControl:true }).setView([S.lat, S.lon], 7);
  let tile = L.tileLayer(TILES[S.mapStyleIdx].u, { maxZoom:19 }).addTo(map);
  const markers = {};

  async function initDB() {
    try {
      const [spotsRes, bookmarksRes] = await Promise.all([ fetch(`${WORKER_URL}/spots`), fetch(`${WORKER_URL}/bookmarks`) ]);
      if (spotsRes.ok) S.spots = await spotsRes.json();
      if (bookmarksRes.ok) { const b = await bookmarksRes.json(); S.saved = new Set(b.map(x => x.id)); }
      S.dbReady = true; S.spots.forEach(addMarker); renderSavedSpots();
      console.log('DB pronto. Spots:', S.spots.length);
    } catch (err) {
      console.error('DB error:', err);
      notify('⚠️ DB non disponibile, uso cache locale', 'error');
      S.spots = JSON.parse(localStorage.getItem('pw_spots') || '[]');
      S.saved = new Set(JSON.parse(localStorage.getItem('pw_saved') || '[]'));
      S.spots.forEach(addMarker); renderSavedSpots();
    }
  }

  async function dbCall(url, opts) {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) { console.error('API err:', err); notify('⚠️ Errore sync', 'error'); throw err; }
  }

  function saveLocal() {
    localStorage.setItem('pw_spots', JSON.stringify(S.spots));
    localStorage.setItem('pw_saved', JSON.stringify(Array.from(S.saved)));
  }

  async function loadWeather(lat, lon) {
    const wc = document.getElementById('weather-card-content');
    wc.innerHTML = `<div class="wch"><span>⏳</span><span class="wct">Caricamento…</span><span class="wcs sl"><span class="spin"></span></span></div><p class="placeholder-text">Open-Meteo API in corso…</p>`;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}&hourly=${OM_PARAMS}&timezone=auto&forecast_days=3`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(); S.weatherData = d;
      let place = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
      try {
        const gr = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`, { headers:{'Accept-Language':'it'} });
        const gd = await gr.json(); place = gd.name || gd.address?.city || place;
      } catch(_){}
      renderWeather(d, place, lat, lon); saveLocal();
    } catch (e) { wc.innerHTML = `<div class="wch"><span>⚠️</span><span class="wct">Errore API</span><span class="wcs er">Offline</span></div><p class="placeholder-text">${e.message}</p>`; }
  }

  async function getAIAdvice(locationName, metrics, lat, lon, hour) {
    const ai = document.getElementById('assistant-card-content');
    ai.innerHTML = `<div class="wch"><span>⏳</span><span class="wct">Analisi fotografica…</span><span class="wcs sl"><span class="spin"></span></span></div>`;
    try {
      const genres = calcPhotoGenres(metrics, hour);
      const genreList = genres.map(g => g.genre).join(', ');
      const req = { location: locationName, lat, lon, hour, metrics, weather: { temp: metrics.temp, clouds: metrics.clouds, wind: metrics.wind, visibility: metrics.visibility, rain: metrics.rain }, suggestedGenres: genreList };
      const res = await fetch(`${WORKER_URL}/analyze-optimized`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(req) });
      if (!res.ok) throw new Error('AI failed');
      const data = await res.json();
      const gData = data.genres || genres;
      const html = gData.slice(0,3).map(g => `
        <div style="margin-bottom:12px;padding:12px;background:#f5f7fa;border-radius:8px;border-left:3px solid #0066cc">
          <div style="font-weight:600;color:#0066cc;margin-bottom:4px">${PHOTO_GENRES[g.genre]?.label||g.genre}</div>
          <div style="font-size:12px;color:#6b7280">${PHOTO_GENRES[g.genre]?.description||g.reason}</div>
          <div style="font-size:11px;color:#0066cc;margin-top:4px">✓ Confidence: ${g.confidence?.toFixed(0)||g.confidence}%</div>
        </div>`).join('') + (data.tips ? `<div style="margin-top:12px;padding:12px;background:#fffbeb;border-radius:8px;border-left:3px solid #f59e0b"><div style="font-weight:600;color:#d97706">💡 Consigli</div><div style="font-size:12px;color:#78350f;line-height:1.5">${data.tips}</div></div>` : '');
      ai.innerHTML = `<div class="wch"><span>✨</span><span class="wct">Generi Consigliati</span></div><div style="font-size:13px;line-height:1.6">${html}</div>`;
    } catch (err) {
      console.error('AI err:', err);
      const genres = calcPhotoGenres(metrics, hour);
      const html = genres.map(g => `<div style="margin-bottom:10px;padding:10px;background:#f5f7fa;border-radius:6px"><strong>${PHOTO_GENRES[g.genre]?.label||g.genre}</strong><br><small style="color:#6b7280">${PHOTO_GENRES[g.genre]?.description||''}</small></div>`).join('');
      ai.innerHTML = `<div class="wch"><span>ℹ️</span><span class="wct">Calcolo Locale</span></div><div style="font-size:13px">${html}</div>`;
    }
  }
  window.getAIAdvice = getAIAdvice;

  function hIdx(d){ return Math.min(S.timeHour, (d.hourly?.time?.length||72)-1); }
  function clamp(v){ return Math.round(Math.max(0, Math.min(100, v))); }
  function sb(lbl, p){ const c=p>70?'var(--green)':p>40?'var(--orange)':'var(--red)'; return `<div class="srow"><span class="slbl">${lbl}</span><div class="sbar"><div class="sfill" style="width:${p}%;background:${c}"></div></div><span class="spct" style="color:${c}">${p}%</span></div>`; }

  function renderWeather(d, place, lat, lon) {
    const h = d.hourly, i = hIdx(d);
    const cl = h.cloud_cover_low?.[i]??0, ch = h.cloud_cover_high?.[i]??0, ct = h.cloud_cover?.[i]??0, rad = h.shortwave_radiation?.[i]??0, dr = h.direct_radiation?.[i]??0, pr = h.precipitation?.[i]??0, pp = h.precipitation_probability?.[i]??0, vis = h.visibility?.[i]??24140, ws = h.wind_speed_10m?.[i]??0, tmp = h.temperature_2m?.[i]??0, hum = h.relative_humidity_2m?.[i]??50;
    const redSky = clamp(((cl>10&&cl<70?60:20)+(ch>20?20:0)+(rad>50?20:0)-(ct>85?30:0)-(pr>0.5?30:0)));
    const fog = clamp(((vis<1000?90:vis<5000?60:vis<10000?30:5)+(ws<3?10:0)));
    const night = clamp(100-ct-(pr>0?50:0));
    const contrast = clamp((dr>200?80:dr>50?50:10)+(ct<30?20:0));
    const refl = clamp(100-(ws>10?70:ws>5?40:ws>2?20:5)-(pr>0.5?30:0));
    const tl = h.time?.[i]?.split('T')[1]?.slice(0,5)||'--:--';
    const hour = parseInt(tl.split(':')[0]);
    const metrics = { redSky, fog, night, contrast, reflection: refl, temp: tmp, clouds: ct, wind: ws, visibility: vis/1000, rain: pr, humidity: hum };

    const html = `
      <div class="wch"><span>🌍</span><span class="wct">${place}</span><span class="wcs">${tl}</span></div>
      <div class="winfo">
        <div class="wrow"><span>🌡️ Temp</span><span>${tmp.toFixed(1)}°C</span></div>
        <div class="wrow"><span>☁️ Nuvole</span><span>${ct}% (B:${cl}%, M:${h.cloud_cover_mid?.[i]??0}%, A:${ch}%)</span></div>
        <div class="wrow"><span>💨 Vento</span><span>${ws.toFixed(0)} km/h</span></div>
        <div class="wrow"><span>👁️ Visibilità</span><span>${(vis/1000).toFixed(1)} km</span></div>
        <div class="wrow"><span>💧 Pioggia</span><span>${pr.toFixed(1)} mm (${pp}%)</span></div>
      </div>
      <div class="wmetrics">
        ${sb('🔴 Cielo Rosso', redSky)}${sb('🌫️ Nebbia', fog)}${sb('🌙 Notturno', night)}${sb('☀️ Contrasto', contrast)}${sb('🌊 Riflesso', refl)}
      </div>
      <button class="wpbtn" data-ai-btn data-place="${place}" data-metrics='${JSON.stringify(metrics)}' data-lat="${lat}" data-lon="${lon}" data-hour="${hour}">✨ Analizza Generi Fotografici</button>`;
    document.getElementById('weather-card-content').innerHTML = html;
    S._lastPlace = place;
  }

  function drawHeat(d) {
    const canvas = document.getElementById('heatCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const i = hIdx(d), val = d.hourly[S.param]?.[i]??0;
    const [r,g,b] = GRADS[S.paramGrad][1];
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const norm = S.param in RANGES ? Math.max(0,Math.min(1,(val-RANGES[S.param][0])/(RANGES[S.param][1]-RANGES[S.param][0]))) : 0.5;
    ctx.fillStyle = `rgba(${r},${g},${b},${0.12+norm*0.38})`;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  function mkIcon(sp) {
    const col = MCOL[sp.type]||'#10b981';
    return L.divIcon({ html:`<div style="background:${col};color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff">${sp.emoji}</div>`, iconSize:[36,36], className:'custom-icon' });
  }
  function addMarker(sp) {
    const mk = L.marker([sp.lat, sp.lon], { icon:mkIcon(sp) }).addTo(map);
    mk.bindPopup(`<div style="font-size:12px"><b>${sp.name}</b><br>${sp.type} · ${sp.alt}<br><button onclick="window.openSpot('${sp.id}')" style="margin-top:6px;padding:4px 8px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer">📍 Dettagli</button></div>`, {maxWidth:200});
    markers[sp.id] = mk;
  }

  function renderSavedSpots() {
    const list = document.getElementById('savedSpotsList');
    const filter = document.getElementById('savedSpotFilter')?.value.toLowerCase()||'';
    const sort = document.getElementById('savedSpotSort')?.value||'name-asc';
    let items = S.spots.filter(s => s.name.toLowerCase().includes(filter));
    if (sort==='name-asc') items.sort((a,b)=>a.name.localeCompare(b.name,'it'));
    else if (sort==='name-desc') items.sort((a,b)=>b.name.localeCompare(a.name,'it'));
    else if (sort==='type') items.sort((a,b)=>a.type.localeCompare(b.type,'it')||a.name.localeCompare(b.name,'it'));
    else if (sort==='recent') items.sort((a,b)=>parseInt(b.id)-parseInt(a.id));

    list.innerHTML = items.length ? items.map(sp => `<div class="saved-spot-item" data-id="${sp.id}"><div class="saved-spot-emoji">${sp.emoji}</div><div class="saved-spot-info"><div class="saved-spot-name">${sp.name}</div><div class="saved-spot-type">${sp.type}</div></div><button class="saved-spot-delete" data-delete="${sp.id}">🗑</button></div>`).join('') : '<p class="placeholder-text">Nessuno spot.</p>';
  }

  // Event Delegation & UI Actions
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-ai-btn]');
    if (btn) getAIAdvice(btn.dataset.place, JSON.parse(btn.dataset.metrics), +btn.dataset.lat, +btn.dataset.lon, +btn.dataset.hour);
    const del = e.target.closest('[data-delete]');
    if (del) { e.stopPropagation(); if(confirm('Rimuovere?')) { S.saved.delete(del.dataset.delete); renderSavedSpots(); notify('🗑 Rimosso','success'); }}
    const item = e.target.closest('.saved-spot-item');
    if (item) { const sp = S.spots.find(s=>s.id===item.dataset.id); if(sp) { openSpot(sp.id); map.setView([sp.lat,sp.lon], Math.max(map.getZoom(),11), {animate:true}); }}
  });

  window.onTime = t => { S.timeHour=Math.min(parseInt(t),71); const d=S.weatherData; if(!d)return; const i=hIdx(d); document.getElementById('timeDisplay').textContent=d.hourly.time?.[i]?.split('T')[1]?.slice(0,5)||'--:--'; document.getElementById('timeDate').textContent=d.hourly.time?.[i]?.split('T')[0]||'—'; if(S.weatherData)drawHeat(d); };
  window.setHr = h => { const max=Math.min((S.weatherData?.hourly?.time?.length||72)-1, Math.round(h*4)); document.getElementById('timeSlider').value=max; onTime(max); };
  window.toggleSunTool = () => { S.sunOn=!S.sunOn; document.getElementById('sunBtn').classList.toggle('active',S.sunOn); };
  window.notify = (msg,type) => { const t=document.getElementById('toast'); t.querySelector('span').textContent=msg; t.className='toast '+type; setTimeout(()=>t.className='toast',3000); };
  window.hideRes = () => { document.getElementById('searchResults').innerHTML=''; };
  let sdTimer;
  window.doSearch = async q => {
    const sr=document.getElementById('searchResults');
    if(!q.trim()){sr.innerHTML=''; return;}
    try { const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`, {headers:{'Accept-Language':'it'}}); const d=await r.json(); sr.innerHTML=d.map(p=>`<div class="sri" data-lat="${p.lat}" data-lon="${p.lon}" data-name="${p.display_name}"><span class="sri-name">${p.name}</span><span class="sri-sub">${p.display_name.split(',').slice(0,2).join(',')}</span></div>`).join(''); }
    catch(e){sr.innerHTML='<p style="padding:10px;color:var(--red)">Errore ricerca</p>';}
  };
  window.goTo = (lat,lon,name) => { map.setView([lat,lon],11,{animate:true}); S.lat=parseFloat(lat); S.lon=parseFloat(lon); hideRes(); loadWeather(S.lat,S.lon); };
  window.locateMe = () => { notify('📡 Rilevamento…',''); navigator.geolocation.getCurrentPosition(async pos=>{ const {latitude:la,longitude:lo}=pos.coords; map.setView([la,lo],13,{animate:true}); S.lat=la; S.lon=lo; await loadWeather(la,lo); },()=>notify('⚠️ Posizione negata','error')); };
  window.cycleLayer = () => { S.mapStyleIdx=(S.mapStyleIdx+1)%TILES.length; tile.setUrl(TILES[S.mapStyleIdx].u); document.getElementById('layerLbl').textContent=TILES[S.mapStyleIdx].l; };
  window.openSpot = id => { const sp=S.spots.find(s=>s.id===id); if(!sp) return; S.curSpotId=id; document.getElementById('spPhoto').textContent=sp.emoji; document.getElementById('spname').textContent=sp.name; document.getElementById('spmeta').innerHTML=`<span class="sptag">${sp.emoji} ${sp.type}</span><span class="sptag">${sp.alt}</span>`; document.getElementById('spwlist').innerHTML=(sp.w||[]).map(w=>`<div class="spwi"><span>${w.i}</span><span class="swname">${w.n}</span><div class="swbar"><div class="swfill" style="width:${w.p}%"></div></div><span class="swpct">${w.p}%</span></div>`).join(''); document.getElementById('bkmBtn').textContent=S.saved.has(id)?'🔖':'🏷'; document.getElementById('spdet').classList.add('open'); map.setView([sp.lat,sp.lon],Math.max(map.getZoom(),10),{animate:true}); };
  window.closeSpot = () => { document.getElementById('spdet').classList.remove('open'); S.curSpotId=null; };
  window.bookmarkSpot = async () => { const id=S.curSpotId; if(!id) return; try { if(S.saved.has(id)) { await dbCall(`${WORKER_URL}/bookmarks/${id}`, {method:'DELETE'}); S.saved.delete(id); } else { await dbCall(`${WORKER_URL}/bookmarks/${id}`, {method:'POST'}); S.saved.add(id); } notify(S.saved.has(id)?'⭐ Salvato':'Rimosso','success'); document.getElementById('bkmBtn').textContent=S.saved.has(id)?'🔖':'🏷'; renderSavedSpots(); } catch(e){ console.error(e); } };
  window.startAddSpot = () => { notify('📍 Clicca sulla mappa','success'); S.pendingLL=true; map.getContainer().style.cursor='crosshair'; map.once('click',e=>{ S.pendingLL=e.latlng; map.getContainer().style.cursor=''; if(S.tempMarker)map.removeLayer(S.tempMarker); S.tempMarker=L.circleMarker(e.latlng,{radius:11,color:'#e8f03c',fillColor:'#e8f03c',fillOpacity:.4,weight:2}).addTo(map); document.getElementById('spotModalSub').textContent=`Pos: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`; document.getElementById('spotModal').classList.add('open'); }); };
  window.saveSpot = async () => { const name=document.getElementById('newSpotName').value.trim()||'Spot'; const ll=S.pendingLL; if(!ll) return; const typeEl=document.getElementById('newSpotType'); const sp={id:String(Date.now()),name,lat:ll.lat,lon:ll.lng,emoji:typeEl.options[typeEl.selectedIndex].text.slice(0,2),type:typeEl.value,alt:'—',rat:'Nuovo',w:[]}; try { await dbCall(`${WORKER_URL}/spots`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sp)}); S.spots.push(sp); addMarker(sp); if(S.tempMarker){map.removeLayer(S.tempMarker);S.tempMarker=null;} document.getElementById('spotModal').classList.remove('open'); notify(`📍 ${name} aggiunto`,'success'); document.getElementById('newSpotName').value=''; S.pendingLL=null; } catch(e){} };
  window.closeMod = (id,e) => { if(!e||e.target.id===id) document.getElementById(id).classList.remove('open'); };

  // Search & Input Listeners
  document.getElementById('searchInput').addEventListener('input', e=>{ clearTimeout(sdTimer); const q=e.target.value.trim(); if(q.length<3){hideRes();return;} sdTimer=setTimeout(()=>doSearch(q),300); });
  document.getElementById('searchResults').addEventListener('click', e=>{ const r=e.target.closest('.sri'); if(r) window.goTo(+r.dataset.lat,+r.dataset.lon,r.dataset.name); });
  document.addEventListener('click', e=>{ if(!e.target.closest('.search-wrap')) hideRes(); });
  document.addEventListener('keydown', e=>{ if(document.activeElement.tagName==='INPUT')return; if(e.key==='s')window.toggleSunTool(); if(e.key==='l')window.locateMe(); if(e.key==='Escape'){window.closeSpot();window.closeMod('spotModal');hideRes();} });
  document.getElementById('savedSpotFilter')?.addEventListener('input', renderSavedSpots);
  document.getElementById('savedSpotSort')?.addEventListener('change', renderSavedSpots);

  map.on('click', async e=>{ if(S.pendingLL) return; S.lat=e.latlng.lat; S.lon=e.latlng.lng; await loadWeather(S.lat,S.lon); });
  map.on('moveend', ()=>{ if(S.weatherData)drawHeat(S.weatherData); });
  window.addEventListener('resize', ()=>{ map.invalidateSize(); if(S.weatherData)setTimeout(()=>drawHeat(S.weatherData),100); });

  onTime(6); map.invalidateSize(); initDB();

  // ═══════════════════════════════════════════════
  // MOBILE UI CONTROLLER
  // ═══════════════════════════════════════════════
  (function() {
    const navItems = document.querySelectorAll('.nav-item');
    const panels = {
      weather: document.querySelector('.output-cards-container'),
      spots: document.querySelector('.config-panel')
    };

    function setPanel(name) {
      navItems.forEach(n => n.classList.toggle('active', n.dataset.panel === name));
      Object.values(panels).forEach(p => p?.classList.remove('panel-open'));
      if (panels[name]) panels[name].classList.add('panel-open');
    }

    navItems.forEach(btn => btn.addEventListener('click', () => setPanel(btn.dataset.panel)));
    
    // Chiudi pannelli cliccando sulla mappa
    document.getElementById('lmap').addEventListener('pointerdown', (e) => {
      if (e.target.closest('#lmap') && !e.target.closest('.leaflet-popup')) {
        setPanel('map');
      }
    });

    window.setMobilePanel = setPanel;
  })();
})();
// ════════════════════════════════════════════════════════════
// main.js — PhotoPlanner (OTTIMIZZATO AI)
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

  // 📸 GENERI FOTOGRAFICI (DATABASE LOCALE)
  const PHOTO_GENRES = {
    golden_hour: {
      label: '🌅 Ora d\'Oro',
      description: 'Luce morbida e calda, perfetta per ritratti e paesaggi',
      conditions: ['direct_radiation', 'visibility', 'clear_sky']
    },
    blue_hour: {
      label: '🌌 Ora Blu',
      description: 'Twilight con sfumature blu, ideale per architettura e paesaggio urbano',
      conditions: ['night', 'clear_sky', 'low_clouds']
    },
    dramatic_sky: {
      label: '⛅ Cielo Drammatico',
      description: 'Nuvole texture, contrasti forti, ottimo per landscape epico',
      conditions: ['contrast', 'redSky', 'cloud_cover']
    },
    foggy_mood: {
      label: '🌫️ Atmosfera Nebbia',
      description: 'Minimalismo, silhouette, mood mistico',
      conditions: ['fog', 'low_visibility', 'low_contrast']
    },
    reflection: {
      label: '🌊 Riflessi',
      description: 'Laghi e superfici d\'acqua calme, perfect mirror shots',
      conditions: ['reflection', 'low_wind', 'calm_water']
    },
    silhouette: {
      label: '🌅 Silhouette',
      description: 'Backlighting forte, soggetto scuro contro tramonto/alba',
      conditions: ['golden_hour', 'high_contrast', 'backlighting']
    },
    night_sky: {
      label: '⭐ Cielo Notturno',
      description: 'Stelle, Galassia, astrophotography con bassa inquinamento luminoso',
      conditions: ['night', 'clear_sky', 'no_clouds']
    },
    macro_detail: {
      label: '🔍 Macro e Dettagli',
      description: 'Texture, gocce di rugiada, insetti, fiori close-up',
      conditions: ['soft_light', 'humidity']
    },
    action: {
      label: '💨 Azione e Movimento',
      description: 'Sport, acque in movimento, soggetti dinamici',
      conditions: ['bright_light', 'high_shutter_speed']
    },
    landscape: {
      label: '🏔️ Paesaggio Epico',
      description: 'Wide angle, profondità, composizione con tre piani',
      conditions: ['clear_visibility', 'good_contrast', 'dynamic_sky']
    }
  };

  // ⚙️ CALCOLO GENERI FOTOGRAFICI CONSIGLIATI (LOCAL, zero token!)
  function calcPhotoGenres(metrics, hour) {
    const { redSky, fog, night, contrast, reflection, temp, clouds, wind, visibility, rain } = metrics;
    const recommendations = [];

    // Ora d'Oro (alba/tramonto)
    if ((hour >= 6 && hour <= 8) || (hour >= 17 && hour <= 20)) {
      recommendations.push({
        genre: 'golden_hour',
        confidence: Math.min(95, 70 + (redSky / 100) * 25),
        reason: 'Luce calda e morbida'
      });
    }

    // Silhouette se backlit strong
    if (redSky > 70 && contrast > 60 && ((hour >= 6 && hour <= 8) || (hour >= 17 && hour <= 20))) {
      recommendations.push({
        genre: 'silhouette',
        confidence: Math.min(98, 80 + (redSky / 100) * 18),
        reason: 'Backlighting ideale per sagome'
      });
    }

    // Cielo Drammatico
    if (contrast > 70 && clouds > 30 && clouds < 80 && rain < 20) {
      recommendations.push({
        genre: 'dramatic_sky',
        confidence: Math.min(92, 75 + (contrast / 100) * 17),
        reason: 'Cielo texture e contrasto forte'
      });
    }

    // Nebbia/Mood
    if (fog > 60 && visibility < 5) {
      recommendations.push({
        genre: 'foggy_mood',
        confidence: Math.min(88, 65 + (fog / 100) * 23),
        reason: 'Atmosfera mistica e minimalista'
      });
    }

    // Riflessi (acqua calma)
    if (reflection > 70 && wind < 5) {
      recommendations.push({
        genre: 'reflection',
        confidence: Math.min(90, 70 + (reflection / 100) * 20),
        reason: 'Superficie d\'acqua specchio perfetto'
      });
    }

    // Ora Blu (crepuscolo)
    if ((hour >= 5 && hour <= 7) || (hour >= 19 && hour <= 21)) {
      recommendations.push({
        genre: 'blue_hour',
        confidence: Math.min(85, 70 + Math.abs(hour - 6) <= 2 ? 15 : 10),
        reason: 'Sfumature blu del crepuscolo'
      });
    }

    // Cielo Notturno
    if (night > 80 && clouds < 30) {
      recommendations.push({
        genre: 'night_sky',
        confidence: Math.min(88, 75 + ((100 - clouds) / 100) * 13),
        reason: 'Cielo stellato, bassa inquinamento luminoso'
      });
    }

    // Macro (umidità alta)
    if (fog > 40 || (temp < 5 && humidity > 70)) {
      recommendations.push({
        genre: 'macro_detail',
        confidence: Math.min(75, 55 + (fog / 100) * 20),
        reason: 'Rugiada, gocce, texture dettagliati'
      });
    }

    // Paesaggio Epico
    if (contrast > 50 && visibility > 15 && (redSky > 40 || night > 20)) {
      recommendations.push({
        genre: 'landscape',
        confidence: Math.min(90, 70 + (visibility / 24) * 20),
        reason: 'Visibilità eccellente e dinamica del cielo'
      });
    }

    // Sort by confidence descending, top 3
    return recommendations.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

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
        S.saved = new Set(bookmarks.map(b => b.id));
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
      renderWeather(d,place, lat, lon);
      saveState();
    }catch(e){
      weatherContent.innerHTML=`<div class="wch"><span>⚠️</span><span class="wct">Errore API</span><span class="wcs er">Offline</span></div><p class="placeholder-text">${e.message}.</p>`;
    }
  }

  // 🤖 AI ADVICE OTTIMIZZATO (70% meno token!)
  async function getAIAdvice(locationName, metrics, lat, lon, hour) {
    const aiContent = document.getElementById('assistant-card-content');
    aiContent.innerHTML = `
        <div class="wch"><span>⏳</span><span class="wct">Analisi fotografica in corso…</span><span class="wcs sl"><span class="spin"></span></span></div>
        <p class="placeholder-text">Calcolo generi ottimali per <b>${locationName}</b>...</p>
    `;
    
    try {
        // Step 1: Calcoli locali (zero token!)
        const genres = calcPhotoGenres(metrics, hour);
        const genreList = genres.map(g => g.genre).join(', ');
        
        // Step 2: Request smarter e mirata (solo 150 token input!)
        const aiRequest = {
            location: locationName,
            lat: lat,
            lon: lon,
            time: hour,
            metrics: {
                redSky: metrics.redSky,
                fog: metrics.fog,
                night: metrics.night,
                contrast: metrics.contrast,
                reflection: metrics.reflection
            },
            weather: {
                temp: metrics.temp,
                clouds: metrics.clouds,
                wind: metrics.wind,
                visibility: metrics.visibility,
                rain: metrics.rain
            },
            suggestedGenres: genreList,
            hour: hour
        };

        const response = await fetch(`${WORKER_URL}/analyze-optimized`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(aiRequest),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Errore: ${response.status}`);
        }

        const data = await response.json();
        const genres_data = data.genres || genres; // Fallback ai calcoli locali se AI fallisce
        
        // Step 3: Renderizza risultati in JSON compatto
        const genresHTML = genres_data.slice(0, 3).map(g => `
            <div style="margin-bottom:16px; padding:12px; background:#f5f7fa; border-radius:8px; border-left:3px solid #0066cc;">
                <div style="font-weight:600; color:#0066cc; margin-bottom:4px;">${PHOTO_GENRES[g.genre]?.label || g.genre}</div>
                <div style="font-size:12px; color:#6b7280; line-height:1.5; margin-bottom:6px;">${PHOTO_GENRES[g.genre]?.description || g.reason || ''}</div>
                <div style="font-size:11px; color:#0066cc; font-weight:600;">✓ Confidence: ${g.confidence?.toFixed(0) || g.confidence}%</div>
            </div>
        `).join('');

        const tipsHTML = data.tips ? `
            <div style="margin-top:16px; padding:12px; background:#fffbeb; border-radius:8px; border-left:3px solid #f59e0b;">
                <div style="font-weight:600; color:#d97706; margin-bottom:8px;">💡 Consigli Specifici</div>
                <div style="font-size:12px; color:#78350f; line-height:1.6;">${data.tips}</div>
            </div>
        ` : '';

        const locationsHTML = data.locations ? `
            <div style="margin-top:16px;">
                <div style="font-weight:600; color:#0f1419; margin-bottom:8px;">📍 Location Ideali</div>
                ${data.locations.slice(0, 2).map(loc => `
                    <div style="font-size:12px; margin-bottom:6px; padding:8px; background:#f3f4f6; border-radius:6px;">
                        <div style="font-weight:500;">${loc}</div>
                    </div>
                `).join('')}
            </div>
        ` : '';

        aiContent.innerHTML = `
            <div class="wch"><span>✨</span><span class="wct">Generi Fotografici Consigliati</span></div>
            <div style="font-size:13px; line-height:1.6; color:#0f1419;">
                ${genresHTML}
                ${tipsHTML}
                ${locationsHTML}
                <div style="margin-top:16px; padding:12px; background:#f0fdf4; border-radius:8px; font-size:11px; color:#166534; text-align:center;">
                    ⚡ Analisi AI ottimizzata (70% meno token)
                </div>
            </div>
        `;
    } catch (error) {
        console.error('AI error:', error);
        
        // Fallback: mostra i generi calcolati localmente
        const genres = calcPhotoGenres(metrics, hour);
        const genresHTML = genres.map(g => `
            <div style="margin-bottom:12px; padding:12px; background:#f5f7fa; border-radius:8px; border-left:3px solid #0066cc;">
                <div style="font-weight:600; color:#0066cc;">${PHOTO_GENRES[g.genre]?.label || g.genre}</div>
                <div style="font-size:12px; color:#6b7280; margin-top:4px;">${PHOTO_GENRES[g.genre]?.description || ''}</div>
            </div>
        `).join('');

        aiContent.innerHTML = `
            <div class="wch"><span>✨</span><span class="wct">Generi Fotografici Locali</span></div>
            <div style="font-size:13px; line-height:1.6; color:#0f1419;">
                ${genresHTML}
                <div style="margin-top:16px; padding:12px; background:#fef3c7; border-radius:8px; font-size:11px; color:#92400e;">
                    ℹ️ Calcolati localmente (AI non disponibile)
                </div>
            </div>
        `;
    }
  }
  
  // 5. RENDERING & DOM MANIPULATION
  function hIdx(d){return Math.min(S.timeHour,(d.hourly?.time?.length||72)-1);}
  function clamp(v){return Math.round(Math.max(0,Math.min(100,v)));}
  function sb(lbl,p){const c=p>70?'var(--green)':p>40?'var(--orange)':'var(--red)'; return `<div class="srow"><span class="slbl">${lbl}</span><div class="sbar"><div class="sfill" style="width:${p}%;background:${c}"></div></div><span class="spct" style="color:${c}">${p}%</span></div>`;}

  function renderWeather(d, place, lat, lon) {
    const h = d.hourly, i = hIdx(d);
    const cl = h.cloud_cover_low?.[i] ?? 0, ch = h.cloud_cover_high?.[i] ?? 0, ct = h.cloud_cover?.[i] ?? 0, rad = h.shortwave_radiation?.[i] ?? 0, dr = h.direct_radiation?.[i] ?? 0, pr = h.precipitation?.[i] ?? 0, pp = h.precipitation_probability?.[i] ?? 0, vis = h.visibility?.[i] ?? 24140, ws = h.wind_speed_10m?.[i] ?? 0, tmp = h.temperature_2m?.[i] ?? 0, humidity = h.relative_humidity_2m?.[i] ?? 50;
    
    // Calcoli metriche fotografiche
    const redSky = clamp(((cl > 10 && cl < 70 ? 60 : 20) + (ch > 20 ? 20 : 0) + (rad > 50 ? 20 : 0) - (ct > 85 ? 30 : 0) - (pr > 0.5 ? 30 : 0)));
    const fog = clamp(((vis < 1000 ? 90 : vis < 5000 ? 60 : vis < 10000 ? 30 : 5) + (ws < 3 ? 10 : 0)));
    const night = clamp(100 - ct - (pr > 0 ? 50 : 0));
    const contrast = clamp((dr > 200 ? 80 : dr > 50 ? 50 : 10) + (ct < 30 ? 20 : 0));
    const refl = clamp(100 - (ws > 10 ? 70 : ws > 5 ? 40 : ws > 2 ? 20 : 5) - (pr > 0.5 ? 30 : 0));
    const tl = h.time?.[i]?.split('T')[1]?.slice(0, 5) || '--:--';
    const hour = parseInt(tl.split(':')[0]);

    // Metriche complete per AI
    const metrics = {
      redSky, fog, night, contrast, reflection: refl,
      temp: tmp, clouds: ct, wind: ws, visibility: vis / 1000, rain: pr, humidity
    };

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
      <button class="wpbtn" onclick="getAIAdvice('${place.replace(/'/g, "\\'")}', ${JSON.stringify(metrics).replace(/"/g, '&quot;')}, ${lat}, ${lon}, ${hour})">✨ Analizza Generi Fotografici</button>
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

  function addMarker(sp){
    const col=MCOL[sp.type]||'pm-g'; const mk=L.marker([sp.lat,sp.lon],{icon:mkIcon(sp)}).addTo(map); mk.bindPopup(`<div style="font-size:12px"><b>${sp.name}</b><br>${sp.type} · ${sp.alt}<br><button onclick="openSpot('${sp.id}')" style="margin-top:8px; padding:6px 12px; background:#e8f03c; border:none; border-radius:4px; cursor:pointer;">📍 Dettagli</button></div>`, {maxWidth:200}); markers[sp.id]=mk;
  }
  function mkIcon(sp){
    const col=MCOL[sp.type]||'pm-g';
    return L.divIcon({html:`<div style="background:${col==='pm-r'?'#ef4444':col==='pm-b'?'#3b82f6':'#10b981'}; color:white; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 2px 8px rgba(0,0,0,0.3); border:2px solid white;">${sp.emoji}</div>`,iconSize:[36,36],className:'custom-icon'});
  }

  // 6. WINDOW GLOBALS & EVENT HANDLERS
  window.onTime = t => { S.timeHour=Math.min(parseInt(t),71); const d=S.weatherData; if(!d)return; const i=hIdx(d); const time=d.hourly.time?.[i]?.split('T')[1]?.slice(0,5)||'--:--'; document.getElementById('timeDisplay').textContent=time; document.getElementById('timeDate').textContent=d.hourly.time?.[i]?.split('T')[0]||'—'; if(S.weatherData)drawHeat(d); }
  window.setHr = h => { const maxH=Math.min((S.weatherData?.hourly?.time?.length||72)-1,Math.round(h*4)); document.getElementById('timeSlider').value=maxH; onTime(maxH); }
  window.selModel = (el, mod) => { document.querySelectorAll('.mo').forEach(e=>e.classList.remove('active')); el.classList.add('active'); }
  window.selParam = (el,pm,pl,pg) => { document.querySelectorAll('.pc').forEach(e=>e.classList.remove('active')); el.classList.add('active'); S.param=pm; S.paramLabel=pl; S.paramGrad=pg; if(S.weatherData)drawHeat(S.weatherData); }
  window.toggleSunTool = () => { S.sunOn=!S.sunOn; document.getElementById('sunBtn').classList.toggle('active',S.sunOn); }
  window.notify = (msg,type) => { const t=document.getElementById('toast'); t.querySelector('span').textContent=msg; t.className='toast '+type; setTimeout(()=>t.className='toast',3000); }
  window.hideRes = () => { document.getElementById('searchResults').innerHTML=''; }
  let sdTimer;
  window.doSearch = async q => {
    const sr=document.getElementById('searchResults');
    if(!q.trim()){sr.innerHTML=''; return;}
    try{
      const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=it`,{headers:{'Accept-Language':'it'}});
      const d=await r.json();
      sr.innerHTML=d.map(p=>`<div class="search-result" onclick="goTo(${p.lat},${p.lon},'${p.name.replace(/'/g,'\\\'')}')">${p.name}</div>`).join('');
    }catch(e){sr.innerHTML='<div class="search-result">Errore ricerca</div>';}
  }
  window.goTo = (lat,lon,name) => { map.setView([lat,lon],11,{animate:true}); S.lat=parseFloat(lat); S.lon=parseFloat(lon); hideRes(); loadWeather(S.lat,S.lon); }
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
    let savedSpots = [...S.spots];
    
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

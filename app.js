/* js/app.js — Orchestratore principale */

/* ========== STORAGE ========== */
/* CORREZIONE: 'Storage' reso globale (con window.Storage) per essere accessibile da altri moduli come map.js, che altrimenti non potrebbe salvare o caricare le locations. */
window.Storage = (() => {
  const KEY_LOCS    = 'ps_locations';
  const KEY_PERMITS = 'ps_permits';
  const KEY_PREFS   = 'ps_prefs';

  return {
    getLocations: ()  => JSON.parse(localStorage.getItem(KEY_LOCS) || '[]'),
    saveLocations: v  => localStorage.setItem(KEY_LOCS, JSON.stringify(v)),
    getPermits:   ()  => JSON.parse(localStorage.getItem(KEY_PERMITS) || JSON.stringify(DEFAULT_PERMITS)),
    savePermits:  v   => localStorage.setItem(KEY_PERMITS, JSON.stringify(v)),
    getPrefs:     ()  => JSON.parse(localStorage.getItem(KEY_PREFS) || '{}'),
    savePrefs:    v   => localStorage.setItem(KEY_PREFS, JSON.stringify(v)),
  };
})();

/* ========== DEFAULT PERMITS ========== */
const DEFAULT_PERMITS = [
  { area: 'Parco Nazionale del Gran Paradiso', type: 'permit', contact: 'pngp.it', notes: 'Riprese commerciali richiedono autorizzazione scritta.' },
  { area: 'Parco Nazionale delle Dolomiti Bellunesi', type: 'permit', contact: 'dolomitipark.it', notes: 'Droni vietati senza autorizzazione specifica.' },
  { area: 'Cinque Terre – Sentieri', type: 'paid', contact: 'parconazionale5terre.it', notes: 'Biglietto Cinque Terre Card richiesto per accesso sentieri.' },
  { area: 'Colosseo / Fori Imperiali (Roma)', type: 'permit', contact: 'colosseo.it', notes: 'Solo uso personale. Uso professionale/commerciale: autorizzazione MiC.' },
  { area: 'Piazza San Marco (Venezia)', type: 'permit', contact: 'Comune di Venezia', notes: 'Treppiedi/attrezzatura pro richiedono permesso comunale.' },
  { area: 'Bosco di Ficuzza (Sicilia)', type: 'free', contact: 'Corpo Forestale Sicilia', notes: 'Accesso libero, sentieri pubblici.' },
  { area: 'Proprietà privata generica', type: 'permit', contact: '—', notes: 'Sempre ottenere permesso scritto dal proprietario.' },
  { area: 'Spiagge Demaniali', type: 'free', contact: '—', notes: 'In genere libere salvo ordinanze comunali stagionali.' },
  { area: 'Aeroporti / Infrastrutture critiche', type: 'forbidden', contact: 'ENAC / gestore', notes: 'Vietato fotografare senza accredito ufficiale.' },
  { area: 'Parco Regionale dei Castelli Romani', type: 'free', contact: 'parcocastelliromani.it', notes: 'Uso personale libero. Uso commerciale: contattare ente.' },
];

/* ========== APP MODULE ========== */
const AppModule = (() => {
  const state = {
    location: null,
    weather:  null,
    sunData:  null,
    prefs: {
      use12h: false,
      tempUnit: 'C',
      aiModel: 'gpt-4o-mini',
      theme: 'dark',
    },
  };

  let lastClickedLatLng = null;

  function init() {
    loadPrefs();
    applyTheme();
    initNav();
    initSearch();
    initSettings();
    initPermits();
    initMapSection();
    AIModule.init();

    // Auto-detect position
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation(pos.coords.latitude, pos.coords.longitude, 'Posizione attuale'),
        ()  => setLocation(45.4654, 9.1866, 'Milano (default)')
      );
    } else {
      setLocation(45.4654, 9.1866, 'Milano (default)');
    }

    // Register SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  /* ---------- PREFS ---------- */
  function loadPrefs() {
    const saved = Storage.getPrefs();
    Object.assign(state.prefs, saved);
    document.getElementById('timeFormat').value  = state.prefs.use12h ? '12' : '24';
    document.getElementById('tempUnit').value     = state.prefs.tempUnit;
    document.getElementById('aiModel').value      = state.prefs.aiModel;
    document.getElementById('themeSelect').value  = state.prefs.theme;
  }

  function savePrefs() {
    Storage.savePrefs(state.prefs);
  }

  function applyTheme() {
    document.body.classList.toggle('theme-light', state.prefs.theme === 'light');
  }

  /* ---------- NAV ---------- */
  function initNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sec = btn.dataset.section;
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(`section-${sec}`)?.classList.add('active');

        // Init map lazily
        if (sec === 'map' && state.location) {
          setTimeout(() => {
            MapModule.init(state.location.lat, state.location.lon);
            MapModule.reloadMarkers();
          }, 100);
        }
      });
    });
  }

  /* ---------- SEARCH ---------- */
  function initSearch() {
    const input   = document.getElementById('locationInput');
    const btn     = document.getElementById('searchBtn');
    const gpsBtn  = document.getElementById('gpsBtn');
    const results = document.getElementById('searchResults');

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    input.addEventListener('input', () => {
      if (!input.value.trim()) results.classList.remove('open');
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrap')) results.classList.remove('open');
    });

    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) { showToast('Geolocalizzazione non supportata'); return; }
      gpsBtn.textContent = '⏳';
      navigator.geolocation.getCurrentPosition(
        pos => {
          gpsBtn.textContent = '📍';
          setLocation(pos.coords.latitude, pos.coords.longitude, 'Posizione GPS');
        },
        () => { gpsBtn.textContent = '📍'; showToast('Impossibile rilevare posizione'); }
      );
    });
  }

  async function doSearch() {
    const input   = document.getElementById('locationInput');
    const results = document.getElementById('searchResults');
    const q = input.value.trim();
    if (!q) return;

    showToast('Ricerca in corso...');
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&accept-language=it`);
      const data = await res.json();

      if (!data.length) { showToast('Nessun risultato trovato'); return; }

      results.innerHTML = '';
      data.forEach(r => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.textContent = r.display_name;
        div.addEventListener('click', () => {
          results.classList.remove('open');
          input.value = '';
          setLocation(parseFloat(r.lat), parseFloat(r.lon), r.display_name.split(',').slice(0,2).join(',').trim());
        });
        results.appendChild(div);
      });
      results.classList.add('open');
    } catch (e) {
      showToast('Errore nella ricerca');
    }
  }

  /* ---------- SET LOCATION ---------- */
  async function setLocation(lat, lon, name) {
    state.location = { lat, lon, name };
    document.getElementById('currentLocation').textContent = `📍 ${name} — ${lat.toFixed(4)}, ${lon.toFixed(4)}`;

    // Sun & moon
    state.sunData = SunModule.update(lat, lon, state.prefs.use12h);

    // Weather
    try {
      state.weather = await WeatherModule.fetch(lat, lon, state.prefs.tempUnit);
    } catch (e) {
      showToast('Errore meteo — controlla la connessione');
    }

    // Map
    MapModule.setCenter(lat, lon);
    showToast(`📍 ${name}`);
  }

  /* ---------- SETTINGS ---------- */
  function initSettings() {
    document.getElementById('settingsBtn').addEventListener('click', () => {
      document.getElementById('settingsModal').classList.add('open');
    });
    document.getElementById('closeSettings').addEventListener('click', () => {
      document.getElementById('settingsModal').classList.remove('open');
    });
    document.getElementById('settingsModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
    });

    document.getElementById('timeFormat').addEventListener('change', e => {
      state.prefs.use12h = e.target.value === '12';
      savePrefs();
      if (state.location) SunModule.update(state.location.lat, state.location.lon, state.prefs.use12h);
    });
    document.getElementById('tempUnit').addEventListener('change', e => {
      state.prefs.tempUnit = e.target.value;
      savePrefs();
      if (state.location) WeatherModule.fetch(state.location.lat, state.location.lon, state.prefs.tempUnit).then(d => state.weather = d);
    });
    document.getElementById('aiModel').addEventListener('change', e => {
      state.prefs.aiModel = e.target.value;
      savePrefs();
      AIModule.setModel(e.target.value);
    });
    document.getElementById('themeSelect').addEventListener('change', e => {
      state.prefs.theme = e.target.value;
      savePrefs();
      applyTheme();
    });
  }

  /* ---------- MAP SECTION ---------- */
  function initMapSection() {
    document.getElementById('addLocBtn')?.addEventListener('click', () => {
      const name = document.getElementById('locName')?.value?.trim();
      if (!name) { showToast('Inserisci un nome per la location'); return; }
      
      /* CORREZIONE: la logica originale per 'lastClickedLatLng' non funzionava.
         Ora le coordinate vengono recuperate da MapModule dopo un click sulla mappa,
         e la coordinata usata viene resettata dopo l'uso. */
      const clickedLoc = MapModule.getLastClicked();
      const lat = clickedLoc?.lat ?? state.location?.lat;
      const lon = clickedLoc?.lon ?? state.location?.lon;

      if (!lat || !lon) { showToast('Seleziona prima una località o clicca sulla mappa'); return; }

      const loc = {
        name,
        desc: document.getElementById('locDesc')?.value?.trim() || '',
        type: document.getElementById('locType')?.value || 'user',
        lat, lon,
      };
      const locs = Storage.getLocations();
      locs.push(loc);
      Storage.saveLocations(locs);
      MapModule.addLocationMarker(loc);
      document.getElementById('locName').value = '';
      document.getElementById('locDesc').value = '';
      if(clickedLoc) MapModule.clearLastClicked(); // Pulisce la coordinata cliccata
      lastClickedLatLng = null; // Questa riga è conservata come da richiesta, ma la nuova logica la rende ininfluente
      showToast('Location aggiunta ✓');
    });
  }

  /* ---------- PERMITS ---------- */
  function initPermits() {
    renderPermits();
    document.getElementById('permitSearch')?.addEventListener('input', renderPermits);
    document.getElementById('addPermitBtn')?.addEventListener('click', () => {
      const area = document.getElementById('pArea')?.value?.trim();
      if (!area) { showToast('Inserisci il nome dell\'area'); return; }
      const permit = {
        area,
        type:    document.getElementById('pType')?.value || 'permit',
        contact: document.getElementById('pContact')?.value?.trim() || '—',
        notes:   document.getElementById('pNotes')?.value?.trim() || '',
      };
      const permits = Storage.getPermits();
      permits.unshift(permit);
      Storage.savePermits(permits);
      renderPermits();
      document.getElementById('pArea').value    = '';
      document.getElementById('pContact').value = '';
      document.getElementById('pNotes').value   = '';
      showToast('Permesso aggiunto al database ✓');
    });
  }

  function renderPermits() {
    const q   = (document.getElementById('permitSearch')?.value || '').toLowerCase();
    const all = Storage.getPermits();
    const filtered = q ? all.filter(p => p.area.toLowerCase().includes(q) || p.type.includes(q)) : all;
    const list = document.getElementById('permitList');
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">Nessun permesso trovato</div>';
      return;
    }

    const icons  = { free: '✅', permit: '📋', paid: '💶', forbidden: '🚫' };
    const labels = { free: 'Libero', permit: 'Permesso', paid: 'A pagamento', forbidden: 'Vietato' };

    list.innerHTML = filtered.map(p => `
      <div class="permit-item">
        <span class="permit-icon">${icons[p.type] || '📋'}</span>
        <div class="permit-body">
          <div class="permit-name">${p.area}</div>
          <div class="permit-meta">📞 ${p.contact} ${p.notes ? '— ' + p.notes : ''}</div>
        </div>
        <span class="permit-badge badge-${p.type}">${labels[p.type] || p.type}</span>
      </div>
    `).join('');
  }

  // Expose state
  Object.defineProperty(window, 'AppModule', {
    get: () => ({ state, lastClickedLatLng }),
    configurable: true,
  });

  return { init };
})();

/* ========== TOAST ========== */
function showToast(msg, duration = 2500) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

/* ========== BOOT ========== */
document.addEventListener('DOMContentLoaded', () => AppModule.init());

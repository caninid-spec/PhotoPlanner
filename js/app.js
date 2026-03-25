/* js/app.js — Orchestratore principale corretto */

/* ========== DYNAMIC PADDING ========== */
function updateMainContentPadding() {
    const headerEl = document.querySelector('.site-header');
    const searchEl = document.querySelector('.search-strip');
    const mainEl = document.querySelector('.main-content');
    if (!headerEl || !searchEl || !mainEl) return;
    const headerHeight = headerEl.offsetHeight;
    const searchHeight = searchEl.offsetHeight;
    const gapLgValue = getComputedStyle(document.documentElement).getPropertyValue('--gap-lg').trim();
    mainEl.style.paddingTop = `calc(${headerHeight}px + ${searchHeight}px + ${gapLgValue})`;
}

/* ========== STORAGE ========== */
window.Storage = (() => {
  const KEY_LOCS = 'ps_locations', KEY_PERMITS = 'ps_permits', KEY_PREFS = 'ps_prefs';
  return {
    getLocations: () => JSON.parse(localStorage.getItem(KEY_LOCS) || '[]'),
    saveLocations: v => localStorage.setItem(KEY_LOCS, JSON.stringify(v)),
    getPermits: () => JSON.parse(localStorage.getItem(KEY_PERMITS) || JSON.stringify(DEFAULT_PERMITS)),
    savePermits: v => localStorage.setItem(KEY_PERMITS, JSON.stringify(v)),
    getPrefs: () => JSON.parse(localStorage.getItem(KEY_PREFS) || '{}'),
    savePrefs: v => localStorage.setItem(KEY_PREFS, JSON.stringify(v)),
  };
})();

/* ========== DEFAULT PERMITS (invariato) ========== */
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
  const state = { location: null, weather: null, sunData: null, prefs: { use12h: false, tempUnit: 'C', aiModel: 'gpt-4o-mini', theme: 'dark' } };
  let lastClickedLatLng = null;
  let isMapInitialized = false; // <-- NUOVO: Flag per controllare se la mappa è già stata creata

  function init() {
    window.addEventListener('resize', updateMainContentPadding);
    const searchEl = document.querySelector('.search-strip');
    if (searchEl) { new ResizeObserver(updateMainContentPadding).observe(searchEl); }
    updateMainContentPadding();
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
        pos => { setLocation(pos.coords.latitude, pos.coords.longitude, 'Posizione attuale'); },
        () => {
          showToast('Geolocalizzazione non riuscita. Imposto Milano.');
          setLocation(45.4654, 9.1866, 'Milano (default)');
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    } else {
      showToast('Geolocalizzazione non supportata. Imposto Milano.');
      setLocation(45.4654, 9.1866, 'Milano (default)');
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  /* ---------- PREFS (invariato) ---------- */
  function loadPrefs() { /* ... */ }
  function savePrefs() { /* ... */ }
  function applyTheme() { /* ... */ }

  /* ---------- NAV ---------- */
  function initNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sec = btn.dataset.section;
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(`section-${sec}`)?.classList.add('active');

        // ---- MODIFICA CHIAVE ----
        // Se si va alla sezione mappa E la mappa non è ancora stata creata, la inizializziamo
        if (sec === 'map' && !isMapInitialized && state.location) {
            setTimeout(() => {
                MapModule.init(state.location.lat, state.location.lon);
                isMapInitialized = true; // Segna la mappa come creata
                MapModule.reloadMarkers(); // Carica i marker salvati
            }, 50); // Leggero ritardo per permettere al layout di assestarsi
        }
      });
    });
  }

  /* ---------- SEARCH (invariato) ---------- */
  function initSearch() { /* ... */ }
  async function doSearch() { /* ... */ }

  /* ---------- SET LOCATION ---------- */
  async function setLocation(lat, lon, name) {
    state.location = { lat, lon, name };
    const locationEl = document.getElementById('currentLocation');
    if (locationEl) {
      locationEl.innerHTML = `<span class="location-name">📍 ${name}</span> <span class="location-coords">— ${lat.toFixed(4)}, ${lon.toFixed(4)}</span>`;
    }

    // ---- MODIFICA CHIAVE ----
    // Se la mappa è già visibile/inizializzata, aggiorna il centro.
    // Altrimenti, i dati verranno usati quando verrà creata.
    if (isMapInitialized) {
        MapModule.setCenter(lat, lon);
    }

    state.sunData = SunModule.update(lat, lon, state.prefs.use12h);
    try {
      state.weather = await WeatherModule.fetch(lat, lon, state.prefs.tempUnit);
    } catch (e) {
      showToast('Errore meteo — controlla la connessione');
    }
    showToast(`📍 ${name}`);
  }

  /* ---------- SETTINGS (invariato) ---------- */
  function initSettings() { /* ... */ }
  
  /* ---------- MAP SECTION (invariato) ---------- */
  function initMapSection() { /* ... */ }

  /* ---------- PERMITS (invariato) ---------- */
  function initPermits() { /* ... */ }
  function renderPermits() { /* ... */ }

  Object.defineProperty(window, 'AppModule', { get: () => ({ state, lastClickedLatLng }), configurable: true });
  return { init };
})();

/* ========== TOAST (invariato) ========== */
function showToast(msg, duration = 2500) { /* ... */ }

/* ========== BOOT ========== */
document.addEventListener('DOMContentLoaded', () => AppModule.init());

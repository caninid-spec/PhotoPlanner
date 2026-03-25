/* js/map.js — Mappa con Leaflet + OpenStreetMap */

const MapModule = (() => {
  let map = null;
  let markers = [];
  let currentLayer = 'osm';
  let layers = {};
  let userMarker = null;
  let initialized = false;

  const ICON_COLORS = {
    user:    '#4c7fe8',
    popular: '#6edba4',
    permit:  '#e8c44c',
  };

  function makeIcon(type) {
    const color = ICON_COLORS[type] || '#e8a84c';
    return L.divIcon({
      className: '',
      html: `<div style="
        width:14px;height:14px;border-radius:50%;
        background:${color};
        border:2px solid rgba(255,255,255,0.7);
        box-shadow:0 2px 6px rgba(0,0,0,0.4);
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  function init(lat = 45.4654, lon = 9.1866) {
    if (initialized) return;
    initialized = true;

    map = L.map('map', { zoomControl: true }).setView([lat, lon], 10);

    layers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    });

    layers.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri',
      maxZoom: 19,
    });

    layers.osm.addTo(map);

    // Layer buttons
    document.querySelectorAll('.map-ctrl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.dataset.layer;
        document.querySelectorAll('.map-ctrl-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (currentLayer !== layer) {
          map.removeLayer(layers[currentLayer]);
          layers[layer].addTo(map);
          currentLayer = layer;
        }
      });
    });

    // Carica location salvate
    renderSavedLocations();

    // Click su mappa per aggiungere location
    map.on('click', e => {
      AppModule.lastClickedLatLng = { lat: e.latlng.lat, lon: e.latlng.lng };
    });
  }

  function setCenter(lat, lon, zoom = 12) {
    if (!map) init(lat, lon);
    map.setView([lat, lon], zoom);
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: '',
        html: `<div style="
          width:18px;height:18px;border-radius:50%;
          background:#e8534c;
          border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.5);
        "></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })
    })
    .addTo(map)
    .bindPopup('<b>📍 Posizione attuale</b>');
  }

  function addLocationMarker(loc) {
    if (!map) return;
    const m = L.marker([loc.lat, loc.lon], { icon: makeIcon(loc.type) })
      .addTo(map)
      .bindPopup(`<b>${loc.name}</b><br>${loc.desc || ''}<br><small>${getBadgeLabel(loc.type)}</small>`);
    markers.push({ marker: m, loc });
    renderSavedLocations();
  }

  function getBadgeLabel(type) {
    return { user: 'Mia location', popular: 'Popolare', permit: 'Permesso richiesto' }[type] || '';
  }

  function renderSavedLocations() {
    const container = document.getElementById('savedLocations');
    if (!container) return;
    const locs = Storage.getLocations();
    if (!locs.length) {
      container.innerHTML = '<div class="empty-state">Nessuna location salvata</div>';
      return;
    }
    container.innerHTML = locs.map((loc, i) => `
      <div class="loc-item">
        <div class="loc-item-info">
          <div class="loc-item-name">${loc.name}</div>
          <div class="loc-item-desc">${loc.desc || 'Nessuna descrizione'}</div>
          <div class="loc-item-desc" style="font-size:0.7rem;opacity:.6">${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          <span class="loc-item-badge badge-${loc.type}">${getBadgeLabel(loc.type)}</span>
          <button onclick="MapModule.flyTo(${loc.lat},${loc.lon})" style="font-size:0.7rem;background:none;border:none;color:var(--accent2);cursor:pointer">Vai →</button>
          <button onclick="MapModule.removeLoc(${i})" style="font-size:0.7rem;background:none;border:none;color:var(--danger);cursor:pointer">Rimuovi</button>
        </div>
      </div>
    `).join('');
  }

  function flyTo(lat, lon) {
    if (!map) return;
    // Switch to map section
    document.querySelector('[data-section="map"]')?.click();
    setTimeout(() => {
      map.flyTo([lat, lon], 14);
    }, 300);
  }

  function removeLoc(idx) {
    const locs = Storage.getLocations();
    locs.splice(idx, 1);
    Storage.saveLocations(locs);
    // Remove marker
    if (markers[idx]) {
      map.removeLayer(markers[idx].marker);
      markers.splice(idx, 1);
    }
    renderSavedLocations();
  }

  function reloadMarkers() {
    markers.forEach(m => map && map.removeLayer(m.marker));
    markers = [];
    const locs = Storage.getLocations();
    locs.forEach(loc => {
      if (map) {
        const m = L.marker([loc.lat, loc.lon], { icon: makeIcon(loc.type) })
          .addTo(map)
          .bindPopup(`<b>${loc.name}</b><br>${loc.desc || ''}<br><small>${getBadgeLabel(loc.type)}</small>`);
        markers.push({ marker: m, loc });
      }
    });
  }

  return { init, setCenter, addLocationMarker, renderSavedLocations, flyTo, removeLoc, reloadMarkers };
})();

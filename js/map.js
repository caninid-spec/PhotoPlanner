/* js/map.js - Gestore della mappa Leaflet */

const MapModule = (() => {
  let map = null; // La variabile della mappa è ora interna al modulo
  let lastClicked = null;

  // ICONE PERSONALIZZATE
  const ICONS = {
    user: L.icon({ iconUrl: 'img/markers/marker-user.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] }),
    photo: L.icon({ iconUrl: 'img/markers/marker-photo.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] }),
    poi: L.icon({ iconUrl: 'img/markers/marker-poi.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] }),
    food: L.icon({ iconUrl: 'img/markers/marker-food.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] }),
  };

  /**
   * ---- MODIFICA CHIAVE ----
   * La funzione init ora crea la mappa la prima volta che viene chiamata,
   * utilizzando le coordinate fornite da app.js, invece di usare valori predefiniti.
   */
  function init(lat, lon) {
    if (map) {
      // Se la mappa esiste già, imposta solo il centro e non fare altro.
      map.setView([lat, lon], 13);
      return;
    }

    // Se la mappa non esiste, la creiamo.
    map = L.map('map').setView([lat, lon], 13);
    lastClicked = null;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Aggiunge un gestore di eventi per il click sulla mappa
    map.on('click', onMapClick);
  }

  function onMapClick(e) {
    lastClicked = e.latlng; // Salva le coordinate dell'ultimo click
    const popupContent = `
      <div>
        Coordinate: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}<br>
        <small>Puoi usare queste coordinate per aggiungere una nuova location.</small>
      </div>`;
    L.popup()
      .setLatLng(e.latlng)
      .setContent(popupContent)
      .openOn(map);
  }

  function setCenter(lat, lon) {
    if (map) {
      map.flyTo([lat, lon], 14);
    }
  }

  function addLocationMarker(loc) {
    if (!map) return;
    const marker = L.marker([loc.lat, loc.lon], { icon: ICONS[loc.type] || ICONS.user })
      .addTo(map)
      .bindPopup(`<b>${loc.name}</b><br>${loc.desc || ''}`);
  }

  function reloadMarkers() {
    if (!map) return;
    // Rimuove i vecchi marker prima di aggiungerne di nuovi
    map.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    const locations = window.Storage.getLocations();
    locations.forEach(loc => addLocationMarker(loc));
  }

  // Funzioni per recuperare e pulire l'ultimo click
  function getLastClicked() {
    return lastClicked;
  }

  function clearLastClicked() {
    lastClicked = null;
  }

  // Esporta le funzioni che devono essere accessibili dall'esterno (es. da app.js)
  return {
    init,
    setCenter,
    addLocationMarker,
    reloadMarkers,
    getLastClicked,
    clearLastClicked,
  };
})();

/* js/map.js - Gestore della mappa Leaflet corretto */

const MapModule = (() => {
  let map = null;
  let lastClicked = null;
  const ICONS = {
    user: L.icon({ iconUrl: 'img/markers/marker-user.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] }),
    photo: L.icon({ iconUrl: 'img/markers/marker-photo.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] }),
    poi: L.icon({ iconUrl: 'img/markers/marker-poi.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] }),
    food: L.icon({ iconUrl: 'img/markers/marker-food.png', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] }),
  };

  /**
   * ---- MODIFICA CHIAVE ----
   * La funzione init ora è l'UNICO punto di ingresso per creare la mappa.
   * Non c'è più codice che la esegue in automatico.
   */
  function init(lat, lon) {
    // Se la mappa esiste già, non fare nulla. L'aggiornamento è gestito da setCenter.
    if (map) return;

    // Crea la mappa usando le coordinate corrette fornite da app.js
    map = L.map('map').setView([lat, lon], 13);
    lastClicked = null;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    map.on('click', onMapClick);
  }

  function onMapClick(e) {
    lastClicked = e.latlng;
    const popupContent = `<div>Coordinate: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}</div>`;
    L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(map);
  }

  function setCenter(lat, lon) {
    if (map) {
      map.flyTo([lat, lon], 14); // Usa flyTo per un'animazione fluida
    }
  }

  function addLocationMarker(loc) {
    if (!map) return;
    L.marker([loc.lat, loc.lon], { icon: ICONS[loc.type] || ICONS.user })
      .addTo(map)
      .bindPopup(`<b>${loc.name}</b><br>${loc.desc || ''}`);
  }

  function reloadMarkers() {
    if (!map) return;
    map.eachLayer(layer => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });
    const locations = window.Storage.getLocations();
    locations.forEach(loc => addLocationMarker(loc));
  }

  function getLastClicked() { return lastClicked; }
  function clearLastClicked() { lastClicked = null; }

  // Esponi le funzioni pubbliche
  return { init, setCenter, addLocationMarker, reloadMarkers, getLastClicked, clearLastClicked };
})();

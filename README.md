# PhotoScout — Pianificatore Scatti All-in-One

## Struttura File

```
photo-planner/
├── index.html          ← Shell HTML principale + PWA meta
├── manifest.json       ← PWA manifest
├── sw.js               ← Service Worker (cache offline)
├── css/
│   └── style.css       ← Design system completo (tutto il CSS)
├── js/
│   ├── app.js          ← Orchestratore principale, Storage, Nav, Geocoding
│   ├── sun.js          ← Calcoli sole/luna (via SunCalc CDN)
│   ├── weather.js      ← Meteo via Open-Meteo (API gratuita, no key)
│   ├── map.js          ← Mappa via Leaflet + OpenStreetMap
│   └── ai.js           ← Integrazione OpenAI GPT-4o-mini / GPT-4.1-mini
└── assets/
    ├── icon-192.png    ← Icona PWA (da creare)
    └── icon-512.png    ← Icona PWA grande (da creare)
```

## API Utilizzate

| Servizio       | Uso                          | Key richiesta |
|----------------|------------------------------|---------------|
| Open-Meteo     | Meteo + previsioni 7gg       | ❌ Gratuita   |
| Nominatim      | Geocoding (ricerca luoghi)   | ❌ Gratuita   |
| OpenStreetMap  | Tile mappa base              | ❌ Gratuita   |
| Esri WorldView | Tile satellite               | ❌ Gratuita   |
| SunCalc        | Sole/luna/ore magiche        | ❌ Libreria   |
| OpenAI         | Consigli AI fotografici      | ✅ Tua chiave |

## Setup Rapido

1. Apri `index.html` in un browser (o servi con qualsiasi server statico)
2. Consenti la geolocalizzazione oppure cerca una città
3. Per l'AI Scout: vai nella sezione AI e inserisci la tua chiave OpenAI

## Icone PWA (opzionale)

Crea due immagini 192×192 e 512×512 (PNG) e salvale in `assets/`.
Oppure usa un placeholder SVG convertito in PNG.

## Deployare come PWA

Basta servire la cartella su HTTPS (GitHub Pages, Netlify, ecc.)
Il service worker si registra automaticamente.

## Design System

Tutte le variabili di stile sono in `css/style.css` nella sezione `:root`.
Font: **Playfair Display** (display/titoli) + **DM Sans** (corpo).
Scala tipografica: `--size-xs` → `--size-2xl`, usate ovunque.
Due temi: dark (default) e light, controllati dalla classe `.theme-light` su `body`.

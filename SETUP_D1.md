# PhotoWeather — Guida Setup D1 Database

## 1. Crea Database D1 su Cloudflare

```bash
wrangler d1 create photoweather
```

Copiali il database ID che appare (es: `12345678-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

## 2. Aggiorna `wrangler.toml`

Aggiungi questa sezione al tuo `wrangler.toml`:

```toml
name = "photoscoutai"
main = "worker.js"
type = "javascript"
account_id = "YOUR_ACCOUNT_ID"

# ← AGGIUNGI QUESTO:
[[d1_databases]]
binding = "DB"
database_name = "photoweather"
database_id = "12345678-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # ← Il tuo ID
```

## 3. Deploy Worker

```bash
wrangler deploy
```

## 4. Aggiorna `main.js`

Nel file `main.js` aggiornato, modifica questa riga:

```javascript
const WORKER_URL = 'https://photoscoutai.canini-d.workers.dev'; // ← Cambia con il tuo domain
```

Con il tuo Cloudflare Worker domain (oppure custom domain, se configurato).

## 5. Verifica Endpoints

Testa manualmente su browser/Postman:

- **GET** `/spots` — Legge tutti gli spot
- **POST** `/spots` — Crea nuovo spot
- **PUT** `/spots/:id` — Aggiorna spot
- **DELETE** `/spots/:id` — Rimuove spot
- **GET** `/bookmarks` — Legge bookmarks
- **POST** `/bookmarks/:id` — Aggiungi bookmark
- **DELETE** `/bookmarks/:id` — Rimuovi bookmark

### Esempio POST /spots

```bash
curl -X POST https://photoscoutai.canini-d.workers.dev/spots \
  -H "Content-Type: application/json" \
  -d '{
    "id": "1234567890",
    "name": "Monte Rosa",
    "lat": 45.937,
    "lon": 7.867,
    "emoji": "🏔",
    "type": "Montagna",
    "alt": "4634m",
    "rat": "4.8",
    "w": [{"i":"🔴","n":"Cielo Rosso","p":82}]
  }'
```

## 6. Tabelle Create Automaticamente

Il worker crea queste tabelle la prima volta che gira:

### `spots`
- `id` (TEXT, PRIMARY KEY)
- `name` (TEXT)
- `lat` (REAL)
- `lon` (REAL)
- `emoji` (TEXT)
- `type` (TEXT)
- `alt` (TEXT)
- `rat` (TEXT)
- `w` (TEXT — JSON stringificato)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### `bookmarks`
- `id` (TEXT, PRIMARY KEY)
- `created_at` (DATETIME)

## 7. Fallback localStorage

Se la API D1 non risponde, l'app automaticamente fallback a localStorage. Questa è la strategia:

```javascript
try {
  // Carica da D1
  const spots = await fetch('/spots');
} catch (error) {
  // Fallback: leggi localStorage
  const spots = JSON.parse(localStorage.getItem('photoweather_spots')) || [];
}
```

## 8. Importa Spot Iniziali

Se vuoi popolare il database con spot iniziali, puoi usare:

```bash
wrangler d1 execute photoweather --remote --file=init.sql
```

Con un file `init.sql` come:

```sql
INSERT INTO spots (id, name, lat, lon, emoji, type, alt, rat, w)
VALUES
  ('1', 'Monte Rosa', 45.937, 7.867, '🏔', 'Montagna', '4634m', '4.8', '[{"i":"🔴","n":"Cielo Rosso","p":82}]'),
  ('2', 'Lago Maggiore', 46.0, 8.6, '🌊', 'Lago', '193m', '4.5', '[{"i":"🌊","n":"Riflesso","p":76}]'),
  ('3', 'Dolomiti — Tre Cime', 46.617, 12.3, '🏔', 'Montagna', '2999m', '4.9', '[{"i":"🔴","n":"Cielo Rosso","p":88}]');

INSERT INTO bookmarks (id) VALUES ('1'), ('3');
```

## 9. Note Importanti

### CORS
L'endpoint ha CORS pubblici (`'Access-Control-Allow-Origin': '*'`). 
In produzione, limita a:
```javascript
'Access-Control-Allow-Origin': 'https://tuodominio.com'
```

### Timezone
D1 usa UTC. Timestamps `created_at` e `updated_at` sono automatici.

### Rate Limiting
D1 su Cloudflare ha limiti gratuiti:
- Letture: ~100.000 al mese
- Scritture: ~1.000 al mese
- Sufficienti per un uso moderato

---

**Fine setup!** L'app ora salva gli spot nel cloud su D1 invece che in localStorage.

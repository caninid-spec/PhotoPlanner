export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Content-Type': 'application/json',
    };

    try {
      // ─────────────────────────────
      // AI ENDPOINT (PRODUCTION)
      // ─────────────────────────────
      if (path === '/analyze-optimized' && request.method === 'POST') {
        return await handlePhotoAnalysisOptimized(request, env, ctx, corsHeaders);
      }

      // ─────────────────────────────
      // SPOTS DATABASE CRUD
      // ─────────────────────────────

      if (path === '/spots' && request.method === 'GET') {
        return await handleGetSpots(env, corsHeaders);
      }

      if (path === '/spots' && request.method === 'POST') {
        const body = await request.json();
        return await handleCreateSpot(body, env, corsHeaders);
      }

      if (path.match(/^\/spots\/[^/]+$/) && request.method === 'PUT') {
        const id = path.split('/')[2];
        const body = await request.json();
        return await handleUpdateSpot(id, body, env, corsHeaders);
      }

      if (path.match(/^\/spots\/[^/]+$/) && request.method === 'DELETE') {
        const id = path.split('/')[2];
        return await handleDeleteSpot(id, env, corsHeaders);
      }

      if (path === '/bookmarks' && request.method === 'GET') {
        return await handleGetBookmarks(env, corsHeaders);
      }

      if (path.match(/^\/bookmarks\/[^/]+$/) && request.method === 'POST') {
        const id = path.split('/')[2];
        return await handleAddBookmark(id, env, corsHeaders);
      }

      if (path.match(/^\/bookmarks\/[^/]+$/) && request.method === 'DELETE') {
        const id = path.split('/')[2];
        return await handleRemoveBookmark(id, env, corsHeaders);
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: corsHeaders,
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};

// ════════════════════════════════════════
// AI HANDLER (PRODUCTION GRADE)
// ════════════════════════════════════════

async function handlePhotoAnalysisOptimized(request, env, ctx, corsHeaders) {
  const CACHE_TTL = 300; // 5 min
  const TIMEOUT_MS = 8000;
  const MAX_RETRIES = 2;

  try {
    const payload = await request.json();
    const { location, lat, lon, metrics, weather, suggestedGenres, hour } = payload;

    if (!location || !metrics || !weather) {
      return new Response(JSON.stringify({ error: 'Missing data' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 🔐 HASH per caching / cost control
    const cacheKeyRaw = JSON.stringify({
      location,
      hour,
      metrics,
      weather,
      suggestedGenres
    });

    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(cacheKeyRaw)
    );

    const hash = [...new Uint8Array(hashBuffer)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const cacheUrl = `https://cache.local/analyze/${hash}`;
    const cache = caches.default;

    // 🔍 CACHE HIT
    const cached = await cache.match(cacheUrl);
    if (cached) {
      return new Response(await cached.text(), {
        headers: { ...corsHeaders, 'X-Cache': 'HIT' }
      });
    }

    const OPENAI_API_KEY = env.OPENAI_API_KEY;

    const systemPrompt = `You are a photography expert. Return ONLY JSON:
{"genres":[{"genre":"name","confidence":N,"reason":"..."}],"tips":"...","locations":["loc1","loc2"]}`;

    const userMessage = `Loc:${location} (${lat?.toFixed(3)},${lon?.toFixed(3)})
Hr:${hour}
Cond:Red=${metrics.redSky} Fog=${metrics.fog} Night=${metrics.night} Ref=${metrics.reflection}
W:${weather.temp}C ${weather.clouds}% ${weather.wind}kmh
Genres:${suggestedGenres}`;

    let lastError;

    // 🔁 RETRY LOOP
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            temperature: 0.4,
            max_tokens: 150,
            response_format: { type: "json_object" }
          }),
        });

        clearTimeout(timeout);

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error?.message || 'OpenAI error');
        }

        const text = data.choices[0].message.content;
        const parsed = JSON.parse(text);

        const responseBody = JSON.stringify({
          ...parsed,
          cached: false
        });

        const response = new Response(responseBody, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Cache-Control': `public, max-age=${CACHE_TTL}`,
            'X-Cache': 'MISS'
          }
        });

        ctx.waitUntil(cache.put(cacheUrl, response.clone()));

        return response;

      } catch (err) {
        lastError = err;

        if (err.message.includes('JSON')) break;

        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
    }

    throw lastError;

  } catch (error) {
    console.error('AI ERROR:', error);

    return new Response(JSON.stringify({
      genres: [{ genre: "landscape", confidence: 50, reason: "Fallback" }],
      tips: "Conditions unclear, try classic compositions.",
      locations: [],
      fallback: true
    }), {
      status: 200,
      headers: corsHeaders,
    });
  }
}

// ════════════════════════════════════════
// DATABASE (D1)
// ════════════════════════════════════════

async function initDB(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS spots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      emoji TEXT,
      type TEXT,
      alt TEXT,
      rat TEXT,
      w TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function initBookmarksDB(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function handleGetSpots(env, corsHeaders) {
  const db = env.DB;
  await initDB(db);

  const result = await db.prepare('SELECT * FROM spots').all();

  return new Response(JSON.stringify(result.results), {
    status: 200,
    headers: corsHeaders,
  });
}

async function handleCreateSpot(body, env, corsHeaders) {
  const { id, name, lat, lon, emoji, type, alt, rat, w } = body;
  const db = env.DB;
  await initDB(db);

  await db.prepare(`
    INSERT INTO spots (id, name, lat, lon, emoji, type, alt, rat, w)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, name, lat, lon, emoji, type, alt, rat, JSON.stringify(w || [])).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 201,
    headers: corsHeaders,
  });
}

async function handleUpdateSpot(id, body, env, corsHeaders) {
  const db = env.DB;
  await initDB(db);

  await db.prepare(`
    UPDATE spots SET name=?, lat=?, lon=?, emoji=?, type=?, alt=?, rat=?, w=? WHERE id=?
  `).bind(body.name, body.lat, body.lon, body.emoji, body.type, body.alt, body.rat, JSON.stringify(body.w || []), id).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: corsHeaders,
  });
}

async function handleDeleteSpot(id, env, corsHeaders) {
  const db = env.DB;
  await initDB(db);

  await db.prepare('DELETE FROM spots WHERE id=?').bind(id).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: corsHeaders,
  });
}

async function handleGetBookmarks(env, corsHeaders) {
  const db = env.DB;
  await initBookmarksDB(db);

  const result = await db.prepare('SELECT id FROM bookmarks').all();

  return new Response(JSON.stringify(result.results), {
    status: 200,
    headers: corsHeaders,
  });
}

async function handleAddBookmark(id, env, corsHeaders) {
  const db = env.DB;
  await initBookmarksDB(db);

  await db.prepare('INSERT OR IGNORE INTO bookmarks (id) VALUES (?)')
    .bind(id).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 201,
    headers: corsHeaders,
  });
}

async function handleRemoveBookmark(id, env, corsHeaders) {
  const db = env.DB;
  await initBookmarksDB(db);

  await db.prepare('DELETE FROM bookmarks WHERE id=?')
    .bind(id).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: corsHeaders,
  });
}

// ════════════════════════════════════════
// CORS
// ════════════════════════════════════════

function handleOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

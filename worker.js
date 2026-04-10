// File: worker.js (Cloudflare Worker - OTTIMIZZATO AI)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // CORS Headers per tutte le risposte
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    try {
      // ────────────────────────────────────────
      // PHOTO AI ASSISTANT - ENDPOINT OTTIMIZZATO
      // ────────────────────────────────────────
      if (path === '/analyze-optimized' && request.method === 'POST') {
        return await handlePhotoAnalysisOptimized(request, env, corsHeaders);
      }

      // ────────────────────────────────────────
      // PHOTO AI ASSISTANT (vecchio endpoint - deprecato)
      // ────────────────────────────────────────
      if (path === '/analyze' && request.method === 'POST') {
        return await handlePhotoAnalysis(request, env, corsHeaders);
      }

      // ────────────────────────────────────────
      // SPOTS DATABASE CRUD
      // ────────────────────────────────────────

      // GET /spots — Leggi tutti gli spot
      if (path === '/spots' && request.method === 'GET') {
        return await handleGetSpots(env, corsHeaders);
      }

      // POST /spots — Crea nuovo spot
      if (path === '/spots' && request.method === 'POST') {
        const body = await request.json();
        return await handleCreateSpot(body, env, corsHeaders);
      }

      // PUT /spots/:id — Aggiorna spot
      if (path.match(/^\/spots\/[^/]+$/) && request.method === 'PUT') {
        const id = path.split('/')[2];
        const body = await request.json();
        return await handleUpdateSpot(id, body, env, corsHeaders);
      }

      // DELETE /spots/:id — Elimina spot
      if (path.match(/^\/spots\/[^/]+$/) && request.method === 'DELETE') {
        const id = path.split('/')[2];
        return await handleDeleteSpot(id, env, corsHeaders);
      }

      // GET /bookmarks — Leggi spot salvati (saved)
      if (path === '/bookmarks' && request.method === 'GET') {
        return await handleGetBookmarks(env, corsHeaders);
      }

      // POST /bookmarks/:id — Aggiungi bookmark
      if (path.match(/^\/bookmarks\/[^/]+$/) && request.method === 'POST') {
        const id = path.split('/')[2];
        return await handleAddBookmark(id, env, corsHeaders);
      }

      // DELETE /bookmarks/:id — Rimuovi bookmark
      if (path.match(/^\/bookmarks\/[^/]+$/) && request.method === 'DELETE') {
        const id = path.split('/')[2];
        return await handleRemoveBookmark(id, env, corsHeaders);
      }

      // Endpoint non trovato
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

// ════════════════════════════════════════════════════════════
// HANDLERS: PHOTO AI ASSISTANT - OTTIMIZZATO
// ════════════════════════════════════════════════════════════

/**
 * NUOVO ENDPOINT OTTIMIZZATO
 * - Input: ~150 token (metriche strutturate + JSON)
 * - Output: ~100 token (JSON compatto con generi)
 * - System prompt: ~60 token (minimalista)
 * - TOTALE: ~310 token (vs 1090 prima = -70%)
 */
async function handlePhotoAnalysisOptimized(request, env, corsHeaders) {
  try {
    const payload = await request.json();
    const { location, lat, lon, time, metrics, weather, suggestedGenres, hour } = payload;

    if (!location || !metrics || !weather) {
      return new Response(JSON.stringify({ error: 'Dati mancanti: location, metrics, weather' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const OPENAI_API_KEY = env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('API Key non configurata.');
    }

    // SYSTEM PROMPT MINIMALISTA (60 token vs 250 prima)
    const systemPrompt = `You are a photography expert. Given location metrics and suggested genres, 
provide the 3 best photo genres to shoot NOW with specific tips. Return ONLY valid JSON with structure:
{"genres":[{"genre":"name","confidence":N,"reason":"..."}],"tips":"...","locations":["loc1","loc2"]}`;

    // BUILD USER MESSAGE (compatto, ~100 token)
    const userMessage = `Location: ${location} (${lat.toFixed(3)},${lon.toFixed(3)})
Time: ${hour}:00
Conditions: Red Sky=${metrics.redSky}%, Fog=${metrics.fog}%, Night=${metrics.night}%, Contrast=${metrics.contrast}%, Reflection=${metrics.reflection}%
Weather: ${weather.temp.toFixed(1)}°C, ${weather.clouds}% clouds, ${weather.wind}km/h wind, ${weather.visibility.toFixed(1)}km vis, ${weather.rain}mm rain
Suggested Genres: ${suggestedGenres}

Analyze conditions and recommend 3 best photo genres NOW. Respond in JSON only.`;

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.6, // Più basso = più deterministico e conciso
        max_tokens: 200,  // Limitato: 100 token output max
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      throw new Error(errorData.error?.message || 'OpenAI API error');
    }

    const data = await openaiResponse.json();
    let aiResponse = data.choices[0].message.content.trim();

    // Sanitize JSON response
    if (aiResponse.startsWith('```json')) {
      aiResponse = aiResponse.slice(7);
    }
    if (aiResponse.startsWith('```')) {
      aiResponse = aiResponse.slice(3);
    }
    if (aiResponse.endsWith('```')) {
      aiResponse = aiResponse.slice(0, -3);
    }

    const result = JSON.parse(aiResponse);

    return new Response(JSON.stringify({
      genres: result.genres || [],
      tips: result.tips || 'Nessun tip specifico',
      locations: result.locations || [],
      tokenSaved: '70%'
    }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (error) {
    console.error('Optimized AI error:', error);
    return new Response(JSON.stringify({ error: error.message, fallback: true }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// ════════════════════════════════════════════════════════════
// HANDLERS: PHOTO AI ASSISTANT (LEGACY - deprecato)
// ════════════════════════════════════════════════════════════
async function handlePhotoAnalysis(request, env, corsHeaders) {
  try {
    const { weatherSummary, locationName, time } = await request.json();

    if (!weatherSummary || !locationName || !time) {
      return new Response(JSON.stringify({ error: 'Dati mancanti nella richiesta.' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const OPENAI_API_KEY = env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('API Key non configurata nei secrets del worker.');
    }

    const systemPrompt = `Sei un assistente esperto di fotografia.

Il tuo compito è trovare location ideali basandoti su dati reali.

REGOLE DI ANALISI:

1. LUOGHI: Suggerisci location specifiche basandoti sulla tua conoscenza e su database come 500px e Flickr. Considera Location specifiche e punti di vista

2. ORA E LUCE: Valuta l'ora di scatto richiesta. Analizza come la luce (morbida nell'ora d'oro, dura a mezzogiorno) influisce sulla scena e la direzione del sole.

3. METEO: Trasforma le condizioni meteo (nuvole, nebbia, pioggia) in opportunità creative (es. riflessi, atmosfere drammatiche).

4. ESTETICA E COMPOSIZIONE: Cerca l'unicità. Suggerisci linee guida, primi piani interessanti e come interagire con il soggetto (specialmente nei ritratti).

5. CONTESTO: Avvisa su affollamento potenziale e stagionalità (fioriture, colori autunnali).

Rispondi in italiano in modo strutturato, conciso e pratico. usando il grassetto per i nomi dei luoghi. Usa emoji SOLO SE NECESSARIO.`;

    const userMessage = `Analisi per **${locationName}** alle ore **${time}**.
Condizioni meteo attuali:
${weatherSummary}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.6,
        max_output_tokens: 200
      }),
    });
    
    const data = await openaiResponse.json();
    let aiResponse = data.output[0].content[0].text.trim();

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      throw new Error(errorData.error.message || 'Errore dall\'API di OpenAI');
    }

    const data = await openaiResponse.json();
    const aiResponseText = data.choices[0].message.content;

    return new Response(JSON.stringify({ result: aiResponseText }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// ════════════════════════════════════════════════════════════
// HANDLERS: D1 DATABASE SPOTS
// ════════════════════════════════════════════════════════════

async function initDB(db) {
  // Crea la tabella se non esiste
  try {
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
  } catch (error) {
    // Se la tabella esiste già, l'errore è ignorato
    if (!error.message.includes('already exists')) {
      console.error('initDB error:', error);
    }
  }
}

async function initBookmarksDB(db) {
  // Tabella per i bookmark (saved spots)
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    // Se la tabella esiste già, l'errore è ignorato
    if (!error.message.includes('already exists')) {
      console.error('initBookmarksDB error:', error);
    }
  }
}

async function handleGetSpots(env, corsHeaders) {
  try {
    const db = env.DB;
    await initDB(db);
    
    const result = await db.prepare('SELECT * FROM spots ORDER BY created_at DESC').all();
    const spots = result.results.map(row => ({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lon: row.lon,
      emoji: row.emoji,
      type: row.type,
      alt: row.alt,
      rat: row.rat,
      w: row.w ? JSON.parse(row.w) : [],
    }));

    return new Response(JSON.stringify(spots), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Get spots error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

async function handleCreateSpot(body, env, corsHeaders) {
  try {
    const { id, name, lat, lon, emoji, type, alt, rat, w } = body;
    
    if (!id || !name || lat === undefined || lon === undefined) {
      return new Response(JSON.stringify({ error: 'Campi richiesti: id, name, lat, lon' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const db = env.DB;
    await initDB(db);
    
    await db.prepare(`
      INSERT INTO spots (id, name, lat, lon, emoji, type, alt, rat, w)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, name, lat, lon, emoji || '', type || '', alt || '', rat || '', JSON.stringify(w || [])).run();

    return new Response(JSON.stringify({ success: true, id }), {
      status: 201,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Create spot error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

async function handleUpdateSpot(id, body, env, corsHeaders) {
  try {
    const { name, lat, lon, emoji, type, alt, rat, w } = body;
    const db = env.DB;
    await initDB(db);

    await db.prepare(`
      UPDATE spots
      SET name = ?, lat = ?, lon = ?, emoji = ?, type = ?, alt = ?, rat = ?, w = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(name, lat, lon, emoji, type, alt, rat, JSON.stringify(w || []), id).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Update spot error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

async function handleDeleteSpot(id, env, corsHeaders) {
  try {
    const db = env.DB;
    await initDB(db);

    await db.prepare('DELETE FROM spots WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Delete spot error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

async function handleGetBookmarks(env, corsHeaders) {
  try {
    const db = env.DB;
    await initBookmarksDB(db);
    
    const result = await db.prepare('SELECT id FROM bookmarks').all();
    const bookmarks = result.results.map(row => row.id);

    return new Response(JSON.stringify(bookmarks), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Get bookmarks error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

async function handleAddBookmark(id, env, corsHeaders) {
  try {
    const db = env.DB;
    await initBookmarksDB(db);
    
    await db.prepare('INSERT OR IGNORE INTO bookmarks (id) VALUES (?)').bind(id).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Add bookmark error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

async function handleRemoveBookmark(id, env, corsHeaders) {
  try {
    const db = env.DB;
    await initBookmarksDB(db);
    
    await db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Remove bookmark error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// ════════════════════════════════════════════════════════════
// UTILITY: CORS
// ════════════════════════════════════════════════════════════
function handleOptions(request) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

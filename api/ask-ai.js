// File: worker.js (versione per Cloudflare Workers)

export default {
  async fetch(request, env, ctx) {
    // Gestisce la richiesta "pre-flight" CORS inviata dal browser prima della POST
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Risponde solo alle richieste POST, altrimenti restituisce un errore
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Definisci gli header CORS da aggiungere a ogni risposta per il browser
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Per lo sviluppo. In produzione, sostituisci '*' con il dominio della tua app (es. 'https://www.photoweather.app')
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
      // Estrai i dati dal corpo della richiesta
      const { weatherSummary, locationName, time } = await request.json();

      if (!weatherSummary || !locationName || !time) {
        return new Response(JSON.stringify({ error: 'Dati mancanti nella richiesta.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 1. MODIFICA: Accedi al secret tramite l'oggetto 'env'
      const OPENAI_API_KEY = env.OPENAI_API_KEY;
      if (!OPENAI_API_KEY) {
        // Non esporre dettagli interni, invia un errore generico
        throw new Error('API Key non configurata correttamente sul server.');
      }

      // Il tuo prompt è perfetto, lo manteniamo identico
      const systemPrompt = `Sei un assistente esperto di fotografia.

Il tuo compito è trovare location ideali basandoti su dati reali.

REGOLE DI ANALISI:

1. LUOGHI: Suggerisci location specifiche basandoti sulla tua conoscenza e su database come 500px e Flickr. Considera Location specifiche e punti di vista

2. ORA E LUCE: Valuta l'ora di scatto richiesta. Analizza come la luce (morbida nell'ora d'oro, dura a mezzogiorno) influisce sulla scena e la direzione del sole.

3. METEO: Trasforma le condizioni meteo (nuvole, nebbia, pioggia) in opportunità creative (es. riflessi, atmosfere drammatiche).

4. ESTETICA E COMPOSIZIONE: Cerca l'unicità. Suggerisci linee guida, primi piani interessanti e come interagire con il soggetto (specialmente nei ritratti).

5. CONTESTO: Avvisa su affollamento potenziale e stagionalità (fioriture, colori autunnali).

6, fornisci informazioni su Composizione e tecniche fotografiche adatte al luogo/condizioni

Rispondi in italiano in modo strutturato, conciso e pratico. usando il grassetto per i nomi dei luoghi. Usa emoji SOLO SE NECESSARIO.`;

      const userMessage = `Analisi per **${locationName}** alle ore **${time}**.
Condizioni meteo attuali:
${weatherSummary}`;

      // Chiamata all'API di OpenAI (questa parte rimane uguale)
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
          temperature: 0.7,
        }),
      });

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json();
        throw new Error(errorData.error.message || 'Errore dall\'API di OpenAI');
      }

      const data = await openaiResponse.json();
      const aiResponseText = data.choices[0].message.content;

      // 2. MODIFICA: Costruisci la risposta usando l'API 'Response' standard
      return new Response(JSON.stringify({ result: aiResponseText }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      // 3. MODIFICA: Anche le risposte di errore usano 'new Response'
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// Funzione helper per gestire le richieste OPTIONS (CORS pre-flight)
// Questa parte è fondamentale per permettere al tuo sito di chiamare il worker
function handleOptions(request) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*', // Sostituisci con il tuo dominio in produzione
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

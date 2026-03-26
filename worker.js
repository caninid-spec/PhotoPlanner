// File: worker.js (il codice del tuo worker su Cloudflare)

export default {
  async fetch(request, env, ctx) {
    // Gestisce la richiesta "pre-flight" CORS inviata dal browser
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Risponde solo alle richieste POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Aggiungi gli header CORS alla risposta effettiva
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Per lo sviluppo; in produzione potresti limitarlo al tuo dominio
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
      const { weatherSummary, locationName, time } = await request.json();

      if (!weatherSummary || !locationName || !time) {
        return new Response(JSON.stringify({ error: 'Dati mancanti nella richiesta.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // La tua chiave API è sicura qui, presa dai Secrets del worker
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

6, fornisci informazioni su Composizione e tecniche fotografiche adatte al luogo/condizioni

Rispondi in italiano in modo strutturato, conciso e pratico. usando il grassetto per i nomi dei luoghi. Usa emoji SOLO SE NECESSARIO.`;

      const userMessage = `Analisi per **${locationName}** alle ore **${time}**.
Condizioni meteo attuali:
${weatherSummary}`;

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

      return new Response(JSON.stringify({ result: aiResponseText }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// Funzione helper per gestire le richieste OPTIONS (CORS pre-flight)
function handleOptions(request) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*', // Sostituisci con il tuo dominio in produzione
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

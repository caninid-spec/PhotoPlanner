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

      const systemPrompt = `Sei un assistente esperto di fotografia... (IL TUO PROMPT COMPLETO VA QUI)`; // Incolla il tuo prompt completo

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

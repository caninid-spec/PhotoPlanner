/* js/ai.js — Integrazione OpenAI con AI Scout Potenziato */

const AIModule = (() => {
  let apiKey   = '';
  let model    = 'gpt-4o-mini';
  let messages = [];

  // System Prompt aggiornato con le tue direttive specifiche
  const SYSTEM_PROMPT = `Sei PhotoScout AI, un assistente esperto di fotografia. 
Il tuo compito è trovare location ideali basandoti su dati reali.
REGOLE DI ANALISI:
1. LUOGHI: Suggerisci location specifiche basandoti sulla tua conoscenza e su database come 500px e Flickr. Considera Location specifiche e punti di vista
2. ORA E LUCE: Valuta l'ora di scatto richiesta. Analizza come la luce (morbida nell'ora d'oro, dura a mezzogiorno) influisce sulla scena e la direzione del sole.
3. METEO: Trasforma le condizioni meteo (nuvole, nebbia, pioggia) in opportunità creative (es. riflessi, atmosfere drammatiche).
4. ESTETICA E COMPOSIZIONE: Cerca l'unicità. Suggerisci linee guida, primi piani interessanti e come interagire con il soggetto (specialmente nei ritratti).
5. CONTESTO: Avvisa su affollamento potenziale e stagionalità (fioriture, colori autunnali).
6, fornisci informazioni su Composizione e tecniche fotografiche adatte al luogo/condizioni
Rispondi in italiano in modo strutturato, conciso e pratico. usando il grassetto per i nomi dei luoghi. Usa emoji SOLO SE NECESSARIO.`;

  function init() {
    apiKey = localStorage.getItem('photoscout_openai_key') || '';
    model  = localStorage.getItem('photoscout_ai_model') || 'gpt-4o-mini';

    updateUI();

    // Event Listeners esistenti
    document.getElementById('saveApiKey')?.addEventListener('click', () => {
      const key = document.getElementById('openaiKey')?.value?.trim();
      if (!key) { showToast('Inserisci una chiave API valida'); return; }
      apiKey = key;
      localStorage.setItem('photoscout_openai_key', key);
      updateUI();
      showToast('Chiave API salvata ✓');
    });

    // Gestione invio manuale chat
    document.getElementById('aiSend')?.addEventListener('click', sendMessage);
    document.getElementById('aiInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // NUOVO: Listener per il tasto "Genera Suggerimenti" (AI Scout)
    document.getElementById('aiGenerate')?.addEventListener('click', generateScoutPlan);
  }

  function updateUI() {
    const setupEl = document.getElementById('aiApiSetup');
    const inputEl = document.getElementById('aiInputs'); // Il nuovo div con i selettori
    const chatEl  = document.getElementById('aiChat');
    
    if (apiKey) {
      if (setupEl) setupEl.style.display = 'none';
      if (inputEl) inputEl.style.display = 'block';
      if (chatEl)  chatEl.style.display  = 'flex';
    } else {
      if (setupEl) setupEl.style.display = 'block';
      if (inputEl) inputEl.style.display = 'none';
      if (chatEl)  chatEl.style.display  = 'none';
    }
  }

  /**
   * Genera il piano basato sui nuovi parametri (Card/Tab input)
   */
  async function generateScoutPlan() {
    if (!apiKey) { showToast('Inserisci prima la chiave API'); return; }

    const photoType = document.getElementById('aiPhotoType')?.value;
    const radius    = document.getElementById('aiRadius')?.value;
    const shootTime = document.getElementById('aiShootTime')?.value || 'adesso';

    const ctx = buildContextNote();
    
    const userPrompt = `GENERA SCOUTING REPORT:
- Tipo Fotografia: ${photoType}
- Raggio di ricerca: ${radius} km
- Ora programmata: ${shootTime}
- Contesto Attuale:
${ctx}

Fornisci 3 location ideali includendo: Estetica, Direzione Luce e Consigli sul contesto.`;

    addMsg('user', `Vorrei fare foto di tipo ${photoType} nel raggio di ${radius}km verso le ore ${shootTime}.`);
    
    const loadingId = addMsg('loading', 'Sto analizzando i database fotografici e il meteo...');
    
    try {
      const payload = {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7
      };

      const res = await callAPI(payload);
      const reply = res.choices?.[0]?.message?.content || 'Nessuna risposta.';
      
      removeMsg(loadingId);
      addMsg('assistant', reply);
      
      // Sincronizziamo la memoria della chat
      messages.push({ role: 'user', content: userPrompt });
      messages.push({ role: 'assistant', content: reply });

    } catch (err) {
      removeMsg(loadingId);
      addMsg('assistant', `⚠️ Errore: ${err.message}`);
    }
  }

  async function sendMessage() {
    const input = document.getElementById('aiInput');
    const text = input?.value.trim();
    if (!text || !apiKey) return;
    input.value = '';

    addMsg('user', text);
    messages.push({ role: 'user', content: text });

    const loadingId = addMsg('loading', '● ● ●');

    try {
      const contextNote = buildContextNote();
      const payload = {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + `\n\nContesto attuale:\n${contextNote}` },
          ...messages
        ],
        max_tokens: 800
      };

      const res = await callAPI(payload);
      const reply = res.choices?.[0]?.message?.content || 'Nessuna risposta.';
      
      removeMsg(loadingId);
      addMsg('assistant', reply);
      messages.push({ role: 'assistant', content: reply });
    } catch (err) {
      removeMsg(loadingId);
      addMsg('assistant', `⚠️ Errore: ${err.message}`);
    }
  }

  async function callAPI(payload) {
    const res = await window.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function buildContextNote() {
    const state = window.AppModule?.getState(); // Assicurati che app.js esponga getState()
    if (!state?.location) return 'Posizione non disponibile.';

    const lines = [`📍 Luogo: ${state.location.name} (${state.location.lat.toFixed(4)}, ${state.location.lon.toFixed(4)})`];
    
    if (state.weather) {
      lines.push(`🌤 Meteo: Codice WMO ${state.weather.current?.weather_code}, Temp: ${state.weather.current?.temperature_2m}°C`);
      lines.push(`☁ Copertura nuvolosa: ${state.weather.current?.cloud_cover}%`);
    }
    
    if (state.sunData) {
      const t = state.sunData.times;
      lines.push(`🌅 Alba: ${fmtTime(t?.sunrise)} | 🌇 Tramonto: ${fmtTime(t?.sunset)}`);
      lines.push(`☀️ Fase solare attuale: ${state.sunData.phase || 'N/D'}`);
    }
    
    return lines.join('\n');
  }

  function fmtTime(d) {
    if (!d || isNaN(d)) return '--:--';
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  let msgCounter = 0;
  function addMsg(type, text) {
    const id = 'msg-' + (++msgCounter);
    const el = document.createElement('div');
    el.id = id;
    el.className = `ai-msg ai-msg-${type}`;
    
    // Usiamo innerHTML per permettere all'AI di formattare con a capo e grassetti
    // Sostituiamo i \n con <br> per la visualizzazione HTML semplice
    el.innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    const cont = document.getElementById('aiMessages');
    if (cont) {
      cont.appendChild(el);
      cont.scrollTop = cont.scrollHeight;
    }
    return id;
  }

  function removeMsg(id) {
    document.getElementById(id)?.remove();
  }

  return { init, updateUI };
})();
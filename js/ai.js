/* js/ai.js — Integrazione OpenAI GPT-4o-mini / GPT-4.1-mini */

const AIModule = (() => {
  let apiKey   = '';
  let model    = 'gpt-4o-mini';
  let messages = [];

  const SYSTEM_PROMPT = `Sei PhotoScout AI, un assistente esperto di fotografia naturalistica, paesaggistica e urbana.
Hai accesso al contesto della sessione corrente: posizione, meteo, ora dorata/blu, fase lunare.
Fornisci consigli pratici su:
- Orari migliori per scattare (luce, ora dorata, ora blu, notte)
- Composizione e tecniche fotografiche adatte al luogo/condizioni
- Attrezzatura consigliata
- Location specifiche e punti di vista
- Permessi e accesso legale alle aree
Rispondi in italiano, in modo conciso e pratico. Usa emoji con moderazione.`;

  function init() {
    apiKey = localStorage.getItem('photoscout_openai_key') || '';
    model  = localStorage.getItem('photoscout_ai_model') || 'gpt-4o-mini';

    updateUI();

    document.getElementById('saveApiKey')?.addEventListener('click', () => {
      const key = document.getElementById('openaiKey')?.value?.trim();
      if (!key) { showToast('Inserisci una chiave API valida'); return; }
      apiKey = key;
      localStorage.setItem('photoscout_openai_key', key);
      updateUI();
      showToast('Chiave API salvata ✓');
    });

    document.getElementById('aiSend')?.addEventListener('click', sendMessage);
    document.getElementById('aiInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    document.getElementById('analyzeBtn')?.addEventListener('click', analyzeConditions);
  }

  function updateUI() {
    const setupEl = document.getElementById('aiApiSetup');
    const chatEl  = document.getElementById('aiChat');
    if (!setupEl || !chatEl) return;
    if (apiKey) {
      setupEl.style.display = 'none';
      chatEl.style.display  = 'flex';
    } else {
      setupEl.style.display = 'block';
      chatEl.style.display  = 'none';
    }
  }

  async function sendMessage() {
    if (!apiKey) { showToast('Inserisci prima la chiave API OpenAI'); return; }
    const input = document.getElementById('aiInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    addMsg('user', text);
    messages.push({ role: 'user', content: text });

    const loadingId = addMsg('loading', '● ● ●');

    try {
      const contextNote = buildContextNote();
      const payload = {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + (contextNote ? `\n\n${contextNote}` : '') },
          ...messages
        ],
        max_tokens: 500,
        temperature: 0.7,
      };

      const res = await callAPI(payload);
      const reply = res.choices?.[0]?.message?.content || 'Nessuna risposta.';
      messages.push({ role: 'assistant', content: reply });

      removeMsg(loadingId);
      addMsg('assistant', reply);
    } catch (err) {
      removeMsg(loadingId);
      addMsg('assistant', `⚠️ Errore: ${err.message}`);
    }
  }

  async function analyzeConditions() {
    if (!apiKey) { showToast('Inserisci prima la chiave API OpenAI'); return; }

    const resultEl = document.getElementById('aiAnalysisResult');
    if (resultEl) resultEl.textContent = '⏳ Analisi in corso...';

    const ctx = buildContextNote();
    const prompt = `Analizza le condizioni fotografiche attuali e fornisci:
1. Valutazione condizioni (da 1 a 5 stelle)
2. Opportunità fotografiche adesso
3. Momento migliore nelle prossime 12 ore
4. Consigli tecnici specifici

${ctx || 'Nessun contesto disponibile — chiedi all\'utente di selezionare una località.'}`;

    try {
      const res = await callAPI({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600,
        temperature: 0.6,
      });
      const reply = res.choices?.[0]?.message?.content || 'Nessuna analisi disponibile.';
      if (resultEl) resultEl.textContent = reply;
    } catch (err) {
      if (resultEl) resultEl.textContent = `⚠️ Errore: ${err.message}`;
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
    const state = window.AppModule?.state;
    if (!state?.location) return '';
    const lines = [`📍 Posizione: ${state.location.name} (${state.location.lat.toFixed(4)}, ${state.location.lon.toFixed(4)})`];
    if (state.weather) {
      lines.push(`🌤 Meteo: ${state.weather.current?.weather_code !== undefined ? 'codice WMO ' + state.weather.current.weather_code : 'N/D'}`);
      lines.push(`🌡 Temperatura: ${state.weather.current?.temperature_2m}°C`);
      lines.push(`☁ Nuvole: ${state.weather.current?.cloud_cover}%`);
      lines.push(`💨 Vento: ${state.weather.current?.wind_speed_10m} km/h`);
    }
    if (state.sunData) {
      const t = state.sunData.times;
      lines.push(`🌅 Alba: ${fmtTime(t?.sunrise)}  🌇 Tramonto: ${fmtTime(t?.sunset)}`);
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
    el.textContent = text;
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

  function setModel(m) {
    model = m;
    localStorage.setItem('photoscout_ai_model', m);
  }

  return { init, setModel, updateUI };
})();

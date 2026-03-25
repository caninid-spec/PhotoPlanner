/* js/sun.js — Sole, Luna, Ora Dorata/Blu */
/* Richiede SunCalc (caricato via CDN in HTML) */

const SunModule = (() => {

  function fmt(date, use12h = false) {
    if (!date || isNaN(date)) return '--:--';
    const h = date.getHours(), m = date.getMinutes();
    if (use12h) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hh = ((h % 12) || 12).toString().padStart(2, '0');
      return `${hh}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  function durMin(start, end) {
    if (!start || !end || isNaN(start) || isNaN(end)) return '--';
    return Math.round((end - start) / 60000) + ' min';
  }

  function update(lat, lon, use12h = false) {
    const now = new Date();
    const times = SunCalc.getTimes(now, lat, lon);
    const pos   = SunCalc.getPosition(now, lat, lon);
    const moonTimes = SunCalc.getMoonTimes(now, lat, lon);
    const moonPos   = SunCalc.getMoonPosition(now, lat, lon);
    const moonIllum = SunCalc.getMoonIllumination(now);

    // ---- GOLDEN HOUR ----
    // Morning golden hour: sunrise → goldenHourEnd
    const goldenMornStart = times.sunrise;
    const goldenMornEnd   = times.goldenHourEnd;
    // Morning blue hour: blueHourEnd → sunrise (astronomically: nauticalDusk/nauticalDawn)
    const blueMornStart   = times.nauticalDawn;
    const blueMornEnd     = times.dawn;
    // Evening golden hour: goldenHour → sunset
    const goldenEveStart  = times.goldenHour;
    const goldenEveEnd    = times.sunset;
    // Evening blue hour: sunset → dusk
    const blueEveStart    = times.sunset;
    const blueEveEnd      = times.dusk;

    setEl('goldenMornStart', fmt(goldenMornStart, use12h));
    setEl('goldenMornDur',   durMin(goldenMornStart, goldenMornEnd));
    setEl('blueMornStart',   fmt(blueMornStart, use12h));
    setEl('blueMornDur',     durMin(blueMornStart, blueMornEnd));
    setEl('goldenEveStart',  fmt(goldenEveStart, use12h));
    setEl('goldenEveDur',    durMin(goldenEveStart, goldenEveEnd));
    setEl('blueEveStart',    fmt(blueEveStart, use12h));
    setEl('blueEveDur',      durMin(blueEveStart, blueEveEnd));

    // ---- SOLE ----
    const noon = new Date((times.sunrise.getTime() + times.sunset.getTime()) / 2);
    const azDeg = (pos.azimuth * 180 / Math.PI + 180) % 360;
    const altDeg = pos.altitude * 180 / Math.PI;

    setEl('sunRise',     fmt(times.sunrise, use12h));
    setEl('sunSet',      fmt(times.sunset, use12h));
    setEl('sunNoon',     fmt(noon, use12h));
    setEl('sunAzimuth',  azDeg.toFixed(1) + '°');
    setEl('sunAltitude', altDeg.toFixed(1) + '°');

    drawSunArc(times.sunrise, times.sunset, now);

    // ---- LUNA ----
    const moonPhase = moonIllum.phase;
    const phaseName = getMoonPhaseName(moonPhase);
    const illumPct  = (moonIllum.fraction * 100).toFixed(0) + '% illuminata';
    const moonAzDeg = (moonPos.azimuth * 180 / Math.PI + 180) % 360;

    setEl('moonPhaseName', phaseName);
    setEl('moonIllum',     illumPct);
    setEl('moonRise',      moonTimes.rise ? fmt(moonTimes.rise, use12h) : 'N/D');
    setEl('moonSet',       moonTimes.set  ? fmt(moonTimes.set, use12h)  : 'N/D');
    setEl('moonAzimuth',   moonAzDeg.toFixed(1) + '°');

    drawMoon(moonPhase, moonIllum.fraction);

    return { times, pos, moonIllum, moonPhase };
  }

  function getMoonPhaseName(phase) {
    if (phase < 0.03 || phase > 0.97) return '🌑 Luna Nuova';
    if (phase < 0.22)  return '🌒 Crescente (falce)';
    if (phase < 0.28)  return '🌓 Quarto Crescente';
    if (phase < 0.47)  return '🌔 Gibbosa Crescente';
    if (phase < 0.53)  return '🌕 Luna Piena';
    if (phase < 0.72)  return '🌖 Gibbosa Calante';
    if (phase < 0.78)  return '🌗 Quarto Calante';
    return '🌘 Calante (falce)';
  }

  function drawSunArc(sunrise, sunset, now) {
    const canvas = document.getElementById('sunArcCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // CORREZIONE: Imposta la risoluzione del canvas in base alla sua dimensione reale
    // Questo evita che il disegno risulti sfuocato o tagliato
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.width * 0.5; 
    
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const isDark = !document.body.classList.contains('theme-light');
    const trackColor = isDark ? '#2a3347' : '#d0dae8';
    const arcColor   = '#e8a84c';
    const dotColor   = '#e8a84c';
    const textColor  = isDark ? '#7a8aa0' : '#5a6a80';

    const pad = 20;
    const cx = W / 2, cy = H - 14, rx = (W - pad * 2) / 2, ry = H - 30;

    // Arco track
    ctx.beginPath();
    ctx.arc(cx, cy, rx, Math.PI, 0);
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Progress
    const totalMs = sunset - sunrise;
    const nowMs   = now - sunrise;
    const pct     = Math.max(0, Math.min(1, nowMs / totalMs));
    const angle   = Math.PI - pct * Math.PI;

    ctx.beginPath();
    ctx.arc(cx, cy, rx, Math.PI, Math.PI - pct * Math.PI);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Sun dot
    const sx = cx + rx * Math.cos(angle);
    /* CORREZIONE: Math.abs() era ridondante dato che sin(angle) su questo intervallo (0, PI) è sempre positivo. */
    const sy = cy - ry * Math.sin(angle) * 0.38;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    // Labels
    ctx.font = `11px 'DM Sans', sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.fillText(fmtSimple(sunrise), pad, H - 2);
    ctx.textAlign = 'right';
    ctx.fillText(fmtSimple(sunset), W - pad, H - 2);
  }

  function drawMoon(phase, fraction) {
    const canvas = document.getElementById('moonCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 4;
    const isDark = !document.body.classList.contains('theme-light');
    const illumColor = isDark ? '#e8e0b0' : '#f4eed0';
    const darkColor  = isDark ? '#1a2030' : '#c4cad8';

    /* CORREZIONE: La logica originale per disegnare le fasi lunari era difettosa e non produceva una forma corretta.
       Questa nuova implementazione usa una combinazione di cerchi ed ellissi per rappresentare
       in modo più accurato e semplice l'illuminazione della luna. */
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = illumColor;
    ctx.beginPath();
    const angle = Math.PI/2;
    const x_rad = r * Math.cos(phase * Math.PI * 2);
    
    // Always draw one half of the moon
    ctx.arc(cx, cy, r, -angle, angle, phase > 0.5);
    
    // Use an ellipse to draw the other half (terminator)
    ctx.ellipse(cx, cy, Math.abs(x_rad), r, 0, angle, -angle, phase > 0.5);
    ctx.fill();
  }

  function fmtSimple(d) {
    if (!d || isNaN(d)) return '';
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  return { update, fmt };
})();

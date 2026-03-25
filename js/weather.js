/* js/weather.js — Meteo via Open-Meteo (API gratuita, no key) */

const WeatherModule = (() => {

  const WMO_CODES = {
    0:  { icon: '☀️', desc: 'Cielo sereno' },
    1:  { icon: '🌤', desc: 'Prevalentemente sereno' },
    2:  { icon: '⛅', desc: 'Parzialmente nuvoloso' },
    3:  { icon: '☁️', desc: 'Coperto' },
    45: { icon: '🌫', desc: 'Nebbia' },
    48: { icon: '🌫', desc: 'Nebbia con brina' },
    51: { icon: '🌦', desc: 'Pioggerella leggera' },
    53: { icon: '🌧', desc: 'Pioggerella moderata' },
    55: { icon: '🌧', desc: 'Pioggerella intensa' },
    61: { icon: '🌧', desc: 'Pioggia leggera' },
    63: { icon: '🌧', desc: 'Pioggia moderata' },
    65: { icon: '🌧', desc: 'Pioggia intensa' },
    71: { icon: '🌨', desc: 'Neve leggera' },
    73: { icon: '❄️', desc: 'Neve moderata' },
    75: { icon: '❄️', desc: 'Neve intensa' },
    77: { icon: '🌨', desc: 'Granelli di neve' },
    80: { icon: '🌦', desc: 'Rovescio leggero' },
    81: { icon: '🌦', desc: 'Rovescio moderato' },
    82: { icon: '🌩', desc: 'Rovescio violento' },
    85: { icon: '🌨', desc: 'Rovescio di neve' },
    95: { icon: '⛈', desc: 'Temporale' },
    96: { icon: '⛈', desc: 'Temporale con grandine' },
    99: { icon: '⛈', desc: 'Temporale con grandine forte' },
  };

  function getWMO(code) {
    return WMO_CODES[code] || { icon: '🌡', desc: 'Condizioni miste' };
  }

  function tempConvert(c, unit) {
    if (unit === 'F') return (c * 9/5 + 32).toFixed(0) + '°F';
    return c.toFixed(0) + '°C';
  }

  async function fetch_(lat, lon, tempUnit = 'C') {
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,visibility` +
      `&hourly=cloud_cover,temperature_2m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
      `&forecast_days=7&timezone=auto`;

    const res  = await window.fetch(url);
    const data = await res.json();
    return _render(data, tempUnit);
  }

  function _render(data, tempUnit) {
    const cur  = data.current;
    const wmo  = getWMO(cur.weather_code);

    setEl('weatherIcon', wmo.icon);
    setEl('weatherTemp', tempConvert(cur.temperature_2m, tempUnit));
    setEl('weatherDesc', wmo.desc);
    setEl('wCloud',  cur.cloud_cover + '%');
    setEl('wHumid',  cur.relative_humidity_2m + '%');
    setEl('wWind',   cur.wind_speed_10m.toFixed(0) + ' km/h');
    const vis = cur.visibility !== undefined ? (cur.visibility / 1000).toFixed(0) + ' km' : 'N/D';
    setEl('wVis', vis);

    // Forecast strip (7 giorni)
    const strip = document.getElementById('forecastStrip');
    if (strip) {
      strip.innerHTML = '';
      const days = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
      data.daily.time.forEach((d, i) => {
        const date = new Date(d + 'T12:00:00');
        const w    = getWMO(data.daily.weather_code[i]);
        const div  = document.createElement('div');
        div.className = 'forecast-item';
        div.innerHTML = `
          <span class="f-day">${days[date.getDay()]}</span>
          <span class="f-icon">${w.icon}</span>
          <span class="f-temp">${tempConvert(data.daily.temperature_2m_max[i], tempUnit)} / ${tempConvert(data.daily.temperature_2m_min[i], tempUnit)}</span>
        `;
        strip.appendChild(div);
      });
    }

    // Cloud cover chart
    drawCloudChart(data.hourly);

    return { current: cur, daily: data.daily, hourly: data.hourly };
  }

  function drawCloudChart(hourly) {
    const canvas = document.getElementById('cloudCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // CORREZIONE: Usa getBoundingClientRect() per ottenere la larghezza reale
    // ed evitare problemi di rendering quando l'elemento è nascosto.
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return; // Non disegnare se il canvas non è visibile
    
    canvas.width = rect.width;
    canvas.height = rect.height; // Manteniamo l'altezza fissa come da design originale
    
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const isDark = !document.body.classList.contains('theme-light');

    // Only next 24h
    const now = new Date();
    const nowH = now.getHours();
    // Find index near current hour
    let startIdx = 0;
    for (let i = 0; i < hourly.time.length; i++) {
      const t = new Date(hourly.time[i]);
      if (t >= now) { startIdx = i; break; }
    }
    const slice   = hourly.cloud_cover.slice(startIdx, startIdx + 24);
    const timeSlice = hourly.time.slice(startIdx, startIdx + 24);
    const n       = slice.length;
    if (!n) return;

    const barW = W / n;

    // Background grid
    ctx.strokeStyle = isDark ? '#2a3347' : '#d0dae8';
    ctx.lineWidth = 1;
    [25, 50, 75].forEach(y => {
      const yp = H - (y / 100) * H;
      ctx.beginPath();
      ctx.moveTo(0, yp); ctx.lineTo(W, yp);
      ctx.stroke();
    });

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, isDark ? 'rgba(76,127,232,0.5)' : 'rgba(76,127,232,0.35)');
    grad.addColorStop(1, isDark ? 'rgba(76,127,232,0.05)' : 'rgba(76,127,232,0.02)');

    ctx.beginPath();
    ctx.moveTo(0, H);
    slice.forEach((v, i) => {
      const x = i * barW + barW / 2;
      const y = H - (v / 100) * H;
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    slice.forEach((v, i) => {
      const x = i * barW + barW / 2;
      const y = H - (v / 100) * H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = isDark ? '#4c7fe8' : '#3a6ad4';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hour labels (every 6h)
    ctx.font = `10px 'DM Sans', sans-serif`;
    ctx.fillStyle = isDark ? '#7a8aa0' : '#5a6a80';
    ctx.textAlign = 'center';
    timeSlice.forEach((t, i) => {
      if (i % 6 === 0) {
        const d = new Date(t);
        const x = i * barW + barW / 2;
        ctx.fillText(`${d.getHours().toString().padStart(2,'0')}:00`, x, H - 2);
      }
    });
  }

  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  return { fetch: fetch_, drawCloudChart };
})();

const express = require('express');
const cors = require('cors');
const app = express();

const RAPID_KEY = process.env.RAPIDAPI_KEY || '';
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'FLIGHT CHECK API', key_set: !!RAPID_KEY });
});

app.get('/flight', async (req, res) => {
  const { iata } = req.query;
  if (!iata) return res.status(400).json({ error: 'iata required' });
  try {
    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(iata)}`;
    const r = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
        'x-rapidapi-key': RAPID_KEY,
      }
    });
    const raw = await r.json();
    const flights = Array.isArray(raw) ? raw : (raw && !raw.message ? [raw] : []);
    if (!flights.length) return res.json({ data: [] });
    res.json({ data: flights.map(normFlight) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/registration', async (req, res) => {
  const { reg } = req.query;
  if (!reg) return res.status(400).json({ error: 'reg required' });
  try {
    const url = `https://aerodatabox.p.rapidapi.com/flights/reg/${encodeURIComponent(reg)}`;
    const r = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
        'x-rapidapi-key': RAPID_KEY,
      }
    });
    const raw = await r.json();
    const flights = Array.isArray(raw) ? raw : (raw && !raw.message ? [raw] : []);
    if (!flights.length) return res.json({ data: [] });
    res.json({ data: flights.map(f => normFlight(f, reg)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/age', async (req, res) => {
  const { reg } = req.query;
  if (!reg) return res.status(400).json({ error: 'reg required' });
  try {
    const url = `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`;
    const r = await fetch(url);
    const d = await r.json();
    const photo = d.photos && d.photos[0];
    res.json({
      registration: reg,
      year: photo && photo.aircraft && photo.aircraft.year ? parseInt(photo.aircraft.year) : null,
      model: photo && photo.aircraft ? photo.aircraft.model || null : null,
      photo_url: photo && photo.thumbnail ? photo.thumbnail.src || null : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// OpenSky live traffic proxy
app.get('/live', async (req, res) => {
  try {
    const r = await fetch('https://opensky-network.org/api/states/all?lamin=-60&lomin=-180&lamax=72&lomax=180', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return res.status(502).json({ error: 'OpenSky unavailable' });
    const d = await r.json();
    const planes = (d.states || [])
      .filter(s => s[5] && s[6] && s[8] === false)
      .map(s => ({
        icao: s[0],
        callsign: (s[1] || '').trim(),
        lat: s[6],
        lon: s[5],
        alt: s[7] ? Math.round(s[7]) : null,
        speed: s[9] ? Math.round(s[9] * 3.6) : null,
        heading: s[10] || 0,
        on_ground: s[8],
      }));
    res.json({ count: planes.length, planes: planes.slice(0, 3000) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function normFlight(f, fallbackReg) {
  return {
    flight: { iata: f.number || '', icao: f.callSign || '' },
    airline: { name: f.airline ? f.airline.name || '' : '', iata: f.airline ? f.airline.iata || '' : '' },
    flight_status: normStatus(f.status),
    departure: {
      iata: f.departure && f.departure.airport ? f.departure.airport.iata || '' : '',
      airport: f.departure && f.departure.airport ? f.departure.airport.name || '' : '',
      scheduled: f.departure && f.departure.scheduledTime ? f.departure.scheduledTime.utc || f.departure.scheduledTime.local || null : null,
      actual: f.departure && f.departure.actualTime ? f.departure.actualTime.utc || null : null,
      terminal: f.departure ? f.departure.terminal || null : null,
      gate: f.departure ? f.departure.gate || null : null,
      delay: f.departure ? f.departure.delay || 0 : 0,
    },
    arrival: {
      iata: f.arrival && f.arrival.airport ? f.arrival.airport.iata || '' : '',
      airport: f.arrival && f.arrival.airport ? f.arrival.airport.name || '' : '',
      scheduled: f.arrival && f.arrival.scheduledTime ? f.arrival.scheduledTime.utc || f.arrival.scheduledTime.local || null : null,
      estimated: f.arrival && f.arrival.estimatedTime ? f.arrival.estimatedTime.utc || null : null,
      terminal: f.arrival ? f.arrival.terminal || null : null,
      gate: f.arrival ? f.arrival.gate || null : null,
    },
    aircraft: {
      registration: f.aircraft ? f.aircraft.reg || fallbackReg || null : fallbackReg || null,
      icao24: f.aircraft ? f.aircraft.modeS || null : null,
      model: f.aircraft ? f.aircraft.model || null : null,
    },
    live: f.geography ? {
      latitude: f.geography.latitude,
      longitude: f.geography.longitude,
      altitude: f.geography.altitude,
      speed_horizontal: f.speed ? f.speed.horizontal || null : null,
    } : null,
  };
}

function normStatus(s) {
  if (!s) return 'unknown';
  const sl = s.toLowerCase();
  if (sl.includes('en route') || sl.includes('airborne') || sl.includes('active')) return 'active';
  if (sl.includes('landed') || sl.includes('arrived')) return 'landed';
  if (sl.includes('scheduled') || sl.includes('expected')) return 'scheduled';
  if (sl.includes('cancel')) return 'cancelled';
  if (sl.includes('divert')) return 'diverted';
  return sl;
}

app.listen(PORT, () => console.log(`FLIGHT CHECK running on ${PORT}`));

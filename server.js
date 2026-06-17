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
    res.json({ data: flights.map(f => normFlight(f)) });
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
    const r = await fetch(url, {
      headers: { 'User-Agent': 'FlightCheck/1.0' }
    });
    const d = await r.json();
    const photo = d.photos && d.photos[0];
    res.json({
      registration: reg,
      year: photo && photo.aircraft && photo.aircraft.year ? parseInt(photo.aircraft.year) : null,
      model: photo && photo.aircraft ? (photo.aircraft.model || null) : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// OpenSky live - with optional basic auth for higher limits
app.get('/live', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const r = await fetch(
      'https://opensky-network.org/api/states/all?lamin=10&lomin=-130&lamax=70&lomax=145',
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!r.ok) return res.status(502).json({ error: 'OpenSky error ' + r.status, planes: [] });
    const d = await r.json();
    const planes = (d.states || [])
      .filter(s => s[5] != null && s[6] != null && s[8] === false)
      .map(s => ({
        icao: s[0] || '',
        callsign: (s[1] || '').trim(),
        lon: parseFloat(s[5]),
        lat: parseFloat(s[6]),
        alt: s[7] ? Math.round(s[7]) : 0,
        speed: s[9] ? Math.round(s[9] * 3.6) : 0,
        heading: s[10] ? Math.round(s[10]) : 0,
      }));
    res.json({ count: planes.length, planes: planes.slice(0, 3000) });
  } catch (e) {
    res.status(500).json({ error: e.message, planes: [] });
  }
});

function normFlight(f, fallbackReg) {
  const dep = f.departure || {};
  const arr = f.arrival || {};
  const ac = f.aircraft || {};
  const geo = f.geography || null;
  const spd = f.speed || null;
  return {
    flight: { iata: f.number || '', icao: f.callSign || '' },
    airline: { name: (f.airline && f.airline.name) || '', iata: (f.airline && f.airline.iata) || '' },
    flight_status: normStatus(f.status),
    departure: {
      iata: (dep.airport && dep.airport.iata) || '',
      airport: (dep.airport && dep.airport.name) || '',
      scheduled: (dep.scheduledTime && (dep.scheduledTime.utc || dep.scheduledTime.local)) || null,
      actual: (dep.actualTime && (dep.actualTime.utc || dep.actualTime.local)) || null,
      terminal: dep.terminal || null,
      gate: dep.gate || null,
      delay: dep.delay || 0,
    },
    arrival: {
      iata: (arr.airport && arr.airport.iata) || '',
      airport: (arr.airport && arr.airport.name) || '',
      scheduled: (arr.scheduledTime && (arr.scheduledTime.utc || arr.scheduledTime.local)) || null,
      estimated: (arr.estimatedTime && (arr.estimatedTime.utc || arr.estimatedTime.local)) || null,
      terminal: arr.terminal || null,
      gate: arr.gate || null,
    },
    aircraft: {
      registration: ac.reg || fallbackReg || null,
      icao24: ac.modeS || null,
      model: ac.model || null,
    },
    live: geo ? {
      latitude: geo.latitude,
      longitude: geo.longitude,
      altitude: geo.altitude ? Math.round(geo.altitude) : null,
      speed_horizontal: spd && spd.horizontal ? Math.round(spd.horizontal) : null,
    } : null,
  };
}

function normStatus(s) {
  if (!s) return 'scheduled';
  const sl = s.toLowerCase();
  if (sl.includes('en route') || sl.includes('airborne') || sl.includes('active')) return 'active';
  if (sl.includes('landed') || sl.includes('arrived')) return 'landed';
  if (sl.includes('cancel')) return 'cancelled';
  if (sl.includes('divert')) return 'diverted';
  if (sl.includes('scheduled') || sl.includes('expected') || sl.includes('unknown')) return 'scheduled';
  return 'scheduled';
}

app.listen(PORT, () => console.log(`FLIGHT CHECK on ${PORT}, key: ${RAPID_KEY ? 'OK' : 'MISSING'}`));

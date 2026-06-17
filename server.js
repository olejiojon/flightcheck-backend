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

// Search by flight number e.g. EK521
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
    // AeroDataBox returns array of flights
    const flights = Array.isArray(raw) ? raw : [raw];
    if (!flights.length || flights[0].error) {
      return res.json({ data: [] });
    }
    // Normalize to our format
    const data = flights.map(f => ({
      flight: { iata: f.number, icao: f.callSign },
      airline: { name: f.airline?.name || '', iata: f.airline?.iata || '' },
      flight_status: normalizeStatus(f.status),
      departure: {
        iata: f.departure?.airport?.iata || '',
        airport: f.departure?.airport?.name || '',
        scheduled: f.departure?.scheduledTime?.utc || f.departure?.scheduledTime?.local || null,
        actual: f.departure?.actualTime?.utc || null,
        terminal: f.departure?.terminal || null,
        gate: f.departure?.gate || null,
        delay: f.departure?.delay || 0,
      },
      arrival: {
        iata: f.arrival?.airport?.iata || '',
        airport: f.arrival?.airport?.name || '',
        scheduled: f.arrival?.scheduledTime?.utc || f.arrival?.scheduledTime?.local || null,
        estimated: f.arrival?.estimatedTime?.utc || null,
        terminal: f.arrival?.terminal || null,
        gate: f.arrival?.gate || null,
      },
      aircraft: {
        registration: f.aircraft?.reg || null,
        icao24: f.aircraft?.modeS || null,
        model: f.aircraft?.model || null,
      },
      live: f.geography ? {
        latitude: f.geography.latitude,
        longitude: f.geography.longitude,
        altitude: f.geography.altitude,
        speed_horizontal: f.speed?.horizontal || null,
      } : null,
    }));
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Search by registration e.g. A6-EEY
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
    const flights = Array.isArray(raw) ? raw : [raw];
    if (!flights.length || flights[0].error) return res.json({ data: [] });
    const data = flights.map(f => ({
      flight: { iata: f.number, icao: f.callSign },
      airline: { name: f.airline?.name || '', iata: f.airline?.iata || '' },
      flight_status: normalizeStatus(f.status),
      departure: {
        iata: f.departure?.airport?.iata || '',
        airport: f.departure?.airport?.name || '',
        scheduled: f.departure?.scheduledTime?.utc || null,
        actual: f.departure?.actualTime?.utc || null,
        terminal: f.departure?.terminal || null,
        gate: f.departure?.gate || null,
        delay: f.departure?.delay || 0,
      },
      arrival: {
        iata: f.arrival?.airport?.iata || '',
        airport: f.arrival?.airport?.name || '',
        scheduled: f.arrival?.scheduledTime?.utc || null,
        estimated: f.arrival?.estimatedTime?.utc || null,
        terminal: f.arrival?.terminal || null,
        gate: f.arrival?.gate || null,
      },
      aircraft: {
        registration: f.aircraft?.reg || reg,
        icao24: f.aircraft?.modeS || null,
        model: f.aircraft?.model || null,
      },
      live: f.geography ? {
        latitude: f.geography.latitude,
        longitude: f.geography.longitude,
        altitude: f.geography.altitude,
        speed_horizontal: f.speed?.horizontal || null,
      } : null,
    }));
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Aircraft age via Planespotters
app.get('/age', async (req, res) => {
  const { reg } = req.query;
  if (!reg) return res.status(400).json({ error: 'reg required' });
  try {
    const url = `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`;
    const r = await fetch(url);
    const d = await r.json();
    const photo = d.photos?.[0];
    res.json({
      registration: reg,
      year: photo?.aircraft?.year || null,
      model: photo?.aircraft?.model || null,
      photo_url: photo?.thumbnail?.src || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function normalizeStatus(s) {
  if (!s) return 'unknown';
  const sl = s.toLowerCase();
  if (sl.includes('en route') || sl.includes('airborne') || sl.includes('active')) return 'active';
  if (sl.includes('landed') || sl.includes('arrived')) return 'landed';
  if (sl.includes('scheduled') || sl.includes('expected')) return 'scheduled';
  if (sl.includes('cancel')) return 'cancelled';
  if (sl.includes('divert')) return 'diverted';
  return 'unknown';
}

app.listen(PORT, () => console.log(`FLIGHT CHECK running on ${PORT}, key: ${RAPID_KEY ? 'SET' : 'NOT SET'}`));

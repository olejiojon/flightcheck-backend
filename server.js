const express = require('express');
const cors = require('cors');
const app = express();

const API_KEY = process.env.AVIATIONSTACK_KEY || '';
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'FLIGHT CHECK API' });
});

// Search by flight number (e.g. EK521)
app.get('/flight', async (req, res) => {
  const { iata } = req.query;
  if (!iata) return res.status(400).json({ error: 'iata required' });
  try {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${iata}&limit=1`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Search by registration (e.g. A6-EEY)
app.get('/registration', async (req, res) => {
  const { reg } = req.query;
  if (!reg) return res.status(400).json({ error: 'reg required' });
  try {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${API_KEY}&aircraft_registration=${reg}&limit=1`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
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
    const data = await r.json();
    const photo = data.photos?.[0];
    res.json({
      registration: reg,
      year: photo?.aircraft?.year || null,
      photo_url: photo?.thumbnail?.src || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`FLIGHT CHECK backend running on port ${PORT}`));

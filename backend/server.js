import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import analyzeRoute from './routes/analyze.js';
import voiceRoute from './routes/voice.js';
import suggestRoute from './routes/suggest.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-sentinel-key']
}));
app.options('*', cors()); // Handle preflight requests
app.use(express.json());

// Middleware to validate x-sentinel-key
app.use((req, res, next) => {
  const sentinelKey = req.headers['x-sentinel-key'];
  if (!sentinelKey || sentinelKey !== process.env.SENTINEL_SECRET) {
    console.warn('[SENTINEL] Unauthorized request blocked.');
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
});

// Mount routes
app.use('/api/analyze', analyzeRoute);
app.use('/analyze', analyzeRoute);      // alias — supports both /analyze and /api/analyze
app.use('/api/voice', voiceRoute);
app.use('/voice', voiceRoute);          // alias
app.use('/api/suggest', suggestRoute);
app.use('/suggest', suggestRoute);      // alias

app.listen(PORT, () => {
  console.log(`[SENTINEL] Backend server running on port ${PORT}`);
});

import express from 'express';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { text, voiceId = 'EXAVITQu4vr4xnSDxMaL' } = req.body; // Default Voice ID

    if (!text) {
      return res.status(400).json({ error: 'Missing text for TTS' });
    }

    console.log(`[SENTINEL] Generating voice for: "${text.substring(0, 30)}..."`);

    const elevenLabsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error('[SENTINEL] ElevenLabs error:', errorText);
      return res.status(500).json({ error: 'Failed to generate voice' });
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked'
    });

    // Pipe the audio stream directly to the response
    const arrayBuffer = await elevenLabsResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);

  } catch (error) {
    console.error('[SENTINEL] Voice route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

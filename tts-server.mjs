import { Communicate } from '@travisvn/edge-tts';
import express from 'express';
import cors from 'cors';

const app  = express();
const PORT = 5174;
app.use(cors());
app.use(express.json());

app.get('/tts', async (req, res) => {
  const text  = req.query.text  || 'Halo!';
  const voice = req.query.voice || 'id-ID-GadisNeural';
  const rate  = req.query.rate  || '+0%';
  const pitch = req.query.pitch || '+0Hz';

  try {
    const communicate = new Communicate(text, { 
      voice,
      rate,
      pitch
    });

    const bufs = [];
    for await (const chunk of communicate.stream()) {
      if (chunk.type === 'audio' && chunk.data) {
        bufs.push(Buffer.from(chunk.data));
      }
    }

    const audio = Buffer.concat(bufs);
    if (audio.length === 0) {
      return res.status(500).send('No audio generated');
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(audio);
  } catch (e) {
    console.error('TTS Error:', e.message);
    res.status(500).send('TTS Error: ' + e.message);
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ Edge TTS Server berjalan di http://localhost:${PORT}`);
});

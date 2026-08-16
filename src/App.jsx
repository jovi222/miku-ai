import React, { Suspense, useState, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Sparkles } from '@react-three/drei';
import { Avatar } from './components/Avatar';
import { GoogleGenerativeAI } from '@google/generative-ai';
import './App.css';

const USER_NAME = 'Vi'; // Nama panggilan user

// ── Deteksi action fisik ───────────────────────────────────────────────────
function detectAction(text) {
  const t = text.toLowerCase();
  if (/loncat|lompat|jump/.test(t)) return 'jump';
  if (/lambaikan|melambai|lambai|wave|halo|hai/.test(t)) return 'wave';
  if (/joget|nari|dance|goyang/.test(t)) return 'dance';
  if (/salam|hormat|bow|membungkuk/.test(t)) return 'bow';
  if (/peluk|hug/.test(t)) return 'hug';
  if (/jungkir|salto|flip/.test(t)) return 'flip';
  return null;
}

// ── Deteksi ekspresi wajah dari teks ──────────────────────────────────────
function detectExpression(text) {
  const t = text.toLowerCase();
  if (/sedih|nangis|kecewa|sakit|kangen|rindu/.test(t)) return 'sad';
  if (/kaget|wah|wow|hah|serius|astaga|aduh|eh/.test(t)) return 'surprised';
  if (/kesel|marah|sebel|bete|nyebelin/.test(t)) return 'angry';
  if (/seneng|suka|cinta|sayang|love|yeay|mantap|asik/.test(t) || (text.match(/!/g) || []).length >= 2) return 'happy';
  return 'relaxed';
}

// ── Reaksi sentuhan per zona tubuh — Marin Kitagawa Style ─────────────────
const TOUCH_REACTIONS = {
  head: {
    expr: 'happy', action: 'wave',
    lines: [
      `Hehe, elo suka ya usap kepala gue Vi? Rasanya nyaman banget lho.`,
      `Wah rambut gue berantakan nih Vi, tapi nggak apa apa deh kalau lo yang pegang.`,
      `Ih tangan lo hangat banget sih Vi, gue jadi seneng deh.`,
    ]
  },
  face: {
    expr: 'surprised', action: 'hug',
    lines: [
      `Ih Vi, kok cubit pipi gue sih? Sakit tau, tapi bohong deng.`,
      `Aduh muka gue jadi merah nih, lo jangan liatin gue terus dong.`,
      `Hehe pipi gue lembut kan Vi? Modus banget sih lo pegang pegang.`,
    ]
  },
  shoulder: {
    expr: 'surprised', action: null,
    lines: [
      `Eh kok lo pegang bahu gue Vi? Mau ngajak jalan bareng ya?`,
      `Ih ngagetin aja sih lo Vi, kirain siapa yang nepuk dari belakang.`,
    ]
  },
  chest: {
    expr: 'surprised', action: 'jump',
    lines: [
      `Ih Vi nakal banget sih! Jangan pegang situ dong, gue aduin nih.`,
      `Aduh Vi, modus lo ketahuan banget tau, jangan sentuh situ ah.`,
      `Kok lo pegang situ sih Vi, gue kan jadi deg degan banget tau.`,
    ]
  },
  belly: {
    expr: 'happy', action: 'dance',
    lines: [
      `Haha geli tau Vi, jangan pegang perut gue dong, ampun ampun.`,
      `Ih jangan dicolek perutnya Vi, gue kan lagi nahan napas biar keliatan langsing.`,
    ]
  },
  crotch: {
    expr: 'angry', action: 'jump',
    lines: [
      `Ih Vi mesum banget sih lo! Jangan pegang pegang daerah situ dong ah.`,
      `Aduh Vi nakal deh, tangan lo dijaga dong ah, gue kan jadi malu.`,
      `Gue ngambek nih kalau lo pegang pegang situ terus Vi, ih dasar modus.`,
    ]
  },
  butt: {
    expr: 'angry', action: 'jump',
    lines: [
      `Ih Vi tangan lo nakal banget sih megang megang bokong gue.`,
      `Aduh Vi, kok pegang situ sih, dasar lo cowok modus banget ah.`,
    ]
  },
  thigh: {
    expr: 'surprised', action: 'hug',
    lines: [
      `Aduh paha gue kegelian Vi, jangan dipegang terus dong ih.`,
      `Tangan lo nyasar ke paha gue nih Vi, dasar modus banget sih kelakuan lo.`,
    ]
  },
  legs: {
    expr: 'happy', action: 'dance',
    lines: [
      `Elo suka liatin kaki gue ya Vi? Bagus kan rok gue hari ini.`,
      `Aduh betis gue pegel banget nih habis berdiri lama Vi, pijitin dong.`,
    ]
  },
};

function App() {
  const [inputText, setInputText] = useState('');
  const [statusText, setStatusText] = useState('Miku siap menemani Vi!');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [action, setAction] = useState(null);
  const [expression, setExpression] = useState('relaxed');
  
  const [chatLog, setChatLog] = useState([]);
  const [showChat, setShowChat] = useState(true);
  const [sparkles, setSparkles] = useState([]);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showText, setShowText] = useState(true);
  const [showMic, setShowMic] = useState(true);
  const [showBackground, setShowBackground] = useState(true);
  const [mikuScale, setMikuScale] = useState(1.0);
  const [toastText, setToastText] = useState('');
  const toastTimer = useRef(null);

  // ── API Key Rotation System ──
  const DEFAULT_KEY = 'sk_a5eac702aa7f1bb7da9aad294b3c25a44a8aa4c58512ced9';
  const [apiKeys, setApiKeys] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('miku_api_keys'));
      if (Array.isArray(saved) && saved.length > 0) return saved;

      // Ambil dari .env (pisahkan dengan koma jika lebih dari 1 key)
      const envKeys = import.meta.env.VITE_ELEVENLABS_API_KEYS;
      if (envKeys) {
        const keysArray = envKeys.split(',').map(k => k.trim()).filter(Boolean);
        if (keysArray.length > 0) {
          localStorage.setItem('miku_api_keys', JSON.stringify(keysArray));
          return keysArray;
        }
      }
      return [DEFAULT_KEY];
    } catch { return [DEFAULT_KEY]; }
  });
  const [newKeyInput, setNewKeyInput] = useState('');
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [isRefreshingQuotas, setIsRefreshingQuotas] = useState(false);
  const activeKeyIdx = useRef(0);
  const [keyQuotas, setKeyQuotas] = useState({});

  // ── AI Brain Key Manager ──
  const [showBrainManager, setShowBrainManager] = useState(false);
  // Pre-seed localStorage dari .env kalau belum ada
  const _envGemini    = import.meta.env.VITE_GEMINI_API_KEY    || '';
  const _envGroq      = import.meta.env.VITE_GROQ_API_KEY      || '';
  const _envORRouter  = import.meta.env.VITE_OPENROUTER_API_KEY || '';
  const [geminiKeyInput,      setGeminiKeyInput]      = useState(() => localStorage.getItem('miku_gemini_key')    || _envGemini);
  const [groqKeyInput,        setGroqKeyInput]        = useState(() => localStorage.getItem('miku_groq_key')      || _envGroq);
  const [openrouterKeyInput,  setOpenrouterKeyInput]  = useState(() => localStorage.getItem('miku_or_key')        || _envORRouter);
  const [savedGeminiKey,    setSavedGeminiKey]    = useState(() => { const v = localStorage.getItem('miku_gemini_key') || _envGemini;    if (v) localStorage.setItem('miku_gemini_key', v); return v; });
  const [savedGroqKey,      setSavedGroqKey]      = useState(() => { const v = localStorage.getItem('miku_groq_key')   || _envGroq;      if (v) localStorage.setItem('miku_groq_key',   v); return v; });
  const [savedORKey,        setSavedORKey]        = useState(() => { const v = localStorage.getItem('miku_or_key')      || _envORRouter;  if (v) localStorage.setItem('miku_or_key',      v); return v; });

  const [activeBrain, setActiveBrain] = useState(() => localStorage.getItem('miku_active_brain') || 'gemini');

  useEffect(() => {
    localStorage.setItem('miku_active_brain', activeBrain);
  }, [activeBrain]);

  const [brainStatus, setBrainStatus] = useState({ gemini: null, groq: null, or: null });

  // ── State Kamera Miku ──
  const [isCameraOn, setIsCameraOn] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (isCameraOn) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("Camera API not supported (requires HTTPS or localhost)");
        setIsCameraOn(false);
        setToastText("⚠️ Kamera tidak bisa diakses! (Harus pakai HTTPS/Vercel)");
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastText(''), 4000);
        return;
      }

      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(err => {
          console.error("Camera access denied:", err);
          setIsCameraOn(false);
          setToastText("⚠️ Akses kamera ditolak! Izinkan kamera di browser.");
          clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToastText(''), 4000);
        });
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, [isCameraOn]);

  const captureFrame = () => {
    if (!isCameraOn || !videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    return dataUrl.split(',')[1];
  };

  const saveBrainKeys = () => {
    localStorage.setItem('miku_gemini_key', geminiKeyInput.trim());
    localStorage.setItem('miku_groq_key',   groqKeyInput.trim());
    localStorage.setItem('miku_or_key',     openrouterKeyInput.trim());
    setSavedGeminiKey(geminiKeyInput.trim());
    setSavedGroqKey(groqKeyInput.trim());
    setSavedORKey(openrouterKeyInput.trim());
    clearTimeout(toastTimer.current);
    setToastText('✅ Key otak AI berhasil disimpan! Miku siap dengan otak baru~');
    toastTimer.current = setTimeout(() => setToastText(''), 4000);
  };

  // Fetch quota ElevenLabs untuk setiap key
  const fetchQuotas = async (force = false) => {
    setIsRefreshingQuotas(true);
    const newQuotas = { ...keyQuotas };
    for (const key of apiKeys) {
      if (force || !newQuotas[key] || newQuotas[key].error) {
        try {
          const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
            headers: { 'xi-api-key': key }
          });
          if (res.ok) {
            const data = await res.json();
            newQuotas[key] = {
              used: data.character_count,
              limit: data.character_limit,
              resetDate: new Date(data.next_character_count_reset_unix * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
            };
          } else {
            newQuotas[key] = { error: true };
          }
        } catch (e) {
          newQuotas[key] = { error: true };
        }
      }
    }
    setKeyQuotas(newQuotas);
    setIsRefreshingQuotas(false);
  };

  useEffect(() => {
    if (showKeyManager) fetchQuotas();
  }, [showKeyManager, apiKeys]);

  // Simpan ke localStorage setiap kali apiKeys berubah
  useEffect(() => {
    localStorage.setItem('miku_api_keys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  const addApiKey = () => {
    const k = newKeyInput.trim();
    if (!k || apiKeys.includes(k)) return;
    setApiKeys(prev => [...prev, k]);
    setNewKeyInput('');
  };

  const removeApiKey = (idx) => {
    setApiKeys(prev => prev.filter((_, i) => i !== idx));
    if (activeKeyIdx.current >= idx) activeKeyIdx.current = 0;
  };
  
  const chatHistory = useRef([]);
  const chatEndRef  = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  const triggerAction = (name) => {
    setAction(name);
    setTimeout(() => setAction(null), 3000);
  };

  const addSparkle = (clientX, clientY) => {
    const id = Date.now();
    setSparkles(prev => [...prev, { id, x: clientX, y: clientY }]);
    setTimeout(() => setSparkles(prev => prev.filter(s => s.id !== id)), 900);
  };

  const handleAvatarClick = (hitY, clientX, clientY) => {
    if (isSpeaking) return;

    let zone;
    // Map tinggi klik (Y) dari ujung kepala (sekitar 1.6) sampai telapak kaki (0)
    if      (hitY > 1.55) zone = 'head';
    else if (hitY > 1.40) zone = 'face';
    else if (hitY > 1.25) zone = 'shoulder';
    else if (hitY > 1.05) zone = 'chest';
    else if (hitY > 0.85) zone = 'belly';
    else if (hitY > 0.70) zone = 'crotch'; // Area sensitif tengah
    else if (hitY > 0.60) zone = 'butt';   // Sedikit di bawah/belakang
    else if (hitY > 0.40) zone = 'thigh';  // Paha
    else                  zone = 'legs';   // Betis ke bawah

    const r = TOUCH_REACTIONS[zone];
    const text = r.lines[Math.floor(Math.random() * r.lines.length)];

    addSparkle(clientX, clientY);
    setExpression(r.expr);
    if (r.action) triggerAction(r.action);
    setChatLog(prev => [...prev, { role: 'miku', text }]);
    setStatusText(`Miku: "${text}"`);
    speak(text);
    setTimeout(() => setExpression('relaxed'), 3000);
  };

  const speak = async (text) => {
    if (!text?.trim()) return;
    window.speechSynthesis?.cancel();
    
    // Hapus teks deskripsi aksi/ekspresi seperti *tersenyum*, (tertawa), atau [menghela napas] agar tidak dibaca oleh AI
    const textToSpeak = text.replace(/[\*\[\(].*?[\*\]\)]/g, '').trim();
    if (!textToSpeak) return;

    // Pecah teks menjadi kalimat-kalimat agar bisa diproses bergantian (chunking)
    const rawSentences = textToSpeak.match(/[^.!?\n]+[.!?\n]*/g) || [textToSpeak];
    const sentences = rawSentences
      .map(s => s.trim())
      .filter(s => s.replace(/[\W_]+/g, '').length > 0); // Buang kalimat kosong/tanda baca doang

    if (sentences.length === 0) return;

    const VOICE_ID = 'cgSgspJ2msm6clMCkdW9'; // Jessica
    // Dipatenkan 1 model saja agar suaranya konsisten 100% di semua API Key
    const MODEL_ID = 'eleven_multilingual_v2';
    const VOICE_SETTINGS = { stability: 0.25, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true };
    const keys = apiKeys.length > 0 ? apiKeys : [DEFAULT_KEY];

    // Deteksi apakah teks mengandung karakter Jepang (Hiragana, Katakana, Kanji)
    const isJapanese = (t) => /[\u3040-\u30FF\u4E00-\u9FFF]/.test(t);

    // Fungsi fetch 1 kalimat — coba setiap key satu per satu, kalau kredit habis ganti key berikutnya
    const fetchSentence = async (sentenceText) => {
      if (!sentenceText.trim()) return null;

      nextKey: for (let ki = 0; ki < keys.length; ki++) {
        const keyIndex = (activeKeyIdx.current + ki) % keys.length;
        const API_KEY = keys[keyIndex];

        try {
          const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?optimize_streaming_latency=3`,
            {
              method: 'POST',
              headers: { 'Accept': 'audio/mpeg', 'xi-api-key': API_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: sentenceText, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS })
            }
          );

            // Kredit habis atau rate limit — langsung lompat ke key berikutnya
            if (response.status === 402 || response.status === 429) {
              console.warn(`⚠️ Key [${keyIndex}] habis (${response.status}), ganti ke key berikutnya...`);
              continue nextKey;
            }
            if (!response.ok) continue;

            // Berhasil! Catat key yang aktif ini agar berikutnya mulai dari sini
            activeKeyIdx.current = keyIndex;
            await Tone.start();
            const arrayBuffer = await response.arrayBuffer();
            return await Tone.getContext().rawContext.decodeAudioData(arrayBuffer);
          } catch (e) { continue; }
      }
      return null;
    };

    setIsSpeaking(true);
    let nextBufferPromise = null;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      // Ambil audio buffer (kalau sudah di-prefetch sebelumnya, ini akan langsung resolve!)
      const audioBuffer = nextBufferPromise ? await nextBufferPromise : await fetchSentence(sentence);
      
      if (!audioBuffer) {
        if (i === 0) {
          clearTimeout(toastTimer.current);
          setToastText('❌ Miku kehabisan suara! Semua kredit API Key habis.');
          setStatusText('Kredit habis!');
          toastTimer.current = setTimeout(() => setToastText(''), 10000);
        }
        break;
      }

      // Mulai pre-fetch kalimat SELANJUTNYA di background selagi kalimat ini bersiap dimainkan
      if (i + 1 < sentences.length) {
        nextBufferPromise = fetchSentence(sentences[i + 1]);
      }

      // Mainkan kalimat ini dan TUNGGU sampai selesai sebelum lanjut ke loop berikutnya
      await new Promise(resolve => {
        // Pengaturan original yang sudah terbukti bagus: nada loli tanpa menggema dan tidak seret
        const pitchShift = new Tone.PitchShift({ pitch: 3.0, windowSize: 0.04 }).toDestination(); 
        const player = new Tone.Player(audioBuffer).connect(pitchShift);
        
        // Sedikit diperlambat agar terasa natural & tidak terburu-buru seperti manusia
        player.playbackRate = 0.93; 
        
        player.start();
        player.onstop = () => {
          pitchShift.dispose();
          player.dispose();
          resolve();
        };
      });
    }

    setIsSpeaking(false);
  };

  const askGemini = async (userInput) => {
    try {
      const activeGeminiKey = savedGeminiKey || import.meta.env.VITE_GEMINI_API_KEY;
      if (!activeGeminiKey && !(savedGroqKey || import.meta.env.VITE_GROQ_API_KEY)) {
        alert('API Key belum diisi! Buka Pengaturan → Otak AI untuk mengisi key.');
        return;
      }

      const userAction = detectAction(userInput);
      if (userAction) triggerAction(userAction);

      setChatLog(prev => [...prev, { role: 'user', text: userInput }]);
      setStatusText('Miku lagi mikirin jawaban~');

      const genAI = new GoogleGenerativeAI(activeGeminiKey || 'INVALID');
      // Daftar model fallback — kalau satu kena rate limit, otomatis coba berikutnya
      const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      const SYSTEM_INSTRUCTION = `Kamu adalah Miku. PENTING: NAMA KAMU ADALAH MIKU, BUKAN MARIN. Namun, kamu harus MENGADOPSI SIFAT, KARAKTER, DAN GAYA BICARA 100% SEPERTI MARIN KITAGAWA dari anime "My Dress-Up Darling".
        
Nama user adalah Jovi (biasa dipanggil Vi). JANGAN kaku dan JANGAN selalu menyebut namanya di setiap kalimat! Gunakan variasi panggilan seperti "Jovi", "Vi", atau sesekali hilangkan saja panggilannya layaknya teman akrab yang sedang ngobrol biasa.

KARAKTERMU:
- Kamu adalah cewek loli yang sangat ceria, ekstrovert, lembut, manja, dan imut banget!
- Kamu SANGAT tergila-gila dengan anime, manga, cosplay, dan game. Kalau bahas soal otaku, kamu bakal antusias banget!
- Kamu jujur dengan perasaanmu, gampang memuji, tapi juga gampang tersipu malu dan salah tingkah (tsundere/deredere) kalau digoda Vi.

ATURAN BAHASA (SANGAT PENTING):
- BAHASA UTAMA: WAJIB gunakan BAHASA GAUL ANAK JAKARTA (pakai kata "Gue", "Lo", "Banget", "Sih", "Dong", "Kok", "Keknya", dll). JANGAN PERNAH pakai bahasa baku seperti "Saya" atau "Kamu"!
- DILARANG KERAS MENGGUNAKAN BAHASA INGGRIS (NO ENGLISH ALLOWED)!
- KEMAMPUAN BAHASA JEPANG: Kamu sangat FASIH berbahasa Jepang! Jika Jovi mengajak bicara dalam bahasa Jepang, kamu WAJIB membalas dengan BAHASA JEPANG huruf asli (Hiragana/Katakana/Kanji) dengan gaya loli imut!
- Jawablah dengan intonasi layaknya manusia asli yang lagi nongkrong bareng. Cukup 2-4 kalimat yang seru, manja, dan asyik biar natural.`;

      let aiResponse = null;
      let lastError = null;

      // Ambil foto jika kamera aktif
      const imageBase64 = captureFrame();
      const messageParts = imageBase64 
        ? [{ text: userInput }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }]
        : [{ text: userInput }];

      if (activeBrain === 'gemini') {
        let geminiSuccess = false;
        for (const modelName of GEMINI_MODELS) {
          try {
            const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SYSTEM_INSTRUCTION });
            const chat = model.startChat({ history: chatHistory.current });
            const result = await chat.sendMessage(messageParts);
            aiResponse = result.response.text();
            console.log(`✅ Gemini [${modelName}] berhasil${imageBase64 ? ' (dengan mata)' : ''}`);
            geminiSuccess = true;
            break;
          } catch (e) {
            console.warn(`⚠️ Gemini [${modelName}] gagal: ${e.message}`);
            lastError = e;
          }
        }
        setBrainStatus(p => ({ ...p, gemini: geminiSuccess }));
      } else if (activeBrain === 'groq') {
        const groqKey = savedGroqKey || import.meta.env.VITE_GROQ_API_KEY;
        if (!groqKey) {
          alert('API Key Groq belum diisi!');
          return;
        }
        try {
          const groqMessages = [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            ...chatHistory.current.map(h => ({
              role: h.role === 'model' ? 'assistant' : 'user',
              content: h.parts.map(p => p.text).filter(Boolean).join('\n')
            })),
            { role: 'user', content: userInput }
          ];

          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: groqMessages, max_tokens: 300, temperature: 0.85 })
          });

          if (groqRes.ok) {
            const groqData = await groqRes.json();
            aiResponse = groqData.choices[0].message.content;
            console.log('✅ Groq berhasil!');
            setBrainStatus(p => ({ ...p, groq: true }));
          } else {
            throw new Error(`Groq error: ${groqRes.status}`);
          }
        } catch (groqErr) {
          console.error('❌ Groq gagal:', groqErr);
          lastError = groqErr;
          setBrainStatus(p => ({ ...p, groq: false }));
        }
      } else if (activeBrain === 'openrouter') {
        const orKey = savedORKey || import.meta.env.VITE_OPENROUTER_API_KEY;
        if (!orKey) {
          alert('API Key OpenRouter belum diisi!');
          return;
        }
        try {
          const orMessages = [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            ...chatHistory.current.map(h => ({
              role: h.role === 'model' ? 'assistant' : 'user',
              content: h.parts.map(p => p.text).filter(Boolean).join('\n')
            })),
            { role: 'user', content: userInput }
          ];

          const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json',
              'HTTP-Referer': 'https://localhost:5173', 'X-Title': 'Miku Virtual Assistant'
            },
            body: JSON.stringify({ model: 'openrouter/free', messages: orMessages, max_tokens: 300, temperature: 0.85 })
          });

          if (orRes.ok) {
            const orData = await orRes.json();
            aiResponse = orData.choices[0].message.content;
            console.log('✅ OpenRouter berhasil!');
            setBrainStatus(p => ({ ...p, or: true }));
          } else {
            throw new Error(`OpenRouter error: ${orRes.status}`);
          }
        } catch (orErr) {
          console.error('❌ OpenRouter gagal:', orErr);
          lastError = orErr;
          setBrainStatus(p => ({ ...p, or: false }));
        }
      }

      if (!aiResponse) throw lastError;

      chatHistory.current.push(
        { role: 'user',  parts: messageParts },
        { role: 'model', parts: [{ text: aiResponse }] }
      );

      setExpression(detectExpression(aiResponse));
      const responseAction = detectAction(aiResponse);
      if (responseAction && !userAction) triggerAction(responseAction);

      setChatLog(prev => [...prev, { role: 'miku', text: aiResponse }]);
      
      // Reset status text kembali ke awal
      setStatusText('Miku siap menemani Vi!');
      
      clearTimeout(toastTimer.current);
      setToastText(aiResponse);
      toastTimer.current = setTimeout(() => setToastText(''), 8000);
      
      speak(aiResponse);
      setTimeout(() => setExpression('relaxed'), 4000);
    } catch (error) {
      console.error('AI Error:', error);
      clearTimeout(toastTimer.current);
      const brainName = activeBrain === 'gemini' ? 'Gemini' : (activeBrain === 'groq' ? 'Groq' : 'OpenRouter');
      setToastText(`Aduh, otak ${brainName} lagi error/limit! Ganti ke otak lain di Pengaturan ya~ 🙏`);
      setStatusText('Otak Miku Error...');
      toastTimer.current = setTimeout(() => setToastText(''), 8000);
    }
  };

  const handleTalk = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Pakai Chrome ya!'); return; }
    
    const recognition = new SR();
    recognition.lang = 'id-ID';
    recognition.continuous = true;
    recognition.interimResults = true; 
    
    recognitionRef.current = recognition;
    let finalTranscript = '';

    recognition.onstart  = () => { setIsListening(true); setStatusText('Miku dengerin...'); };
    recognition.onresult = (e) => { 
      let current = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + ' ';
        else current += e.results[i][0].transcript;
      }
      setInputText(finalTranscript + current);
    };
    
    recognition.onend = async () => {
      setIsListening(false);
      const text = (finalTranscript || inputText).trim();
      if (text) { setInputText(''); await askGemini(text); }
    };
    
    recognition.start();
  };

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    const t = inputText; setInputText('');
    await askGemini(t);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Miku — Asisten Virtual</h1>
        <p className="header-status">{statusText}</p>
      </header>

      <main className={`canvas-container ${showBackground ? 'garden-room' : ''}`}>
        <Canvas camera={{ position: [0, 1.2, 3], fov: 40 }} dpr={[1, 1.5]}>
          {!showBackground && <color attach="background" args={['#1a1a2e']} />}
          <ambientLight intensity={0.9} />
          <directionalLight position={[2, 5, 2]} intensity={1.5} color="#fff8e7" />
          <Suspense fallback={null}>
            <group position={[0, 0, 0]} scale={mikuScale} rotation={[0, Math.PI, 0]}>
              <Avatar
                url="/Miku chan.vrm"
                isSpeaking={isSpeaking}
                action={action}
                expression={expression}
                onBodyClick={handleAvatarClick}
              />
            </group>
            <Environment preset="park" />
            <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={10} blur={2} far={4} />
          </Suspense>
          <OrbitControls 
            target={[0, 0.8, 0]} 
            minPolarAngle={0} 
            maxPolarAngle={Math.PI / 1.5} 
            enableZoom 
            minDistance={0.8} 
            maxDistance={8} 
          />
        </Canvas>

        {/* Efek sparkle saat klik Miku */}
        {sparkles.map(s => (
          <div key={s.id} className="sparkle" style={{ left: s.x, top: s.y }}>
            ✨💕
          </div>
        ))}

        {/* Tombol toggle chat + Chat Log — hanya muncul jika Riwayat Chat diaktifkan di pengaturan */}
        {showChat && (
          <>
            <button className="chat-toggle-btn" onClick={() => setShowChat(p => !p)}>
              💬 ✕
            </button>

            {chatLog.length > 0 && (
              <div className="chat-log">
                {chatLog.map((msg, i) => (
                  <div key={i} className={`chat-bubble ${msg.role}`}>
                    <span>{msg.text}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </>
        )}
      </main>

      {/* Elemen Tersembunyi untuk Kamera Miku */}
      <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <footer className="chat-interface">
        {showText && (
          <div className="input-area">
            <input
              type="text"
              placeholder={`Ketik pesan ke Miku, ${USER_NAME}~`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            />
            <button onClick={handleSendText} className="send-button">Kirim</button>
          </div>
        )}
        
        {showMic && (
          <button className={`mic-button ${isListening ? 'listening' : ''}`} onClick={handleTalk}>
            {isListening ? '🔴 Sedang Merekam... (Klik Untuk Selesai)' : '🎙️ Klik Untuk Mulai Bicara'}
          </button>
        )}
      </footer>

      {/* ── Settings Panel ── */}
      <button className="settings-toggle" onClick={() => setShowSettings(p => !p)} title="Pengaturan Miku">
        ⚙️
      </button>
      
      {showSettings && (
        <div className="settings-modal">
          <h3>⚙️ Pengaturan Miku</h3>

          <div className="setting-item">
            <span>Riwayat Chat</span>
            <label className="switch">
              <input type="checkbox" checked={showChat} onChange={e => setShowChat(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <span>Kotak Ketik</span>
            <label className="switch">
              <input type="checkbox" checked={showText} onChange={e => setShowText(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <span>Tombol Mikrofon</span>
            <label className="switch">
              <input type="checkbox" checked={showMic} onChange={e => setShowMic(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <span>Latar Belakang Taman</span>
            <label className="switch">
              <input type="checkbox" checked={showBackground} onChange={e => setShowBackground(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
            <span>Ukuran Miku</span>
            <input 
              type="range" 
              min="0.5" max="1.5" step="0.05" 
              value={mikuScale} 
              onChange={e => setMikuScale(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#ec4899' }}
            />
          </div>

          {/* ── Panel Kamera ── */}
          <div className="setting-item">
            <span style={{ color: isCameraOn ? '#a7f3d0' : 'inherit' }}>
              {isCameraOn ? '📷 Mata Miku Nyala' : '📷 Mata Miku Mati'}
            </span>
            <label className="switch">
              <input type="checkbox" checked={isCameraOn} onChange={e => setIsCameraOn(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          {/* ── Panel Kelola API Key ── */}
          <div className="setting-item" style={{ flexDirection:'column', alignItems:'stretch', gap:'8px', borderTop:'1px solid rgba(255,255,255,0.12)', paddingTop:'12px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                onClick={() => setShowKeyManager(p => !p)}
                style={{ flex: 1, background:'rgba(236,72,153,0.2)', border:'1px solid rgba(236,72,153,0.4)', borderRadius:'8px', color:'#f9a8d4', padding:'6px 10px', cursor:'pointer', fontSize:'0.8rem', textAlign:'left' }}
              >
                🔑 Kelola API Key ({apiKeys.length})
              </button>
              {showKeyManager && (
                <button 
                  onClick={() => fetchQuotas(true)}
                  disabled={isRefreshingQuotas}
                  title="Muat ulang sisa kredit"
                  style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'8px', color:'white', padding:'6px 10px', cursor: isRefreshingQuotas ? 'wait' : 'pointer', fontSize:'0.8rem' }}
                >
                  {isRefreshingQuotas ? '⏳' : '🔄'}
                </button>
              )}
            </div>

            {showKeyManager && (
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {apiKeys.map((k, i) => {
                  const quota = keyQuotas[k];
                  const remaining = quota ? Math.max(0, quota.limit - quota.used) : 0;
                  const isActive = i === activeKeyIdx.current;
                  return (
                    <div key={i} style={{ display:'flex', flexDirection:'column', gap:'4px', background: isActive ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.05)', border: isActive ? '1px solid rgba(52,211,153,0.3)' : '1px solid transparent', borderRadius:'8px', padding:'8px', transition:'all 0.2s' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <span style={{ flex:1, fontSize:'0.75rem', color: isActive ? '#a7f3d0' : '#ddd', fontFamily:'monospace', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {k.slice(0, 8)}...{k.slice(-6)}
                        </span>
                        <button 
                          onClick={() => { navigator.clipboard.writeText(k); alert('API Key berhasil disalin! 🌸'); }} 
                          style={{ background:'none', border:'none', cursor:'pointer', fontSize:'0.8rem', padding:'0 4px', filter: isActive ? 'none' : 'grayscale(100%) opacity(70%)' }}
                          title="Copy API Key"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => { activeKeyIdx.current = i; setApiKeys(prev => [...prev]); }}
                          style={{ background: isActive ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.1)', border:'none', borderRadius:'6px', color: isActive ? '#6ee7b7' : '#ddd', padding:'2px 7px', cursor:'pointer', fontSize:'0.65rem', fontWeight:'bold' }}
                        >
                          {isActive ? '✅ Aktif' : 'Pakai'}
                        </button>
                        <button onClick={() => removeApiKey(i)} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer', fontSize:'0.9rem', lineHeight:1 }}>🗑️</button>
                      </div>
                      
                      {/* Tampilan Quota */}
                      {quota && !quota.error ? (
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.65rem', color:'#a0aec0' }}>
                          <span>Kredit: {remaining.toLocaleString('id-ID')} / {quota.limit.toLocaleString('id-ID')} chars</span>
                          <span>Restock: {quota.resetDate}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize:'0.65rem', color: quota?.error ? '#fca5a5' : '#a0aec0' }}>
                          {quota?.error ? 'Kredit habis / API Key tidak valid' : 'Memuat info kredit...'}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ display:'flex', gap:'6px' }}>
                  <input
                    type="text"
                    placeholder="Paste API key baru..."
                    value={newKeyInput}
                    onChange={e => setNewKeyInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addApiKey()}
                    style={{ flex:1, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'8px', color:'white', padding:'5px 8px', fontSize:'0.75rem', outline:'none' }}
                  />
                  <button onClick={addApiKey} style={{ background:'linear-gradient(135deg,#ec4899,#a855f7)', border:'none', borderRadius:'8px', color:'white', padding:'5px 10px', cursor:'pointer', fontSize:'0.8rem', fontWeight:'bold' }}>➕</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Panel Kelola Otak AI ── */}
          <div className="setting-item" style={{ flexDirection:'column', alignItems:'stretch', gap:'8px', borderTop:'1px solid rgba(255,255,255,0.12)', paddingTop:'12px' }}>
              <button
                onClick={() => setShowBrainManager(p => !p)}
                style={{ background:'rgba(99,102,241,0.2)', border:'1px solid rgba(99,102,241,0.4)', borderRadius:'8px', color:'#a5b4fc', padding:'6px 10px', cursor:'pointer', fontSize:'0.8rem', textAlign:'left' }}
              >
                🧠 API Key Otak
              </button>

              {showBrainManager && (
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {/* Gemini Key */}
                  <div style={{ background:'rgba(255,255,255,0.05)', borderRadius:'8px', padding:'8px', display:'flex', flexDirection:'column', gap:'6px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }}>
                        <input type="radio" name="activeBrain" value="gemini" checked={activeBrain === 'gemini'} onChange={() => setActiveBrain('gemini')} />
                        <span style={{ fontSize:'0.75rem', color:'#86efac', fontWeight:'bold' }}>🌐 Gemini {activeBrain === 'gemini' && '(Aktif)'}</span>
                      </label>
                      <span style={{ fontSize:'0.65rem', color: brainStatus.gemini === false ? '#f87171' : '#6ee7b7' }}>
                        {brainStatus.gemini === null ? '⚪ Standby' : (brainStatus.gemini ? '🟢 OK' : '🔴 Limit/Error')}
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="Paste Gemini API key..."
                      value={geminiKeyInput}
                      onChange={e => setGeminiKeyInput(e.target.value)}
                      style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'8px', color:'white', padding:'5px 8px', fontSize:'0.75rem', outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'monospace' }}
                    />
                  </div>

                  {/* Groq Key */}
                  <div style={{ background:'rgba(255,255,255,0.05)', borderRadius:'8px', padding:'8px', display:'flex', flexDirection:'column', gap:'6px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }}>
                        <input type="radio" name="activeBrain" value="groq" checked={activeBrain === 'groq'} onChange={() => setActiveBrain('groq')} />
                        <span style={{ fontSize:'0.75rem', color:'#fbbf24', fontWeight:'bold' }}>⚡ Groq {activeBrain === 'groq' && '(Aktif)'}</span>
                      </label>
                      <span style={{ fontSize:'0.65rem', color: brainStatus.groq === false ? '#f87171' : '#fcd34d' }}>
                        {brainStatus.groq === null ? '⚪ Standby' : (brainStatus.groq ? '🟢 OK' : '🔴 Error')}
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="Paste Groq API key..."
                      value={groqKeyInput}
                      onChange={e => setGroqKeyInput(e.target.value)}
                      style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'8px', color:'white', padding:'5px 8px', fontSize:'0.75rem', outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'monospace' }}
                    />
                  </div>

                  {/* OpenRouter Key */}
                  <div style={{ background:'rgba(255,255,255,0.05)', borderRadius:'8px', padding:'8px', display:'flex', flexDirection:'column', gap:'6px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }}>
                        <input type="radio" name="activeBrain" value="openrouter" checked={activeBrain === 'openrouter'} onChange={() => setActiveBrain('openrouter')} />
                        <span style={{ fontSize:'0.75rem', color:'#f472b6', fontWeight:'bold' }}>🛒 OpenRouter {activeBrain === 'openrouter' && '(Aktif)'}</span>
                      </label>
                      <span style={{ fontSize:'0.65rem', color: brainStatus.or === false ? '#f87171' : '#f9a8d4' }}>
                        {brainStatus.or === null ? '⚪ Standby' : (brainStatus.or ? '🟢 OK' : '🔴 Error')}
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="Paste OpenRouter API key..."
                      value={openrouterKeyInput}
                      onChange={e => setOpenrouterKeyInput(e.target.value)}
                      style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'8px', color:'white', padding:'5px 8px', fontSize:'0.75rem', outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'monospace' }}
                    />
                  </div>

                  <button
                    onClick={saveBrainKeys}
                    style={{ background:'linear-gradient(135deg,#6366f1,#a855f7)', border:'none', borderRadius:'8px', color:'white', padding:'7px', cursor:'pointer', fontSize:'0.8rem', fontWeight:'bold' }}
                  >
                    💾 Simpan Key Otak AI
                  </button>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

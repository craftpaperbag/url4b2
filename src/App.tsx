import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';

const STEPS = 16;
const STEP_INTERVALS_PER_BEAT = 4; // 16th notes

const instruments = [
  { id: 'kick', label: 'キック', accent: '#f97316' },
  { id: 'snare', label: 'スネア', accent: '#6366f1' },
  { id: 'hihat', label: 'ハイハット', accent: '#22c55e' },
] as const;

type InstrumentId = (typeof instruments)[number]['id'];
type Pattern = Record<InstrumentId, boolean[]>;

const createEmptyPattern = (): Pattern => {
  const base: Record<string, boolean[]> = {};
  instruments.forEach(({ id }) => {
    base[id] = Array(STEPS).fill(false);
  });
  return base as Pattern;
};

const encodePattern = (pattern: Pattern): string => {
  const bits: number[] = [];
  for (let step = 0; step < STEPS; step += 1) {
    instruments.forEach((inst) => {
      bits.push(pattern[inst.id][step] ? 1 : 0);
    });
  }
  const byteLength = Math.ceil(bits.length / 8);
  const bytes = new Uint8Array(byteLength);
  bits.forEach((bit, idx) => {
    const byteIndex = Math.floor(idx / 8);
    bytes[byteIndex] |= bit << (7 - (idx % 8));
  });
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const decodePattern = (encoded: string | null): Pattern => {
  if (!encoded) return createEmptyPattern();
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '==='.slice((normalized.length + 3) % 4);
    const binary = atob(padded);
    const bits: number[] = [];
    for (let i = 0; i < binary.length; i += 1) {
      const byte = binary.charCodeAt(i);
      for (let bit = 7; bit >= 0; bit -= 1) {
        bits.push((byte >> bit) & 1);
      }
    }
    const pattern = createEmptyPattern();
    for (let step = 0; step < STEPS; step += 1) {
      instruments.forEach((inst, instIdx) => {
        const idx = step * instruments.length + instIdx;
        pattern[inst.id][step] = Boolean(bits[idx]);
      });
    }
    return pattern;
  } catch (err) {
    console.warn('パターンの読み込みに失敗しました', err);
    return createEmptyPattern();
  }
};

const useAudioContext = () => {
  const [ctx, setCtx] = useState<AudioContext | null>(null);

  const ensureContext = () => {
    if (!ctx) {
      const audioContext = new AudioContext();
      setCtx(audioContext);
      return audioContext;
    }
    return ctx;
  };

  return { ctx, ensureContext };
};

const createNoiseBuffer = (context: AudioContext) => {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < buffer.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

const playKick = (context: AudioContext, time: number) => {
  const osc = context.createOscillator();
  const gain = context.createGain();
  const clickOsc = context.createOscillator();
  const clickGain = context.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
  gain.gain.setValueAtTime(1.1, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
  osc.connect(gain).connect(context.destination);

  clickOsc.type = 'square';
  clickOsc.frequency.setValueAtTime(1000, time);
  clickGain.gain.setValueAtTime(0.35, time);
  clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  clickOsc.connect(clickGain).connect(context.destination);

  osc.start(time);
  osc.stop(time + 0.5);
  clickOsc.start(time);
  clickOsc.stop(time + 0.08);
};

const playSnare = (context: AudioContext, time: number, noiseBuffer: AudioBuffer) => {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(1800, time);

  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(1, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

  noise.connect(noiseFilter).connect(noiseGain).connect(context.destination);
  noise.start(time);
  noise.stop(time + 0.25);

  const osc = context.createOscillator();
  const oscGain = context.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(200, time);
  oscGain.gain.setValueAtTime(0.7, time);
  oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
  osc.connect(oscGain).connect(context.destination);
  osc.start(time);
  osc.stop(time + 0.2);
};

const playHiHat = (context: AudioContext, time: number, noiseBuffer: AudioBuffer) => {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.setValueAtTime(5000, time);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);
  noise.connect(highpass).connect(gain).connect(context.destination);
  noise.start(time);
  noise.stop(time + 0.1);
};

const App: React.FC = () => {
  const [pattern, setPattern] = useState<Pattern>(() => decodePattern(new URL(window.location.href).searchParams.get('p')));
  const [bpm, setBpm] = useState(110);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [shareLink, setShareLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  const { ctx, ensureContext } = useAudioContext();
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  const shareTimeoutRef = useRef<number | null>(null);

  const patternRef = useRef(pattern);
  const bpmRef = useRef(bpm);

  useEffect(() => {
    patternRef.current = pattern;
    if (shareTimeoutRef.current) {
      window.clearTimeout(shareTimeoutRef.current);
    }

    setIsGeneratingLink(true);
    shareTimeoutRef.current = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const encoded = encodePattern(pattern);
      url.searchParams.set('p', encoded);
      window.history.replaceState(null, '', url.toString());
      setShareLink(url.toString());
      setIsGeneratingLink(false);
      shareTimeoutRef.current = null;
    }, 200);

    return () => {
      if (shareTimeoutRef.current) {
        window.clearTimeout(shareTimeoutRef.current);
        shareTimeoutRef.current = null;
      }
    };
  }, [pattern]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    if (!ctx) return;
    if (!noiseBufferRef.current) {
      noiseBufferRef.current = createNoiseBuffer(ctx);
    }
  }, [ctx]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const intervalMs = 60000 / (bpmRef.current * STEP_INTERVALS_PER_BEAT);
    const id = setInterval(() => {
      setCurrentStep((prev) => {
        const nextStep = (prev + 1) % STEPS;
        const now = ensureContext().currentTime;
        const buffer = noiseBufferRef.current;
        instruments.forEach((inst, instIdx) => {
          if (patternRef.current[inst.id][nextStep] && ctx) {
            const time = now + 0.02;
            if (inst.id === 'kick') playKick(ctx, time);
            if (inst.id === 'snare' && buffer) playSnare(ctx, time, buffer);
            if (inst.id === 'hihat' && buffer) playHiHat(ctx, time, buffer);
          }
        });
        return nextStep;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [isPlaying, ensureContext]);

  const toggleStep = (instrumentId: InstrumentId, step: number) => {
    setPattern((prev) => ({
      ...prev,
      [instrumentId]: prev[instrumentId].map((val, idx) => (idx === step ? !val : val)),
    }));
  };

  const handlePlayToggle = async () => {
    const audioContext = ensureContext();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    setIsPlaying((prev) => !prev);
  };

  const handleCopy = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      alert('リンクをコピーしました');
    } catch (err) {
      console.error(err);
      alert('コピーに失敗しました');
    }
  };

  const handleGenerateQr = async () => {
    if (!shareLink) return;
    const dataUrl = await QRCode.toDataURL(shareLink, { margin: 1, scale: 6 });
    setQrCodeData(dataUrl);
  };

  const presetButtons = useMemo(
    () => [
      {
        label: '定番の4つ打ち',
        pattern: (() => {
          const base = createEmptyPattern();
          for (let i = 0; i < STEPS; i += 4) {
            base.kick[i] = true;
          }
          for (let i = 2; i < STEPS; i += 4) {
            base.snare[i] = true;
          }
          for (let i = 0; i < STEPS; i += 2) {
            base.hihat[i] = true;
          }
          return base;
        })(),
      },
      {
        label: 'ハーフタイム',
        pattern: (() => {
          const base = createEmptyPattern();
          [0, 8].forEach((i) => (base.kick[i] = true));
          [4, 12].forEach((i) => (base.snare[i] = true));
          for (let i = 1; i < STEPS; i += 2) {
            base.hihat[i] = true;
          }
          return base;
        })(),
      },
    ],
    [],
  );

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">モバイル特化・URLだけで共有</p>
          <h1>ポケットドラムマシン</h1>
          <p className="sub">ステップをタップしてビートを作成。ワンタップで再生・共有。</p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={handlePlayToggle}>
            {isPlaying ? '一時停止' : '再生'}
          </button>
          <button className="ghost" onClick={() => setPattern(createEmptyPattern())}>クリア</button>
        </div>
      </header>

      <section className="controls">
        <div className="control">
          <label htmlFor="bpm">テンポ</label>
          <div className="bpm-control">
            <input
              id="bpm"
              type="range"
              min={60}
              max={160}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
            />
            <span>{bpm} BPM</span>
          </div>
        </div>
        <div className="control presets">
          {presetButtons.map((preset) => (
            <button key={preset.label} className="secondary" onClick={() => setPattern(preset.pattern)}>
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid">
        {instruments.map((inst) => (
          <div key={inst.id} className="row">
            <div className="label" style={{ color: inst.accent }}>
              {inst.label}
            </div>
            <div className="steps">
              {pattern[inst.id].map((active, idx) => (
                <button
                  key={idx}
                  className={`step ${active ? 'active' : ''} ${currentStep === idx && isPlaying ? 'playing' : ''}`}
                  onClick={() => toggleStep(inst.id, idx)}
                  aria-label={`${inst.label} step ${idx + 1}`}
                >
                  <span className="dot" style={{ background: inst.accent }} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="share">
        <div>
          <p className="eyebrow">URLパラメーターで共有</p>
          <h2>リンクを作成してシェア</h2>
          <p className="sub">ファイル不要。短い文字列に圧縮したパターンをURLに埋め込みます。</p>
        </div>
        <div className="share-actions">
          <button className="primary" onClick={handleCopy} disabled={!shareLink}>
            共有リンクをコピー
          </button>
          <button className="secondary" onClick={handleGenerateQr} disabled={!shareLink}>
            QRコードを表示
          </button>
        </div>
        {(shareLink || isGeneratingLink) && (
          <div className="share-link">
            <code>{shareLink || 'リンクを生成しています…'}</code>
            {isGeneratingLink && <span className="loader" aria-label="リンク生成中" />}
          </div>
        )}
        {qrCodeData && (
          <div className="qr">
            <img src={qrCodeData} alt="共有用QRコード" />
          </div>
        )}
      </section>
    </div>
  );
};

export default App;

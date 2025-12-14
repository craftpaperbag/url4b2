import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';

const DEFAULT_STEPS = 16;
const STEP_INTERVALS_PER_BEAT = 4; // 16th notes
const STEP_OPTIONS = [16, 8] as const;

const scheduleIdleCallback = (callback: IdleRequestCallback, options?: IdleRequestOptions): number => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window && window.requestIdleCallback) {
    return window.requestIdleCallback(callback, options);
  }

  const timeout = options?.timeout ?? 1;
  return window.setTimeout(
    () =>
      callback({
        didTimeout: false,
        timeRemaining: () => 0,
      } as IdleDeadline),
    timeout,
  );
};

const cancelIdleCallback = (handle: number) => {
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window && window.cancelIdleCallback) {
    window.cancelIdleCallback(handle);
    return;
  }

  window.clearTimeout(handle);
};

const instruments = [
  { id: 'kick', label: 'キック', accent: '#f97316' },
  { id: 'snare', label: 'スネア', accent: '#6366f1' },
  { id: 'hihat', label: 'ハイハット', accent: '#22c55e' },
] as const;

type InstrumentId = (typeof instruments)[number]['id'];
type Pattern = Record<InstrumentId, boolean[]>;

const SYNTH_KEYS = [
  { key: 'a', label: 'A', note: 'C4', frequency: 261.63 },
  { key: 'w', label: 'W', note: 'C#4', frequency: 277.18, isSharp: true },
  { key: 's', label: 'S', note: 'D4', frequency: 293.66 },
  { key: 'e', label: 'E', note: 'D#4', frequency: 311.13, isSharp: true },
  { key: 'd', label: 'D', note: 'E4', frequency: 329.63 },
  { key: 'f', label: 'F', note: 'F4', frequency: 349.23 },
  { key: 't', label: 'T', note: 'F#4', frequency: 369.99, isSharp: true },
  { key: 'g', label: 'G', note: 'G4', frequency: 392 },
  { key: 'y', label: 'Y', note: 'G#4', frequency: 415.3, isSharp: true },
  { key: 'h', label: 'H', note: 'A4', frequency: 440 },
  { key: 'u', label: 'U', note: 'A#4', frequency: 466.16, isSharp: true },
  { key: 'j', label: 'J', note: 'B4', frequency: 493.88 },
  { key: 'k', label: 'K', note: 'C5', frequency: 523.25 },
  { key: 'o', label: 'O', note: 'C#5', frequency: 554.37, isSharp: true },
  { key: 'l', label: 'L', note: 'D5', frequency: 587.33 },
];

const createEmptyPattern = (steps: number): Pattern => {
  const base: Record<string, boolean[]> = {};
  instruments.forEach(({ id }) => {
    base[id] = Array(steps).fill(false);
  });
  return base as Pattern;
};

const encodePattern = (pattern: Pattern, steps: number): string => {
  const bits: number[] = [];
  for (let step = 0; step < steps; step += 1) {
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

const decodePattern = (encoded: string | null, steps: number): Pattern => {
  if (!encoded) return createEmptyPattern(steps);
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
    const pattern = createEmptyPattern(steps);
    for (let step = 0; step < steps; step += 1) {
      instruments.forEach((inst, instIdx) => {
        const idx = step * instruments.length + instIdx;
        pattern[inst.id][step] = Boolean(bits[idx]);
      });
    }
    return pattern;
  } catch (err) {
    console.warn('パターンの読み込みに失敗しました', err);
    return createEmptyPattern(steps);
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
  const getInitialSteps = (): (typeof STEP_OPTIONS)[number] => {
    const param = new URL(window.location.href).searchParams.get('l');
    const parsed = Number(param);
    return STEP_OPTIONS.includes(parsed as (typeof STEP_OPTIONS)[number])
      ? (parsed as (typeof STEP_OPTIONS)[number])
      : DEFAULT_STEPS;
  };

  const [steps, setSteps] = useState<(typeof STEP_OPTIONS)[number]>(getInitialSteps);
  const [pattern, setPattern] = useState<Pattern>(() =>
    decodePattern(new URL(window.location.href).searchParams.get('p'), getInitialSteps()),
  );
  const [bpm, setBpm] = useState(110);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [shareLink, setShareLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [isSynthEnabled, setIsSynthEnabled] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const synthVoicesRef = useRef<Map<string, { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }>>(
    new Map(),
  );

  const { ctx, ensureContext } = useAudioContext();
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  const shareTimeoutRef = useRef<number | null>(null);
  const idleCallbackRef = useRef<number | null>(null);

  const patternRef = useRef(pattern);
  const bpmRef = useRef(bpm);
  const stepsRef = useRef(steps);
  const pressedKeysRef = useRef(pressedKeys);

  useEffect(() => {
    patternRef.current = pattern;
    if (shareTimeoutRef.current) {
      window.clearTimeout(shareTimeoutRef.current);
    }
    if (idleCallbackRef.current !== null) {
      cancelIdleCallback(idleCallbackRef.current);
      idleCallbackRef.current = null;
    }

    setIsGeneratingLink(true);
    shareTimeoutRef.current = window.setTimeout(() => {
      const generateLink = () => {
        const url = new URL(window.location.href);
        const encoded = encodePattern(patternRef.current, steps);
        url.searchParams.set('p', encoded);
        url.searchParams.set('l', String(steps));
        window.history.replaceState(null, '', url.toString());
        setShareLink(url.toString());
        setIsGeneratingLink(false);
        idleCallbackRef.current = null;
      };

      idleCallbackRef.current = scheduleIdleCallback(generateLink, { timeout: 300 });

      shareTimeoutRef.current = null;
    }, 150);

    return () => {
      if (shareTimeoutRef.current) {
        window.clearTimeout(shareTimeoutRef.current);
        shareTimeoutRef.current = null;
      }
      if (idleCallbackRef.current !== null) {
        cancelIdleCallback(idleCallbackRef.current);
        idleCallbackRef.current = null;
      }
    };
  }, [pattern, steps]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    stepsRef.current = steps;
    setCurrentStep((prev) => prev % steps);
  }, [steps]);

  useEffect(() => {
    pressedKeysRef.current = pressedKeys;
  }, [pressedKeys]);

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
        const nextStep = (prev + 1) % stepsRef.current;
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
    setPattern((prev) => {
      const row = prev[instrumentId];
      const updatedRow = row.slice();
      updatedRow[step] = !row[step];

      if (updatedRow[step] === row[step]) {
        return prev;
      }

      return {
        ...prev,
        [instrumentId]: updatedRow,
      };
    });
  };

  const handleStepsChange = (nextSteps: (typeof STEP_OPTIONS)[number]) => {
    if (nextSteps === stepsRef.current) return;
    setSteps(nextSteps);
    setPattern((prev) => {
      const resized: Record<InstrumentId, boolean[]> = {} as Record<InstrumentId, boolean[]>;
      instruments.forEach(({ id }) => {
        const current = prev[id];
        if (nextSteps < current.length) {
          resized[id] = current.slice(0, nextSteps);
        } else {
          const missing = nextSteps - current.length;
          const copy = current.slice(0, missing);
          resized[id] = [...current, ...copy];
        }
      });
      return resized as Pattern;
    });
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

  const handleSynthPadPress = async (key: string, frequency: number) => {
    await startSynthVoice(key, frequency);
    highlightKey(key);
  };

  const handleSynthPadRelease = (key: string) => {
    stopSynthVoice(key);
    releaseKey(key);
  };

  const playTechnoTone = (
    audioContext: AudioContext,
    frequency: number,
  ): { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } => {
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const sub = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    osc.type = 'sawtooth';
    sub.type = 'square';
    osc.frequency.setValueAtTime(frequency, now);
    sub.frequency.setValueAtTime(frequency / 2, now);
    osc.detune.setValueAtTime(6, now);
    sub.detune.setValueAtTime(-6, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.Q.value = 10;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.72, now + 0.03);

    osc.connect(filter).connect(gain).connect(audioContext.destination);
    sub.connect(filter);
    osc.start(now);
    sub.start(now);

    return { osc, gain, filter };
  };

  const startSynthVoice = async (key: string, frequency: number) => {
    if (synthVoicesRef.current.has(key)) return;
    const audioContext = ensureContext();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const voice = playTechnoTone(audioContext, frequency);
    synthVoicesRef.current.set(key, voice);
  };

  const stopSynthVoice = (key: string) => {
    const voice = synthVoicesRef.current.get(key);
    if (!voice) return;
    const audioContext = ensureContext();
    const now = audioContext.currentTime;
    const currentGain = voice.gain.gain.value;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(currentGain, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    voice.osc.stop(now + 0.25);
    synthVoicesRef.current.delete(key);
  };

  const highlightKey = (key: string) => {
    setPressedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const releaseKey = (key: string) => {
    setPressedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const stopAllSynthVoices = () => {
    synthVoicesRef.current.forEach((_, key) => stopSynthVoice(key));
  };

  const handleSynthKeyDown = async (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const match = SYNTH_KEYS.find((synthKey) => synthKey.key === key);
    if (!match) return;
    event.preventDefault();
    await startSynthVoice(key, match.frequency);
    highlightKey(key);
  };

  const handleSynthKeyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!pressedKeysRef.current.has(key)) return;
    stopSynthVoice(key);
    releaseKey(key);
  };

  useEffect(() => {
    if (!isSynthEnabled) {
      stopAllSynthVoices();
      setPressedKeys(new Set());
      return undefined;
    }
    const downListener = (event: KeyboardEvent) => {
      handleSynthKeyDown(event).catch((err) => console.error(err));
    };
    window.addEventListener('keydown', downListener);
    window.addEventListener('keyup', handleSynthKeyUp);

    return () => {
      window.removeEventListener('keydown', downListener);
      window.removeEventListener('keyup', handleSynthKeyUp);
    };
  }, [isSynthEnabled]);

  const presetButtons = useMemo(
    () => [
      {
        label: '定番の4つ打ち',
        pattern: (() => {
          const base = createEmptyPattern(steps);
          for (let i = 0; i < steps; i += 4) {
            base.kick[i] = true;
          }
          for (let i = 2; i < steps; i += 4) {
            base.snare[i] = true;
          }
          for (let i = 0; i < steps; i += 2) {
            base.hihat[i] = true;
          }
          return base;
        })(),
      },
      {
        label: 'ハーフタイム',
        pattern: (() => {
          const base = createEmptyPattern(steps);
          [0, Math.floor(steps / 2)].forEach((i) => (base.kick[i] = true));
          [Math.floor(steps / 4), Math.floor((steps * 3) / 4)].forEach((i) =>
            (base.snare[i] = true),
          );
          for (let i = 1; i < steps; i += 2) {
            base.hihat[i] = true;
          }
          return base;
        })(),
      },
    ],
    [steps],
  );

  return (
    <div className="app">
      <div className="floating-controls" aria-label="常時表示の操作パネル">
        <button className="primary" onClick={handlePlayToggle}>
          {isPlaying ? '一時停止' : '再生'}
        </button>
        <div className="floating-step-toggle" aria-label="ステップ数の切り替え">
          {STEP_OPTIONS.map((option) => (
            <button
              key={option}
              className={`secondary ${steps === option ? 'active' : ''}`}
              onClick={() => handleStepsChange(option)}
            >
              {option} ステップ
            </button>
          ))}
        </div>
        <div className="floating-bpm" aria-label="テンポ設定">
          <label htmlFor="floating-bpm">テンポ</label>
          <input
            id="floating-bpm"
            type="range"
            min={60}
            max={160}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
          <span>{bpm} BPM</span>
        </div>
        <label className="synth-toggle floating" aria-label="シンセサイザーモード">
          <input
            type="checkbox"
            checked={isSynthEnabled}
            onChange={(e) => setIsSynthEnabled(e.target.checked)}
          />
          <span className="slider" aria-hidden="true" />
          <span className="toggle-label">シンセ {isSynthEnabled ? 'ON' : 'OFF'}</span>
        </label>
      </div>

      <header className="hero">
        <div>
          <p className="eyebrow">モバイル特化・URLだけで共有</p>
          <h1>url4b2</h1>
          <p className="sub">ステップをタップしてビートを作成。ワンタップで再生・共有。シンセでライブ演奏も可能。</p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={handlePlayToggle}>
            {isPlaying ? '一時停止' : '再生'}
          </button>
          <button className="ghost" onClick={() => setPattern(createEmptyPattern(steps))}>クリア</button>
        </div>
      </header>

      <section className="controls">
        <div className="control">
          <label>シーケンサ長</label>
          <div className="step-length-toggle">
            {STEP_OPTIONS.map((option) => (
              <button
                key={option}
                className={`secondary ${steps === option ? 'active' : ''}`}
                onClick={() => handleStepsChange(option)}
              >
                {option} ステップ
              </button>
            ))}
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

      <section className="synth">
        <div className="synth-header">
          <div>
            <p className="eyebrow">リアルタイム演奏</p>
            <h2>シンセサイザー</h2>
            <p className="sub">シンセをオンにすると、ビートに合わせてキーボードで演奏できます。</p>
          </div>
          <div className="synth-status">シンセ {isSynthEnabled ? 'ON' : 'OFF'}</div>
        </div>

        {isSynthEnabled && (
          <>
            <div className="synth-keys" aria-label="キーボード対応鍵盤">
              {SYNTH_KEYS.map((keyInfo) => (
                <button
                  key={keyInfo.key}
                  className={`synth-key ${keyInfo.isSharp ? 'sharp' : 'natural'} ${pressedKeys.has(keyInfo.key) ? 'active' : ''}`}
                  onMouseDown={() => handleSynthPadPress(keyInfo.key, keyInfo.frequency)}
                  onMouseUp={() => handleSynthPadRelease(keyInfo.key)}
                  onMouseLeave={() => handleSynthPadRelease(keyInfo.key)}
                >
                  <span className="synth-key-label">{keyInfo.label}</span>
                  <span className="synth-key-note">{keyInfo.note}</span>
                </button>
              ))}
            </div>
            <p className="synth-hint">A〜Lキーで演奏できます。ビートを再生しながらメロディを重ねてください。</p>
          </>
        )}
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

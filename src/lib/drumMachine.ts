import { InstrumentId, PatternGrid } from './patternCodec';

type DrumVoice = (time: number) => void;

export type DrumMachine = {
  start: () => Promise<void>;
  stop: () => void;
  scheduleStep: (time: number, pattern: PatternGrid, stepIndex: number) => void;
  getCurrentTime: () => number;
};

const createNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

const createKick = (ctx: AudioContext): DrumVoice => (time: number) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.35);
  gain.gain.setValueAtTime(1, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.5);
};

const createSnare = (ctx: AudioContext, noise: AudioBuffer): DrumVoice => (time: number) => {
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noise;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.setValueAtTime(1000, time);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.5, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
  noiseSource.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);

  const tone = ctx.createOscillator();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(180, time);
  tone.frequency.exponentialRampToValueAtTime(80, time + 0.2);
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0.5, time);
  toneGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
  tone.connect(toneGain).connect(ctx.destination);

  noiseSource.start(time);
  noiseSource.stop(time + 0.25);
  tone.start(time);
  tone.stop(time + 0.25);
};

const createHiHat = (ctx: AudioContext, noise: AudioBuffer): DrumVoice => (time: number) => {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const bandPass = ctx.createBiquadFilter();
  bandPass.type = 'bandpass';
  bandPass.frequency.setValueAtTime(8000, time);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
  source.connect(bandPass).connect(gain).connect(ctx.destination);
  source.start(time);
  source.stop(time + 0.1);
};

export const buildDrumMachine = (): DrumMachine => {
  let audioCtx: AudioContext | null = null;
  let voices: Record<InstrumentId, DrumVoice> | null = null;

  const ensureContext = async () => {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      const noiseBuffer = createNoiseBuffer(audioCtx);
      voices = {
        kick: createKick(audioCtx),
        snare: createSnare(audioCtx, noiseBuffer),
        hihat: createHiHat(audioCtx, noiseBuffer)
      };
    }
    await audioCtx.resume();
  };

  const start = async () => {
    await ensureContext();
  };

  const stop = () => {
    if (audioCtx) {
      audioCtx.suspend();
    }
  };

  const scheduleStep = (time: number, pattern: PatternGrid, stepIndex: number) => {
    const machineVoices = voices;
    if (!audioCtx || !machineVoices) return;
    (['kick', 'snare', 'hihat'] as InstrumentId[]).forEach((instrument) => {
      if (pattern[instrument][stepIndex]) {
        machineVoices[instrument](time);
      }
    });
  };

  const getCurrentTime = () => audioCtx?.currentTime ?? 0;

  return { start, stop, scheduleStep, getCurrentTime };
};

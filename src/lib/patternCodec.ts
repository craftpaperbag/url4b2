export type InstrumentId = 'kick' | 'snare' | 'hihat';

export type PatternGrid = Record<InstrumentId, boolean[]>;

const instruments: InstrumentId[] = ['kick', 'snare', 'hihat'];

export const DEFAULT_STEPS = 16;

export const createEmptyPattern = (steps = DEFAULT_STEPS): PatternGrid => ({
  kick: Array.from({ length: steps }, (_, i) => i % 4 === 0),
  snare: Array.from({ length: steps }, (_, i) => i % 8 === 4),
  hihat: Array.from({ length: steps }, () => false)
});

const toByteArray = (pattern: PatternGrid, steps: number): Uint8Array => {
  const bytesPerTrack = Math.ceil(steps / 8);
  const buffer = new Uint8Array(bytesPerTrack * instruments.length);

  instruments.forEach((instrument, trackIndex) => {
    const stepsForTrack = pattern[instrument];
    for (let step = 0; step < steps; step += 1) {
      if (stepsForTrack[step]) {
        const byteIndex = Math.floor(step / 8) + trackIndex * bytesPerTrack;
        const bit = 7 - (step % 8);
        buffer[byteIndex] |= 1 << bit;
      }
    }
  });

  return buffer;
};

const fromByteArray = (bytes: Uint8Array, steps: number): PatternGrid => {
  const bytesPerTrack = Math.ceil(steps / 8);
  const pattern = createEmptyPattern(steps);

  instruments.forEach((instrument, trackIndex) => {
    const track = new Array<boolean>(steps).fill(false);
    for (let step = 0; step < steps; step += 1) {
      const byteIndex = Math.floor(step / 8) + trackIndex * bytesPerTrack;
      const bit = 7 - (step % 8);
      track[step] = (bytes[byteIndex] & (1 << bit)) !== 0;
    }
    pattern[instrument] = track;
  });

  return pattern;
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const base64 = btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return base64;
};

const fromBase64Url = (encoded: string): Uint8Array => {
  const base64 = encoded
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  const binary = atob(base64);
  return new Uint8Array([...binary].map((char) => char.charCodeAt(0)));
};

export const encodePattern = (pattern: PatternGrid, steps = DEFAULT_STEPS): string => {
  const bytes = toByteArray(pattern, steps);
  return toBase64Url(bytes);
};

export const decodePattern = (code: string | null, steps = DEFAULT_STEPS): PatternGrid => {
  if (!code || /[^A-Za-z0-9\-_]/.test(code)) {
    return createEmptyPattern(steps);
  }
  try {
    const bytes = fromBase64Url(code);
    if (bytes.length < Math.ceil(steps / 8) * instruments.length) {
      return createEmptyPattern(steps);
    }
    return fromByteArray(bytes, steps);
  } catch (error) {
    console.error('Failed to decode pattern', error);
    return createEmptyPattern(steps);
  }
};

export const instrumentsMeta = {
  kick: { label: 'Kick', color: 'bg-sky-500' },
  snare: { label: 'Snare', color: 'bg-amber-400' },
  hihat: { label: 'Hi-Hat', color: 'bg-lime-400' }
};

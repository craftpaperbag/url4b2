'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DEFAULT_STEPS,
  InstrumentId,
  PatternGrid,
  decodePattern,
  encodePattern,
  instrumentsMeta
} from '@/lib/patternCodec';
import { buildDrumMachine } from '@/lib/drumMachine';

const drumMachine = buildDrumMachine();
const steps = DEFAULT_STEPS;
const stepLabels = ['1', 'e', '&', 'a'];

const formatStepLabel = (index: number) => {
  const bar = Math.floor(index / 4) + 1;
  const position = stepLabels[index % 4];
  return `${bar}${position}`;
};

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pattern, setPattern] = useState<PatternGrid>(() => decodePattern(searchParams.get('p'), steps));
  const [tempo, setTempo] = useState(95);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPattern(decodePattern(searchParams.get('p'), steps));
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = encodePattern(pattern, steps);
    const params = new URLSearchParams(window.location.search);
    params.set('p', code);
    const query = params.toString();
    router.replace(`?${query}`, { scroll: false });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    const origin = baseUrl && baseUrl.length > 0 ? baseUrl.replace(/\/$/, '') : window.location.origin;
    setShareUrl(`${origin}?${query}`);
  }, [pattern, router]);

  useEffect(() => {
    if (!isPlaying) {
      drumMachine.stop();
      return undefined;
    }
    let cancelled = false;
    let stepCounter = 0;

    const start = async () => {
      await drumMachine.start();
      let nextTime = drumMachine.getCurrentTime() + 0.05;
      const scheduleAheadTime = 0.15;
      const scheduleLoop = () => {
        if (cancelled) return;
        const stepDuration = 60 / tempo / 4;
        const now = drumMachine.getCurrentTime();
        while (nextTime < now + scheduleAheadTime) {
          const index = stepCounter % steps;
          drumMachine.scheduleStep(nextTime, pattern, index);
          setActiveStep(index);
          stepCounter += 1;
          nextTime += stepDuration;
        }
        requestAnimationFrame(scheduleLoop);
      };
      scheduleLoop();
    };

    start();

    return () => {
      cancelled = true;
      drumMachine.stop();
    };
  }, [isPlaying, tempo, pattern]);

  const toggleStep = (instrument: InstrumentId, stepIndex: number) => {
    setPattern((prev) => {
      const updated: PatternGrid = {
        ...prev,
        [instrument]: prev[instrument].map((value, i) => (i === stepIndex ? !value : value))
      } as PatternGrid;
      return updated;
    });
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy link', error);
    }
  };

  const qrSrc = useMemo(() => {
    if (!shareUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}`;
  }, [shareUrl]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Pocket Drummer</p>
        <h1 className="text-3xl font-semibold">16ステップ・ドラムシーケンサー</h1>
        <p className="text-sm text-slate-400">
          タップでリズムを作り、URLだけで仲間と共有できます。モバイルの片手操作に最適化しました。
        </p>
      </header>

      <section className="rounded-2xl bg-panel/70 p-4 shadow-xl ring-1 ring-white/5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPlaying((v) => !v)}
              className="rounded-full bg-accent px-4 py-2 text-surface shadow-glow transition hover:scale-[1.02]"
            >
              {isPlaying ? 'Stop' : 'Play'}
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase tracking-wide text-slate-400">BPM</span>
              <input
                type="range"
                min={70}
                max={140}
                step={1}
                value={tempo}
                onChange={(e) => setTempo(Number(e.target.value))}
                className="h-2 w-36 cursor-pointer appearance-none rounded-full bg-grid"
              />
              <span className="font-mono text-lg">{tempo}</span>
            </div>
          </div>
          <div className="text-xs text-slate-400">ステップ {formatStepLabel(activeStep)}</div>
        </div>

        <div className="flex flex-col gap-3">
          {(Object.keys(instrumentsMeta) as InstrumentId[]).map((instrument) => (
            <div key={instrument} className="rounded-xl bg-surface/80 p-3 ring-1 ring-white/5">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <span className={`inline-block h-2 w-2 rounded-full ${instrumentsMeta[instrument].color}`} />
                {instrumentsMeta[instrument].label}
              </div>
              <div className="grid grid-cols-8 gap-2 sm:grid-cols-16">
                {Array.from({ length: steps }).map((_, index) => {
                  const isOn = pattern[instrument][index];
                  const isHot = activeStep === index && isPlaying;
                  return (
                    <button
                      key={`${instrument}-${index}`}
                      type="button"
                      onClick={() => toggleStep(instrument, index)}
                      className={`flex h-10 items-center justify-center rounded-lg border text-xs transition
                        ${isOn ? 'border-accent/70 bg-accent/20 text-accent' : 'border-grid bg-grid/60 text-slate-400'}
                        ${isHot ? 'ring-2 ring-accent/80 shadow-glow' : ''}
                      `}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl bg-panel/70 p-4 shadow-xl ring-1 ring-white/5 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">共有リンク</h2>
          <p className="text-sm text-slate-400">
            パターンは16進数を圧縮した短いトークンでURLに埋め込み。ファイル共有なしで仲間と同期できます。
          </p>
          <div className="flex flex-col gap-3 rounded-xl bg-surface/80 p-3 ring-1 ring-white/5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={shareUrl}
                className="w-full rounded-lg bg-grid/60 px-3 py-2 font-mono text-sm text-slate-100 ring-1 ring-grid/80"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-surface shadow-glow transition hover:scale-[1.02]"
              >
                {copied ? 'Copied!' : 'ワンタップコピー'}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              パターンが変わるたび自動更新されます。
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-surface/80 p-3 ring-1 ring-white/5">
          <h3 className="text-sm font-semibold">QRコード</h3>
          {qrSrc ? (
            <img src={qrSrc} alt="共有用QR" className="h-48 w-48 rounded-xl bg-white p-3" />
          ) : (
            <div className="flex h-48 w-48 items-center justify-center rounded-xl border border-dashed border-grid/80 text-slate-500">
              リンクを作成すると表示されます
            </div>
          )}
          <p className="text-xs text-slate-400">ライブ会場やスタジオでかざすだけで共有。</p>
        </div>
      </section>
    </main>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import {
  Circle,
  Download,
  FolderOpen,
  Headphones,
  Keyboard,
  Pause,
  Play,
  Repeat,
  Save,
  Square,
  Upload,
} from 'lucide-react';
import { DeckId, DeckState, djEngine } from '../audio/djEngine';
import { apiFetch, getAudioStreamUrl } from '../lib/api';
import { AudioFileItem, UserProfile } from '../types/studio';

interface DJStudioPageProps {
  libraryTracks: AudioFileItem[];
  user: UserProfile | null;
  onRequireAuth: () => void;
  onMixSaved: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const DJStudioPage: React.FC<DJStudioPageProps> = ({
  libraryTracks,
  user,
  onRequireAuth,
  onMixSaved,
}) => {
  const [decks, setDecks] = useState<{ A: DeckState; B: DeckState }>(() => djEngine.getStates());
  const [crossfader, setCrossfader] = useState(() => djEngine.getCrossfader());
  const [masterVol, setMasterVol] = useState(() => djEngine.getMasterVolume());
  const [isRecording, setIsRecording] = useState(djEngine.isRecording);
  const [recDuration, setRecDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [mixTitle, setMixTitle] = useState('DJ MUNIX Live Session');
  const [savingMix, setSavingMix] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loadingDeck, setLoadingDeck] = useState<DeckId | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [pickerDeck, setPickerDeck] = useState<DeckId | null>(null);

  const spectrumRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const unsub = djEngine.subscribe(() => {
      setDecks(djEngine.getStates());
      setCrossfader(djEngine.getCrossfader());
      setMasterVol(djEngine.getMasterVolume());
      setIsRecording(djEngine.isRecording);
      setRecDuration(djEngine.recordingDurationSec);
    });
    return unsub;
  }, []);

  // Live master spectrum visualizer
  useEffect(() => {
    let raf = 0;
    const bins = new Uint8Array(new ArrayBuffer(64));
    const draw = () => {
      const canvas = spectrumRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          djEngine.getFrequencyData(bins);
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#090d0b';
          ctx.fillRect(0, 0, w, h);

          const barCount = 32;
          const barW = w / barCount - 2;
          for (let i = 0; i < barCount; i++) {
            const val = bins[i] / 255;
            const barH = Math.max(3, val * (h - 6));
            const grad = ctx.createLinearGradient(0, h, 0, h - barH);
            grad.addColorStop(0, '#10b981');
            grad.addColorStop(0.7, '#34d399');
            grad.addColorStop(1, '#e5b84b');
            ctx.fillStyle = grad;
            ctx.fillRect(i * (barW + 2), h - barH, barW, barH);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Desktop keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'q') djEngine.togglePlay('A');
      if (e.key.toLowerCase() === 'p') djEngine.togglePlay('B');
      if (e.key.toLowerCase() === 'a') djEngine.jumpToCue('A');
      if (e.key.toLowerCase() === 'l') djEngine.jumpToCue('B');
      if (e.key === 'ArrowLeft') djEngine.setCrossfader(Math.max(-1, djEngine.getCrossfader() - 0.1));
      if (e.key === 'ArrowRight') djEngine.setCrossfader(Math.min(1, djEngine.getCrossfader() + 0.1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleFileUpload = async (id: DeckId, file: File | undefined) => {
    if (!file) return;
    setLoadingDeck(id);
    setStatusMsg(null);
    try {
      const buf = await file.arrayBuffer();
      await djEngine.loadFromArrayBuffer(id, buf, {
        title: file.name.replace(/\.[^/.]+$/, ''),
        artist: 'Local Device Track',
      });
      setStatusMsg(`Loaded "${file.name}" into Deck ${id}.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Unable to decode audio file.');
    } finally {
      setLoadingDeck(null);
    }
  };

  const handleLoadLibraryTrack = async (id: DeckId, track: AudioFileItem) => {
    setPickerDeck(null);
    setLoadingDeck(id);
    setStatusMsg(null);
    try {
      await djEngine.loadFromUrl(id, getAudioStreamUrl(track.id), {
        title: track.title,
        artist: track.artist,
        bpm: track.bpm,
      });
      setStatusMsg(`Loaded "${track.title}" into Deck ${id}.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to load track.');
    } finally {
      setLoadingDeck(null);
    }
  };

  const handleToggleRecord = async () => {
    if (isRecording) {
      const blob = await djEngine.stopRecording();
      if (blob) {
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        setStatusMsg('Mix recording captured. Preview, save to My Music, or download below.');
      }
    } else {
      setRecordedBlob(null);
      djEngine.startRecording();
      setStatusMsg('Recording live master mix...');
    }
  };

  const handleSaveRecording = async () => {
    if (!recordedBlob) return;
    if (!user) {
      onRequireAuth();
      return;
    }
    setSavingMix(true);
    try {
      const form = new FormData();
      form.append('audio', recordedBlob, `${mixTitle.replace(/\s+/g, '_')}.webm`);
      form.append('title', mixTitle);
      form.append('artist', user.displayName);
      form.append('category', 'DJ Mix');
      form.append('bpm', String(decks.A.effectiveBpm || 120));
      form.append('durationSec', String(recDuration));
      form.append('sourceType', 'recording');
      form.append('isPublic', 'false');
      await apiFetch('/api/audio/upload', { method: 'POST', body: form });
      setStatusMsg(`Saved "${mixTitle}" privately to My Music.`);
      onMixSaved();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to save mix.');
    } finally {
      setSavingMix(false);
    }
  };

  const renderDeck = (deck: DeckState) => {
    const isA = deck.id === 'A';
    const accentText = isA ? 'text-emerald-400' : 'text-amber-400';
    const accentBorder = isA ? 'border-emerald-500/30' : 'border-amber-500/30';
    const accentBg = isA ? 'bg-emerald-500' : 'bg-amber-500';
    const progressPct = deck.duration > 0 ? (deck.position / deck.duration) * 100 : 0;
    const cuePct = deck.duration > 0 ? (deck.cuePoint / deck.duration) * 100 : 0;

    return (
      <div className={`rounded-2xl border ${accentBorder} bg-[#0e1311] p-4 sm:p-5 space-y-4`}>
        {/* Deck Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs">
              <span className={`font-bold ${accentText}`}>DECK {deck.id}</span>
              <span className="text-neutral-500">·</span>
              <span className="font-mono tabular-nums text-neutral-300">{deck.effectiveBpm} BPM</span>
              <span className="text-neutral-500">·</span>
              <span className="font-mono tabular-nums text-neutral-400">
                {((deck.pitchRate - 1) * 100).toFixed(1)}%
              </span>
            </div>
            <h3 className="text-base font-semibold text-white truncate mt-1">{deck.title}</h3>
            <p className="text-xs text-neutral-400 truncate">{deck.artist}</p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <label className="min-h-[40px] px-3 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{loadingDeck === deck.id ? 'Decoding...' : 'File'}</span>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => handleFileUpload(deck.id, e.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              onClick={() => setPickerDeck(deck.id)}
              className="min-h-[40px] px-3 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Library</span>
            </button>
          </div>
        </div>

        {/* Interactive Waveform & Playhead */}
        <div
          className="relative h-24 rounded-xl border border-white/10 bg-[#070a09] overflow-hidden cursor-pointer select-none"
          onClick={(e) => {
            if (!deck.loaded || deck.duration <= 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            djEngine.seek(deck.id, ratio * deck.duration);
          }}
        >
          <div className="absolute inset-0 flex items-center gap-[2px] px-2">
            {(deck.waveformPeaks.length > 0 ? deck.waveformPeaks : Array.from({ length: 80 }, () => 0.08)).map(
              (peak, idx, arr) => {
                const barPct = (idx / arr.length) * 100;
                const played = barPct <= progressPct;
                return (
                  <div
                    key={idx}
                    style={{ height: `${Math.max(10, peak * 84)}%` }}
                    className={`flex-1 rounded-sm transition-colors ${
                      played ? (isA ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-white/20'
                    }`}
                  />
                );
              }
            )}
          </div>

          {deck.loaded && (
            <>
              <div
                style={{ left: `${cuePct}%` }}
                className="absolute inset-y-0 w-0.5 bg-amber-300/80"
                title="Cue Point"
              />
              <div
                style={{ left: `${progressPct}%` }}
                className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_#fff]"
              />
            </>
          )}

          <div className="absolute bottom-1.5 right-2.5 px-2 py-0.5 rounded bg-black/70 text-[11px] font-mono tabular-nums text-white">
            {formatTime(deck.position)} / {formatTime(deck.duration)}
          </div>
        </div>

        {/* Transport & Cue / Loop */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <button
            type="button"
            disabled={!deck.loaded}
            onClick={() => djEngine.togglePlay(deck.id)}
            className={`min-h-[44px] rounded-lg ${accentBg} disabled:opacity-40 text-black font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer`}
          >
            {deck.playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{deck.playing ? 'Pause' : 'Play'}</span>
          </button>

          <button
            type="button"
            disabled={!deck.loaded}
            onClick={() => djEngine.stop(deck.id)}
            className="min-h-[44px] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs font-medium text-white flex items-center justify-center gap-1 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Stop</span>
          </button>

          <button
            type="button"
            disabled={!deck.loaded}
            onClick={() => djEngine.setCuePoint(deck.id)}
            className="min-h-[44px] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs font-medium text-amber-300 cursor-pointer"
          >
            Set Cue
          </button>

          <button
            type="button"
            disabled={!deck.loaded}
            onClick={() => djEngine.jumpToCue(deck.id)}
            className="min-h-[44px] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs font-medium text-white cursor-pointer"
          >
            Cue
          </button>

          <button
            type="button"
            disabled={!deck.loaded}
            onClick={() => djEngine.toggleLoop(deck.id)}
            className={`min-h-[44px] rounded-lg border text-xs font-medium flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 ${
              deck.loopEnabled
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                : 'border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Loop {deck.loopLengthSec}s</span>
          </button>

          <button
            type="button"
            onClick={() => djEngine.setDeckParam(deck.id, 'headphoneCue', !deck.headphoneCue)}
            className={`min-h-[44px] rounded-lg border text-xs font-medium flex items-center justify-center gap-1 cursor-pointer ${
              deck.headphoneCue
                ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
            }`}
            title="Headphone PFL Preview"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>PFL</span>
          </button>
        </div>

        {/* Volume, Pitch & 3-Band EQ */}
        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-neutral-400">Channel Volume</span>
                <span className="font-mono tabular-nums text-white">{Math.round(deck.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={deck.volume}
                onChange={(e) => djEngine.setDeckParam(deck.id, 'volume', Number(e.target.value))}
                className="w-full studio-fader studio-fader-emerald"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-neutral-400">Pitch / Tempo</span>
                <span className="font-mono tabular-nums text-white">{deck.pitchRate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.4}
                step={0.01}
                value={deck.pitchRate}
                onChange={(e) => djEngine.setDeckParam(deck.id, 'pitchRate', Number(e.target.value))}
                className="w-full studio-fader"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-neutral-400">Lowpass Filter</span>
                <span className="font-mono tabular-nums text-white">{Math.round(deck.filterCutoff)} Hz</span>
              </div>
              <input
                type="range"
                min={200}
                max={18000}
                step={50}
                value={deck.filterCutoff}
                onChange={(e) => djEngine.setDeckParam(deck.id, 'filterCutoff', Number(e.target.value))}
                className="w-full studio-fader"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-neutral-400">Bass (120Hz)</span>
                <span className="font-mono tabular-nums text-white">{deck.bassDb > 0 ? `+${deck.bassDb}` : deck.bassDb} dB</span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={deck.bassDb}
                onChange={(e) => djEngine.setDeckParam(deck.id, 'bassDb', Number(e.target.value))}
                className="w-full studio-fader"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-neutral-400">Mid (1kHz)</span>
                <span className="font-mono tabular-nums text-white">{deck.midDb > 0 ? `+${deck.midDb}` : deck.midDb} dB</span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={deck.midDb}
                onChange={(e) => djEngine.setDeckParam(deck.id, 'midDb', Number(e.target.value))}
                className="w-full studio-fader"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-neutral-400">Treble (6kHz)</span>
                <span className="font-mono tabular-nums text-white">{deck.trebleDb > 0 ? `+${deck.trebleDb}` : deck.trebleDb} dB</span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={deck.trebleDb}
                onChange={(e) => djEngine.setDeckParam(deck.id, 'trebleDb', Number(e.target.value))}
                className="w-full studio-fader"
              />
            </div>
          </div>
        </div>

        {/* FX Sends & Loop Length */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/10 items-end">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-neutral-400">Echo FX</span>
              <span className="font-mono tabular-nums text-emerald-300">{Math.round(deck.echoMix * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={deck.echoMix}
              onChange={(e) => djEngine.setDeckParam(deck.id, 'echoMix', Number(e.target.value))}
              className="w-full studio-fader studio-fader-emerald"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-neutral-400">Reverb FX</span>
              <span className="font-mono tabular-nums text-amber-300">{Math.round(deck.reverbMix * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={deck.reverbMix}
              onChange={(e) => djEngine.setDeckParam(deck.id, 'reverbMix', Number(e.target.value))}
              className="w-full studio-fader"
            />
          </div>

          <div className="col-span-2 flex items-center gap-1.5">
            {[2, 4, 8, 16].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => djEngine.toggleLoop(deck.id, sec)}
                className={`flex-1 min-h-[38px] rounded-lg border text-xs font-mono cursor-pointer ${
                  deck.loopEnabled && deck.loopLengthSec === sec
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                    : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">DJ Studio — Dual-Deck Live Mixer</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Real-time Web Audio engine · 3-Band EQ · Pitch & BPM · Crossfader · Live Mix Recording
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowShortcuts(!showShortcuts)}
          className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-lg border border-white/10 bg-[#0e1311] text-xs text-neutral-200 hover:text-white cursor-pointer self-start"
        >
          <Keyboard className="w-4 h-4 text-amber-400" />
          <span>Shortcuts</span>
        </button>
      </div>

      {showShortcuts && (
        <div className="rounded-xl border border-white/10 bg-[#0e1311] p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><strong className="font-mono text-emerald-400">Q</strong> — Play / Pause Deck A</div>
          <div><strong className="font-mono text-amber-400">P</strong> — Play / Pause Deck B</div>
          <div><strong className="font-mono text-emerald-400">A / L</strong> — Jump Cue A / Cue B</div>
          <div><strong className="font-mono text-white">← / →</strong> — Slide Crossfader</div>
        </div>
      )}

      {statusMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
          {statusMsg}
        </div>
      )}

      {/* Dual Decks */}
      <div className="grid xl:grid-cols-2 gap-5">
        {renderDeck(decks.A)}
        {renderDeck(decks.B)}
      </div>

      {/* Master Crossfader, Visualizer & Recorder */}
      <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 grid lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-400">DECK A</span>
            <span className="text-neutral-300 font-medium">CROSSFADER</span>
            <span className="font-semibold text-amber-400">DECK B</span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={crossfader}
            onChange={(e) => djEngine.setCrossfader(Number(e.target.value))}
            className="w-full studio-fader"
          />
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-neutral-400">Master Volume</span>
                <span className="font-mono tabular-nums text-white">{Math.round(masterVol * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.01}
                value={masterVol}
                onChange={(e) => djEngine.setMasterVolume(Number(e.target.value))}
                className="w-full studio-fader studio-fader-emerald"
              />
            </div>
            <button
              type="button"
              onClick={() => djEngine.setCrossfader(0)}
              className="min-h-[38px] px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-neutral-300 hover:text-white cursor-pointer"
            >
              Center
            </button>
          </div>
        </div>

        <div className="lg:col-span-4">
          <p className="text-xs text-neutral-400 mb-1.5">Master Output Spectrum</p>
          <canvas
            ref={spectrumRef}
            width={380}
            height={84}
            className="w-full h-[84px] rounded-xl border border-white/10 bg-[#070a09]"
          />
        </div>

        <div className="lg:col-span-3 space-y-2.5">
          <button
            type="button"
            onClick={handleToggleRecord}
            className={`w-full min-h-[44px] rounded-lg font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              isRecording
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200'
            }`}
          >
            <Circle className={`w-3.5 h-3.5 ${isRecording ? 'fill-current' : ''}`} />
            <span>{isRecording ? `Stop Recording (${formatTime(recDuration)})` : 'Record Live Mix'}</span>
          </button>

          {recordedBlob && recordedUrl && (
            <div className="space-y-2 pt-1">
              <audio controls src={recordedUrl} className="w-full h-9" />
              <input
                type="text"
                value={mixTitle}
                onChange={(e) => setMixTitle(e.target.value)}
                className="w-full min-h-[36px] rounded-lg border border-white/10 bg-black/40 px-2.5 text-xs text-white"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={savingMix}
                  onClick={handleSaveRecording}
                  className="flex-1 min-h-[38px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingMix ? 'Saving...' : 'Save'}</span>
                </button>
                <a
                  href={recordedUrl}
                  download={`${mixTitle.replace(/\s+/g, '_')}.webm`}
                  className="min-h-[38px] px-3 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white flex items-center justify-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Track Library Picker Modal */}
      {pickerDeck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0e1311] p-5 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-semibold text-white">Load Track into Deck {pickerDeck}</h3>
              <button
                type="button"
                onClick={() => setPickerDeck(null)}
                className="min-h-[36px] px-3 rounded-lg text-xs text-neutral-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="mt-3 overflow-y-auto space-y-2 pr-1">
              {libraryTracks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleLoadLibraryTrack(pickerDeck, t)}
                  className="w-full text-left rounded-xl border border-white/10 bg-black/30 hover:border-emerald-500/40 p-3 flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{t.title}</p>
                    <p className="text-xs text-neutral-400 truncate">
                      {t.artist} · {t.category} · {t.bpm} BPM
                    </p>
                  </div>
                  <span className="text-xs font-medium text-emerald-400 shrink-0">Load</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

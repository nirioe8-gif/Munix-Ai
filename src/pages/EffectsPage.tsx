import React, { useRef, useState } from 'react';
import { BookmarkPlus, Play, Sliders, Square, Upload } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { playSynthesizedEffectPreview } from '../audio/wavEncoder';
import { SoundEffectItem, UserProfile } from '../types/studio';

interface EffectsPageProps {
  effects: SoundEffectItem[];
  user: UserProfile | null;
  onRequireAuth: () => void;
  onSaved: () => void;
}

export const EffectsPage: React.FC<EffectsPageProps> = ({ effects, user, onRequireAuth, onSaved }) => {
  const [selectedCat, setSelectedCat] = useState('All');
  const [activeFxId, setActiveFxId] = useState<string | null>(null);
  const [customBuffer, setCustomBuffer] = useState<AudioBuffer | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  const [presetType, setPresetType] = useState('echo');
  const [presetIntensity, setPresetIntensity] = useState(0.45);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const categories = ['All', ...Array.from(new Set(effects.map((e) => e.category)))];
  const filtered = effects.filter((e) => selectedCat === 'All' || e.category === selectedCat);

  const handleLoadTestAudio = async (file: File | undefined) => {
    if (!file) return;
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    await ctx.close();
    setCustomBuffer(decoded);
    setCustomFileName(file.name);
    setStatusMsg(`Loaded "${file.name}" for live effect auditioning.`);
  };

  const handlePreview = (fx: SoundEffectItem) => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
    if (activeFxId === fx.id) {
      setActiveFxId(null);
      return;
    }
    setActiveFxId(fx.id);
    stopRef.current = playSynthesizedEffectPreview(fx.effectType, fx.defaultParams, customBuffer);
    window.setTimeout(() => {
      setActiveFxId((curr) => (curr === fx.id ? null : curr));
    }, 4200);
  };

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!presetName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/api/effects/presets', {
        method: 'POST',
        body: JSON.stringify({
          name: presetName.trim(),
          category: 'Custom Presets',
          effectType: presetType,
          description: `Custom studio preset (${Math.round(presetIntensity * 100)}% intensity)`,
          defaultParams: { mix: presetIntensity, feedback: presetIntensity },
        }),
      });
      setPresetName('');
      setStatusMsg('Effect preset saved to your library.');
      onSaved();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to save preset.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">DJ Sound Effects Library</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Preview Web Audio DSP chains, trigger DJ drops & transitions, and save custom presets
          </p>
        </div>

        <label className="min-h-[42px] px-4 rounded-lg border border-white/15 bg-[#0e1311] hover:bg-white/5 text-xs font-medium text-white flex items-center gap-2 cursor-pointer self-start">
          <Upload className="w-4 h-4 text-emerald-400" />
          <span>{customFileName ? `Test Clip: ${customFileName}` : 'Load Audio to Preview FX'}</span>
          <input type="file" accept="audio/*" className="hidden" onChange={(e) => handleLoadTestAudio(e.target.files?.[0])} />
        </label>
      </div>

      {statusMsg && (
        <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
          {statusMsg}
        </div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCat(cat)}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              selectedCat === cat
                ? 'bg-emerald-500 text-black font-semibold'
                : 'bg-[#0e1311] border border-white/10 text-neutral-300 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((fx) => {
          const active = activeFxId === fx.id;
          return (
            <div key={fx.id} className="rounded-xl border border-white/10 bg-[#0e1311] p-4 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-amber-400">{fx.category}</span>
                  <span className="text-[11px] font-mono text-neutral-500">{fx.effectType}</span>
                </div>
                <h3 className="text-base font-semibold text-white mt-1">{fx.name}</h3>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{fx.description}</p>
              </div>

              <button
                type="button"
                onClick={() => handlePreview(fx)}
                className={`min-h-[42px] rounded-lg font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  active
                    ? 'bg-amber-500 text-black font-semibold'
                    : 'border border-emerald-500/35 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200'
                }`}
              >
                {active ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{active ? 'Stop Preview' : 'Preview Effect'}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Save Custom Preset */}
      <form onSubmit={handleSavePreset} className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-semibold text-white">Save Custom Effect Preset</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs text-neutral-300 mb-1.5">Preset Name</label>
            <input
              type="text"
              required
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g. Kigali Club Echo"
              className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-300 mb-1.5">Base Effect Engine</label>
            <select
              value={presetType}
              onChange={(e) => setPresetType(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-sm text-white"
            >
              <option value="echo">Echo</option>
              <option value="reverb">Reverb</option>
              <option value="delay">Delay</option>
              <option value="flanger">Flanger</option>
              <option value="phaser">Phaser</option>
              <option value="filter">Filter</option>
              <option value="chorus">Chorus</option>
              <option value="distortion">Distortion</option>
              <option value="bass_boost">Bass Boost</option>
              <option value="voice_changer">Voice Changer</option>
            </select>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-neutral-300">Mix / Intensity</span>
              <span className="font-mono text-white">{Math.round(presetIntensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={presetIntensity}
              onChange={(e) => setPresetIntensity(Number(e.target.value))}
              className="w-full studio-fader studio-fader-emerald"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-[42px] px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
        >
          <BookmarkPlus className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Effect Preset'}</span>
        </button>
      </form>
    </div>
  );
};

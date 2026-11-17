import React, { useRef, useState } from 'react';
import { Download, Mic, Play, Save, ShieldCheck, Square, Volume2 } from 'lucide-react';
import { apiFetch, getAudioStreamUrl } from '../lib/api';
import { audioBufferToWavBlob, renderProcessedBuffer } from '../audio/wavEncoder';
import { BootstrapPayload, UserProfile } from '../types/studio';

interface VoiceStudioPageProps {
  data: BootstrapPayload;
  user: UserProfile | null;
  onRequireAuth: () => void;
  onSaved: () => void;
}

const AI_VOICE_OPTIONS: Array<{ id: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'; label: string; desc: string }> = [
  { id: 'Charon', label: 'Charon (Deep Club Host)', desc: 'Rich baritone ideal for DJ intros & drops' },
  { id: 'Kore', label: 'Kore (Crisp Studio Female)', desc: 'Clear articulate announcer & presenter' },
  { id: 'Puck', label: 'Puck (Energetic Hype)', desc: 'Bright upbeat MC & radio energy' },
  { id: 'Fenrir', label: 'Fenrir (Warm Narrator)', desc: 'Commanding cinematic trailer tone' },
  { id: 'Zephyr', label: 'Zephyr (Smooth Melodic)', desc: 'Soft warm lounge & worship host' },
];

export const VoiceStudioPage: React.FC<VoiceStudioPageProps> = ({ data, user, onRequireAuth, onSaved }) => {
  const [tab, setTab] = useState<'munix' | 'ai'>('munix');

  // DJ MUNIX Voice Recorder & FX State
  const [recTitle, setRecTitle] = useState('DJ MUNIX Live Intro Drop');
  const [recLanguage, setRecLanguage] = useState('English');
  const [recScript, setRecScript] = useState('You are now locked into MIX DJ – MUNIX AI. Turn the volume up!');
  const [recording, setRecording] = useState(false);
  const [rawBuffer, setRawBuffer] = useState<AudioBuffer | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [fxPitch, setFxPitch] = useState(0); // semitones -6..+6
  const [fxSpeed, setFxSpeed] = useState(1.0);
  const [fxType, setFxType] = useState<'none' | 'echo' | 'reverb' | 'bass_boost'>('reverb');
  const [fxGain, setFxGain] = useState(1.1);
  const [authorizedAttest, setAuthorizedAttest] = useState(false);
  const [publishOfficial, setPublishOfficial] = useState(false);
  const [processingFx, setProcessingFx] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);

  // AI Voices (Gemini TTS) State
  const [aiTitle, setAiTitle] = useState('MUNIX Studio Radio Tag');
  const [aiText, setAiText] = useState('Welcome to MIX DJ – MUNIX AI. Live from Kigali to the world!');
  const [aiVoiceName, setAiVoiceName] = useState<'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'>('Charon');
  const [aiLanguage, setAiLanguage] = useState('English');
  const [aiStyle, setAiStyle] = useState('Energetic radio DJ announcer');
  const [aiSpeed, setAiSpeed] = useState(1.0);
  const [aiSave, setAiSave] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAudioUrl, setAiAudioUrl] = useState<string | null>(null);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const applyFxToBuffer = async (buf: AudioBuffer) => {
    setProcessingFx(true);
    try {
      const rendered = await renderProcessedBuffer(buf, {
        gain: fxGain,
        fadeInSec: 0.02,
        fadeOutSec: 0.08,
        speed: fxSpeed,
        pitchSemitones: fxPitch,
        effectType: fxType === 'none' ? undefined : fxType,
      });
      const wavBlob = audioBufferToWavBlob(rendered);
      if (processedUrl) URL.revokeObjectURL(processedUrl);
      setProcessedBlob(wavBlob);
      setProcessedUrl(URL.createObjectURL(wavBlob));
    } finally {
      setProcessingFx(false);
    }
  };

  const toggleMicRecord = async () => {
    setErrorMsg(null);
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const arrayBuf = await blob.arrayBuffer();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        await ctx.close();
        setRawBuffer(decoded);
        await applyFxToBuffer(decoded);
        setStatusMsg('Microphone recording captured. Adjust Voice EQ/Echo/Reverb/Pitch and click Apply Effects.');
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setStatusMsg('Recording microphone audio...');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Microphone permission is required to record voice.');
    }
  };

  const handleSaveRecording = async () => {
    if (!processedBlob) return;
    if (!user) {
      onRequireAuth();
      return;
    }
    if (publishOfficial && (!authorizedAttest || user.role !== 'admin')) {
      setErrorMsg('Only the verified DJ MUNIX administrator with explicit owner authorization may publish official DJ MUNIX voice recordings.');
      return;
    }

    setSavingVoice(true);
    setErrorMsg(null);
    try {
      const form = new FormData();
      form.append('audio', processedBlob, `${recTitle.replace(/\s+/g, '_')}.wav`);
      form.append('title', recTitle);
      form.append('language', recLanguage);
      form.append('scriptText', recScript);
      form.append('voiceTone', `${fxType} · Pitch ${fxPitch >= 0 ? `+${fxPitch}` : fxPitch}`);
      form.append('category', publishOfficial ? 'dj_munix_authorized' : 'user_recording');
      form.append('authorizedByOwner', String(publishOfficial && authorizedAttest));
      form.append('isPublic', String(publishOfficial && authorizedAttest));
      form.append('fxSettings', JSON.stringify({ fxPitch, fxSpeed, fxType, fxGain }));

      await apiFetch('/api/voice/recording', { method: 'POST', body: form });
      setStatusMsg('Voice recording saved to Voice Studio library.');
      onSaved();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save voice recording.');
    } finally {
      setSavingVoice(false);
    }
  };

  const handleGenerateAiVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    setAiLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const res = await apiFetch<{ audioDataUrl: string }>('/api/voice/tts', {
        method: 'POST',
        body: JSON.stringify({
          title: aiTitle,
          text: aiText,
          voiceName: aiVoiceName,
          style: aiStyle,
          language: aiLanguage,
          saveToLibrary: aiSave,
        }),
      });
      setAiAudioUrl(res.audioDataUrl);
      setStatusMsg(aiSave ? 'AI Voice generated and saved to your library.' : 'AI Voice generated for preview.');
      if (aiSave) onSaved();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI Voice generation failed.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Voice Studio</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            DJ MUNIX Authorized Voice Recorder & FX · Real Gemini AI Voices (TTS)
          </p>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-[#0e1311] border border-white/10 self-start">
          <button
            type="button"
            onClick={() => setTab('munix')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-medium cursor-pointer ${
              tab === 'munix' ? 'bg-amber-500 text-black font-semibold' : 'text-neutral-300 hover:text-white'
            }`}
          >
            DJ MUNIX Voice
          </button>
          <button
            type="button"
            onClick={() => setTab('ai')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-medium cursor-pointer ${
              tab === 'ai' ? 'bg-emerald-500 text-black font-semibold' : 'text-neutral-300 hover:text-white'
            }`}
          >
            AI Voices (TTS)
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">{errorMsg}</div>
      )}
      {statusMsg && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
          {statusMsg}
        </div>
      )}

      {tab === 'munix' ? (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs text-amber-200 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Official DJ MUNIX voice drops are restricted strictly to authorized recordings approved by DJ MUNIX. Never clone or imitate another person&apos;s voice without permission.
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Recording Title</label>
                <input
                  type="text"
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Language</label>
                <select
                  value={recLanguage}
                  onChange={(e) => setRecLanguage(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-sm text-white"
                >
                  {data.settings.aiConfig.supportedLanguages.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">DJ Intro / Announcement Script</label>
              <textarea
                rows={2}
                value={recScript}
                onChange={(e) => setRecScript(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRecScript('Ladies and gentlemen, you are now in the mix with DJ MUNIX!')}
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-neutral-300 hover:text-white cursor-pointer"
              >
                Intro Template
              </button>
              <button
                type="button"
                onClick={() => setRecScript('Exclusive world premiere on MIX DJ – MUNIX AI. Turn it up!')}
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-neutral-300 hover:text-white cursor-pointer"
              >
                Announcement Template
              </button>
            </div>

            {/* Mic Recording Controls */}
            <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={toggleMicRecord}
                className={`min-h-[44px] px-5 rounded-lg font-semibold text-sm flex items-center gap-2 cursor-pointer ${
                  recording ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                }`}
              >
                {recording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
                <span>{recording ? 'Stop Recording' : 'Record Voice'}</span>
              </button>

              {rawBuffer && (
                <button
                  type="button"
                  disabled={processingFx}
                  onClick={() => applyFxToBuffer(rawBuffer)}
                  className="min-h-[44px] px-4 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-xs font-medium text-amber-200 cursor-pointer"
                >
                  {processingFx ? 'Rendering FX...' : 'Apply Voice FX'}
                </button>
              )}
            </div>

            {/* Voice FX Rack */}
            <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-white/10">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-neutral-400">Pitch Adjustment</span>
                  <span className="font-mono text-white">{fxPitch >= 0 ? `+${fxPitch}` : fxPitch} st</span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={1}
                  value={fxPitch}
                  onChange={(e) => setFxPitch(Number(e.target.value))}
                  className="w-full studio-fader"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-neutral-400">Voice Speed</span>
                  <span className="font-mono text-white">{fxSpeed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.35}
                  step={0.05}
                  value={fxSpeed}
                  onChange={(e) => setFxSpeed(Number(e.target.value))}
                  className="w-full studio-fader"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Voice Effect (Echo / Reverb / EQ)</label>
                <select
                  value={fxType}
                  onChange={(e) => setFxType(e.target.value as 'none' | 'echo' | 'reverb' | 'bass_boost')}
                  className="w-full min-h-[40px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-xs text-white"
                >
                  <option value="none">Clean Studio (Dry)</option>
                  <option value="reverb">Hall Reverb</option>
                  <option value="echo">Club Tape Echo</option>
                  <option value="bass_boost">Broadcast Bass Boost EQ</option>
                </select>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-neutral-400">Output Gain</span>
                  <span className="font-mono text-white">{Math.round(fxGain * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={1.8}
                  step={0.05}
                  value={fxGain}
                  onChange={(e) => setFxGain(Number(e.target.value))}
                  className="w-full studio-fader studio-fader-emerald"
                />
              </div>
            </div>

            {processedUrl && (
              <div className="pt-3 border-t border-white/10 space-y-3">
                <audio controls src={processedUrl} className="w-full" />

                {user?.role === 'admin' && (
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2 text-xs">
                    <label className="flex items-center gap-2 text-amber-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={publishOfficial}
                        onChange={(e) => setPublishOfficial(e.target.checked)}
                        className="w-4 h-4 accent-amber-500"
                      />
                      <span>Save as Official DJ MUNIX Authorized Voice Drop</span>
                    </label>
                    {publishOfficial && (
                      <label className="flex items-center gap-2 text-neutral-300 cursor-pointer pl-6">
                        <input
                          type="checkbox"
                          checked={authorizedAttest}
                          onChange={(e) => setAuthorizedAttest(e.target.checked)}
                          className="w-4 h-4 accent-emerald-500"
                        />
                        <span>I confirm this is DJ MUNIX&apos;s own authorized voice recording</span>
                      </label>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={savingVoice}
                    onClick={handleSaveRecording}
                    className="min-h-[42px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingVoice ? 'Saving...' : 'Save Voice Recording'}</span>
                  </button>
                  <a
                    href={processedUrl}
                    download={`${recTitle.replace(/\s+/g, '_')}.wav`}
                    className="min-h-[42px] px-4 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export WAV</span>
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Saved Voice Profiles */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Authorized & Saved Voice Recordings</h3>
            {data.voiceProfiles.length === 0 ? (
              <p className="text-xs text-neutral-500 py-8 text-center">
                No saved voice recordings yet. Record a DJ drop or generate an AI voice.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {data.voiceProfiles.map((vp) => (
                  <div key={vp.id} className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white truncate">{vp.name}</span>
                      <span className="text-[11px] text-amber-400 shrink-0">
                        {vp.category === 'dj_munix_authorized'
                          ? 'DJ MUNIX'
                          : vp.category === 'ai_voice'
                            ? 'AI Voice'
                            : 'Personal'}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      {vp.language} · {vp.voiceTone}
                    </p>
                    {vp.audioFileId && (
                      <audio controls src={getAudioStreamUrl(vp.audioFileId)} className="w-full h-8" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6">
          <form onSubmit={handleGenerateAiVoice} className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Voice Clip Title</label>
                <input
                  type="text"
                  required
                  value={aiTitle}
                  onChange={(e) => setAiTitle(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Language</label>
                <select
                  value={aiLanguage}
                  onChange={(e) => setAiLanguage(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-sm text-white"
                >
                  {data.settings.aiConfig.supportedLanguages.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Select AI Voice Persona</label>
              <div className="grid sm:grid-cols-2 gap-2">
                {AI_VOICE_OPTIONS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setAiVoiceName(v.id)}
                    className={`text-left rounded-xl border p-3 transition-colors cursor-pointer ${
                      aiVoiceName === v.id
                        ? 'border-emerald-500 bg-emerald-500/15'
                        : 'border-white/10 bg-black/30 hover:border-white/25'
                    }`}
                  >
                    <p className="text-xs font-semibold text-white">{v.label}</p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{v.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Voice Tone / Style</label>
                <input
                  type="text"
                  value={aiStyle}
                  onChange={(e) => setAiStyle(e.target.value)}
                  placeholder="Energetic radio DJ announcer"
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-neutral-300 font-medium">Playback Speed</span>
                  <span className="font-mono text-white">{aiSpeed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.35}
                  step={0.05}
                  value={aiSpeed}
                  onChange={(e) => setAiSpeed(Number(e.target.value))}
                  className="w-full mt-2 studio-fader"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Text to Speak (TTS)</label>
              <textarea
                rows={3}
                required
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiSave}
                  onChange={(e) => setAiSave(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <span>Save generated voice to My Library</span>
              </label>
              <button
                type="submit"
                disabled={aiLoading}
                className="min-h-[44px] px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
                <span>{aiLoading ? 'Synthesizing Speech...' : 'Generate AI Voice'}</span>
              </button>
            </div>
          </form>

          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">AI Voice Preview & Export</h3>
            {aiAudioUrl ? (
              <div className="space-y-4">
                <audio
                  controls
                  src={aiAudioUrl}
                  onLoadedMetadata={(e) => {
                    e.currentTarget.playbackRate = aiSpeed;
                  }}
                  className="w-full"
                />
                <a
                  href={aiAudioUrl}
                  download={`${aiTitle.replace(/\s+/g, '_')}.wav`}
                  className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold"
                >
                  <Download className="w-4 h-4" />
                  <span>Export WAV Audio</span>
                </a>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-neutral-500 flex flex-col items-center gap-2">
                <Play className="w-6 h-6 text-neutral-600" />
                <span>Generate speech with Gemini TTS to preview and export WAV audio here.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

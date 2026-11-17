import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Music, Sparkles } from 'lucide-react';
import { apiFetch, getAudioStreamUrl } from '../lib/api';
import { AudioFileItem, BootstrapPayload, GeneratedMusicItem, UserProfile } from '../types/studio';

interface MunixAIPageProps {
  data: BootstrapPayload;
  user: UserProfile | null;
  initialPrompt?: string;
  onRequireAuth: () => void;
  onGenerated: () => void;
  onLoadToDeck: (track: AudioFileItem, deck: 'A' | 'B') => void;
}

const MOODS = ['Uplifting', 'Energetic', 'Worshipful', 'Chill', 'Afro-Club', 'Emotional', 'Celebratory'];

export const MunixAIPage: React.FC<MunixAIPageProps> = ({
  data,
  user,
  initialPrompt,
  onRequireAuth,
  onGenerated,
  onLoadToDeck,
}) => {
  const [title, setTitle] = useState('Uplifting Kigali Choir');
  const [prompt, setPrompt] = useState(
    initialPrompt || 'Create an uplifting Kinyarwanda gospel song with piano, African drums and a powerful choir.'
  );
  const [genre, setGenre] = useState('Gospel');
  const [mood, setMood] = useState('Uplifting');
  const [language, setLanguage] = useState('Kinyarwanda');
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>('female');
  const [instrumentalOnly, setInstrumentalOnly] = useState(false);
  const [durationSec, setDurationSec] = useState(30);
  const [lyrics, setLyrics] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<{
    message: string;
    status: string;
    setupInstructions?: string[];
    generatedMusic?: GeneratedMusicItem;
    audioFile?: AudioFileItem | null;
  } | null>(null);

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        result: { status: string; message: string; setupInstructions?: string[] };
        generatedMusic: GeneratedMusicItem;
        audioFile: AudioFileItem | null;
      }>('/api/music/generate', {
        method: 'POST',
        body: JSON.stringify({
          title,
          prompt,
          genre,
          mood,
          language,
          voiceGender,
          instrumentalOnly,
          durationSec,
          lyrics,
          isPublic,
        }),
      });
      setLatestResult({
        message: res.result.message,
        status: res.result.status,
        setupInstructions: res.result.setupInstructions,
        generatedMusic: res.generatedMusic,
        audioFile: res.audioFile,
      });
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Music generation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">MUNIX AI — AI Music Creation Studio</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Pluggable music provider architecture ({data.providers.music.activeProvider}) + structured AI arrangement engine
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setPrompt('Create an uplifting Kinyarwanda gospel song with piano, African drums and a powerful choir.')
          }
          className="min-h-[40px] px-3.5 rounded-lg border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium text-amber-200 cursor-pointer self-start"
        >
          Use Example Prompt
        </button>
      </div>

      {/* Provider Integration Status */}
      <div className="rounded-xl border border-white/10 bg-[#0e1311] p-4 grid sm:grid-cols-3 gap-3">
        {data.providers.music.providers.map((p) => (
          <div key={p.id} className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white truncate">{p.name}</span>
              <span className={`text-[11px] font-mono ${p.configured ? 'text-emerald-400' : 'text-amber-400'}`}>
                {p.configured ? 'Ready' : 'Key Needed'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">{p.note}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Creation Form */}
        <form onSubmit={handleGenerate} className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Song Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Genre</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                {data.settings.categories.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">Describe Your Song</label>
            <textarea
              rows={3}
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Create an uplifting Kinyarwanda gospel song with piano, African drums and a powerful choir."
              className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Mood</label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-sm text-white"
              >
                {MOODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-sm text-white"
              >
                {data.settings.aiConfig.supportedLanguages.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Duration (<span className="font-mono">{durationSec}s</span>)
              </label>
              <input
                type="range"
                min={15}
                max={180}
                step={15}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="w-full mt-3 studio-fader"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Track Type</label>
              <div className="flex gap-1.5 p-1 rounded-lg bg-black/40 border border-white/10">
                <button
                  type="button"
                  onClick={() => setInstrumentalOnly(false)}
                  className={`flex-1 min-h-[38px] rounded-md text-xs font-medium cursor-pointer ${
                    !instrumentalOnly ? 'bg-emerald-600 text-white' : 'text-neutral-400'
                  }`}
                >
                  Vocals + Beat
                </button>
                <button
                  type="button"
                  onClick={() => setInstrumentalOnly(true)}
                  className={`flex-1 min-h-[38px] rounded-md text-xs font-medium cursor-pointer ${
                    instrumentalOnly ? 'bg-emerald-600 text-white' : 'text-neutral-400'
                  }`}
                >
                  Instrumental Only
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">AI Singing Voice</label>
              <div className="flex gap-1.5 p-1 rounded-lg bg-black/40 border border-white/10">
                <button
                  type="button"
                  disabled={instrumentalOnly}
                  onClick={() => setVoiceGender('female')}
                  className={`flex-1 min-h-[38px] rounded-md text-xs font-medium cursor-pointer disabled:opacity-40 ${
                    voiceGender === 'female' ? 'bg-amber-500 text-black font-semibold' : 'text-neutral-400'
                  }`}
                >
                  Female Vocal
                </button>
                <button
                  type="button"
                  disabled={instrumentalOnly}
                  onClick={() => setVoiceGender('male')}
                  className={`flex-1 min-h-[38px] rounded-md text-xs font-medium cursor-pointer disabled:opacity-40 ${
                    voiceGender === 'male' ? 'bg-amber-500 text-black font-semibold' : 'text-neutral-400'
                  }`}
                >
                  Male Vocal
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">Original Lyrics (Optional)</label>
            <textarea
              rows={3}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Write your own verses or chorus, or leave blank for MUNIX AI arrangement suggestions..."
              className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 accent-emerald-500"
              />
              <span>Publish to Community when generated</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] px-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{loading ? 'Composing with MUNIX AI...' : 'Generate Music'}</span>
            </button>
          </div>
        </form>

        {/* Output & History Panel */}
        <div className="lg:col-span-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {latestResult && (
            <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
              <div className="flex items-start gap-2.5">
                {latestResult.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {latestResult.status === 'completed' ? 'Audio Synthesized' : 'Production Blueprint Saved'}
                  </h3>
                  <p className="text-xs text-neutral-300 mt-1 leading-relaxed">{latestResult.message}</p>
                </div>
              </div>

              {latestResult.setupInstructions && latestResult.setupInstructions.length > 0 && (
                <ul className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1 text-xs text-amber-200">
                  {latestResult.setupInstructions.map((s, idx) => (
                    <li key={idx}>• {s}</li>
                  ))}
                </ul>
              )}

              {latestResult.audioFile && (
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <audio controls src={getAudioStreamUrl(latestResult.audioFile.id)} className="w-full" />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onLoadToDeck(latestResult.audioFile!, 'A')}
                      className="min-h-[38px] px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 cursor-pointer"
                    >
                      Send to Deck A
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoadToDeck(latestResult.audioFile!, 'B')}
                      className="min-h-[38px] px-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs text-amber-300 cursor-pointer"
                    >
                      Send to Deck B
                    </button>
                    <a
                      href={getAudioStreamUrl(latestResult.audioFile.id)}
                      download={`${latestResult.audioFile.title}.mp3`}
                      className="min-h-[38px] px-3 rounded-lg border border-white/15 bg-white/5 text-xs text-white flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              )}

              {latestResult.generatedMusic?.arrangementJson?.bpm && (
                <div className="space-y-3 pt-3 border-t border-white/10 text-xs">
                  <div className="flex flex-wrap gap-3 font-mono text-neutral-300">
                    <span>BPM: {latestResult.generatedMusic.arrangementJson.bpm}</span>
                    <span>·</span>
                    <span>Key: {latestResult.generatedMusic.arrangementJson.musicalKey}</span>
                  </div>
                  {latestResult.generatedMusic.arrangementJson.instruments && (
                    <p className="text-neutral-300">
                      <strong className="text-white">Instrumentation:</strong>{' '}
                      {latestResult.generatedMusic.arrangementJson.instruments.join(', ')}
                    </p>
                  )}
                  {latestResult.generatedMusic.lyrics && (
                    <div className="rounded-lg bg-black/40 border border-white/10 p-3 whitespace-pre-wrap text-neutral-200 max-h-48 overflow-y-auto">
                      {latestResult.generatedMusic.lyrics}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Your MUNIX AI Projects</h3>
              <span className="text-xs text-neutral-400 tabular-nums">{data.generatedMusic.length}</span>
            </div>
            {data.generatedMusic.length === 0 ? (
              <div className="py-6 text-center text-xs text-neutral-500 flex flex-col items-center gap-2">
                <Music className="w-6 h-6 text-neutral-600" />
                <span>Generated tracks and arrangement blueprints appear here.</span>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {data.generatedMusic.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white truncate">{item.title}</span>
                      <span className="text-[11px] text-emerald-400 shrink-0">{item.genre}</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      {item.language} · {item.mood} · {item.status === 'completed' ? 'Audio Ready' : 'Blueprint Saved'}
                    </p>
                    {item.audioFileId && (
                      <audio controls src={getAudioStreamUrl(item.audioFileId)} className="w-full h-8 mt-1" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

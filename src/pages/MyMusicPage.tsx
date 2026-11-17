import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  Edit3,
  Layers,
  Mic,
  Pause,
  Play,
  Plus,
  Save,
  Scissors,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch, getAudioStreamUrl } from '../lib/api';
import {
  audioBufferToWavBlob,
  cutAudioBuffer,
  joinAudioBuffers,
  renderProcessedBuffer,
  splitAudioBuffer,
  trimAudioBuffer,
} from '../audio/wavEncoder';
import { AudioFileItem, BootstrapPayload, MusicProjectItem, UserProfile } from '../types/studio';

interface MyMusicPageProps {
  data: BootstrapPayload;
  user: UserProfile | null;
  onRequireAuth: () => void;
  onRefresh: () => void;
  onLoadToDeck: (track: AudioFileItem, deck: 'A' | 'B') => void;
}

export const MyMusicPage: React.FC<MyMusicPageProps> = ({
  data,
  user,
  onRequireAuth,
  onRefresh,
  onLoadToDeck,
}) => {
  const [activeTab, setActiveTab] = useState<'library' | 'editor' | 'stems'>('library');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'title' | 'bpm'>('newest');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Audio Editor State
  const [editorName, setEditorName] = useState('Edited Studio Track');
  const [editorBuffer, setEditorBuffer] = useState<AudioBuffer | null>(null);
  const [splitSecondBuffer, setSplitSecondBuffer] = useState<AudioBuffer | null>(null);
  const [editorPeaks, setEditorPeaks] = useState<number[]>([]);
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [gain, setGain] = useState(1.0);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [pitchSemi, setPitchSemi] = useState(0);
  const [editorEffect, setEditorEffect] = useState('none');
  const [editorUrl, setEditorUrl] = useState<string | null>(null);
  const [editorBlob, setEditorBlob] = useState<Blob | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [micRec, setMicRec] = useState<MediaRecorder | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);

  // Stem Separator State
  const [stemFile, setStemFile] = useState<File | null>(null);
  const [stemLoading, setStemLoading] = useState(false);
  const [stemError, setStemError] = useState<string | null>(null);
  const [stemJob, setStemJob] = useState<{
    id: string;
    status: string;
    progress: number;
    stems?: Record<string, string | undefined>;
    error?: string;
  } | null>(null);
  const [stemVolumes, setStemVolumes] = useState<Record<string, number>>({
    vocals: 1,
    drums: 1,
    bass: 1,
    other: 1,
    instrumental: 1,
  });
  const [stemMuted, setStemMuted] = useState<Record<string, boolean>>({});

  const [msg, setMsg] = useState<string | null>(null);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data.projects.filter(
      (p) => !q || p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'bpm') return b.bpm - a.bpm;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [data.projects, search, sortBy]);

  const audioById = useMemo(() => {
    const m = new Map<string, AudioFileItem>();
    [...data.myAudioFiles, ...data.featuredTracks].forEach((a) => m.set(a.id, a));
    return m;
  }, [data.myAudioFiles, data.featuredTracks]);

  const loadBufferIntoEditor = (buf: AudioBuffer, name?: string) => {
    setEditorBuffer(buf);
    if (name) setEditorName(name);
    setSelStart(0);
    setSelEnd(Number(buf.duration.toFixed(2)));
    setPlayhead(Number((buf.duration / 2).toFixed(2)));

    const ch = buf.getChannelData(0);
    const bars = 96;
    const step = Math.max(1, Math.floor(ch.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      for (let j = 0; j < step && i * step + j < ch.length; j += Math.max(1, Math.floor(step / 12))) {
        const v = Math.abs(ch[i * step + j]);
        if (v > max) max = v;
      }
      peaks.push(Math.min(1, max));
    }
    setEditorPeaks(peaks);
    const wav = audioBufferToWavBlob(buf);
    if (editorUrl) URL.revokeObjectURL(editorUrl);
    setEditorBlob(wav);
    setEditorUrl(URL.createObjectURL(wav));
  };

  const handleImportEditorFile = async (file: File | undefined) => {
    if (!file) return;
    setEditorBusy(true);
    try {
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
      await ctx.close();
      loadBufferIntoEditor(decoded, file.name.replace(/\.[^/.]+$/, ''));
      setMsg(`Imported "${file.name}" (${decoded.duration.toFixed(1)}s) into Audio Editor.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Unable to decode audio file.');
    } finally {
      setEditorBusy(false);
    }
  };

  const handleJoinSecondFile = async (file: File | undefined) => {
    if (!file || !editorBuffer) return;
    setEditorBusy(true);
    try {
      const ctx = new AudioContext();
      const second = await ctx.decodeAudioData(await file.arrayBuffer());
      const joined = joinAudioBuffers(ctx, editorBuffer, second);
      await ctx.close();
      loadBufferIntoEditor(joined, `${editorName} + Joined`);
      setMsg(`Joined "${file.name}" onto current track.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not join audio file.');
    } finally {
      setEditorBusy(false);
    }
  };

  const handleEditorOp = async (op: 'trim' | 'cut' | 'split' | 'render') => {
    if (!editorBuffer) return;
    setEditorBusy(true);
    try {
      const ctx = new AudioContext();
      if (op === 'trim') {
        const next = trimAudioBuffer(ctx, editorBuffer, selStart, selEnd);
        loadBufferIntoEditor(next);
        setMsg(`Trimmed audio to ${selStart.toFixed(1)}s – ${selEnd.toFixed(1)}s.`);
      } else if (op === 'cut') {
        const next = cutAudioBuffer(ctx, editorBuffer, selStart, selEnd);
        loadBufferIntoEditor(next);
        setMsg(`Removed section ${selStart.toFixed(1)}s – ${selEnd.toFixed(1)}s.`);
      } else if (op === 'split') {
        const [partA, partB] = splitAudioBuffer(ctx, editorBuffer, playhead);
        setSplitSecondBuffer(partB);
        loadBufferIntoEditor(partA);
        setMsg(`Split at ${playhead.toFixed(1)}s. Part 1 loaded; Part 2 ready to download or re-join.`);
      } else if (op === 'render') {
        const processed = await renderProcessedBuffer(editorBuffer, {
          gain,
          fadeInSec: fadeIn,
          fadeOutSec: fadeOut,
          speed,
          pitchSemitones: pitchSemi,
          effectType: editorEffect === 'none' ? undefined : editorEffect,
        });
        loadBufferIntoEditor(processed);
        setMsg('Applied volume, fade, speed, pitch, and effect processing.');
      }
      await ctx.close();
    } finally {
      setEditorBusy(false);
    }
  };

  const handleEditorMic = async () => {
    if (micActive && micRec) {
      micRec.stop();
      setMicActive(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        await ctx.close();
        loadBufferIntoEditor(decoded, 'Mic Recording');
        setMsg('Microphone audio loaded into editor.');
      };
      setMicRec(rec);
      rec.start();
      setMicActive(true);
    } catch {
      setMsg('Microphone access denied or unavailable.');
    }
  };

  const handleSaveEditedProject = async () => {
    if (!editorBlob) return;
    if (!user) {
      onRequireAuth();
      return;
    }
    setEditorBusy(true);
    try {
      const form = new FormData();
      form.append('audio', editorBlob, `${editorName.replace(/\s+/g, '_')}.wav`);
      form.append('title', editorName);
      form.append('artist', user.displayName);
      form.append('category', 'Audio Edit');
      form.append('durationSec', String(Math.round(editorBuffer?.duration || 0)));
      form.append('sourceType', 'edited');
      await apiFetch('/api/audio/upload', { method: 'POST', body: form });
      setMsg(`Saved edited project "${editorName}" to My Music.`);
      onRefresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setEditorBusy(false);
    }
  };

  const handleUploadUserAudio = async (file: File | undefined) => {
    if (!file) return;
    if (!user) {
      onRequireAuth();
      return;
    }
    const form = new FormData();
    form.append('audio', file);
    form.append('title', file.name.replace(/\.[^/.]+$/, ''));
    form.append('category', 'Uploads');
    form.append('sourceType', 'upload');
    await apiFetch('/api/audio/upload', { method: 'POST', body: form });
    setMsg(`Uploaded "${file.name}" privately to your library.`);
    onRefresh();
  };

  const handleRenameProject = async (p: MusicProjectItem) => {
    if (!editTitle.trim()) return;
    await apiFetch(`/api/projects/${p.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: editTitle.trim() }),
    });
    setEditingId(null);
    onRefresh();
  };

  const handleDeleteProject = async (id: string) => {
    await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleStartStemSeparation = async () => {
    if (!stemFile) return;
    if (!user) {
      onRequireAuth();
      return;
    }
    setStemLoading(true);
    setStemError(null);
    setStemJob(null);
    try {
      const form = new FormData();
      form.append('audio', stemFile);
      const res = await apiFetch<{ job: { id: string; status: string; progress: number; stems?: Record<string, string> } }>(
        '/api/stems/separate',
        { method: 'POST', body: form }
      );
      setStemJob(res.job);

      if (res.job.status === 'processing') {
        const poll = async () => {
          for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 2500));
            const statusRes = await apiFetch<{
              job: { id: string; status: string; progress: number; stems?: Record<string, string>; error?: string };
            }>(`/api/stems/jobs/${res.job.id}`);
            setStemJob(statusRes.job);
            if (statusRes.job.status === 'succeeded' || statusRes.job.status === 'failed') break;
          }
        };
        await poll();
      }
    } catch (err) {
      setStemError(err instanceof Error ? err.message : 'Stem separation unavailable.');
    } finally {
      setStemLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">My Music & Audio Production</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Private Library · Audio Editing Studio · Vocal & Instrument Stem Separator
          </p>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-[#0e1311] border border-white/10 self-start overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              activeTab === 'library' ? 'bg-emerald-500 text-black font-semibold' : 'text-neutral-300 hover:text-white'
            }`}
          >
            My Library ({data.projects.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              activeTab === 'editor' ? 'bg-emerald-500 text-black font-semibold' : 'text-neutral-300 hover:text-white'
            }`}
          >
            Audio Editor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stems')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              activeTab === 'stems' ? 'bg-amber-500 text-black font-semibold' : 'text-neutral-300 hover:text-white'
            }`}
          >
            STEM SEPARATOR
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
          {msg}
        </div>
      )}

      {/* TAB 1: PERSONAL LIBRARY */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          {!user ? (
            <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-8 text-center space-y-4">
              <p className="text-base font-semibold text-white">Sign in to access your private music projects</p>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                Your uploaded tracks, AI generations, voice drops, and edited mixes stay strictly private until you choose to publish them.
              </p>
              <button
                type="button"
                onClick={onRequireAuth}
                className="min-h-[44px] px-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold cursor-pointer"
              >
                Sign In / Create Account
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-3 justify-between">
                <div className="flex flex-1 gap-2">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search your projects..."
                      className="w-full min-h-[44px] rounded-xl border border-white/10 bg-[#0e1311] pl-9 pr-3 text-sm text-white"
                    />
                  </div>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'newest' | 'title' | 'bpm')}
                    className="min-h-[44px] rounded-xl border border-white/10 bg-[#0e1311] px-3 text-xs text-white"
                  >
                    <option value="newest">Newest First</option>
                    <option value="title">Title A–Z</option>
                    <option value="bpm">BPM High–Low</option>
                  </select>
                </div>

                <label className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Upload Audio</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleUploadUserAudio(e.target.files?.[0])}
                  />
                </label>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-10 text-center space-y-2">
                  <p className="text-sm font-medium text-white">No saved projects yet</p>
                  <p className="text-xs text-neutral-400">
                    Upload audio above, record a live mix in DJ Studio, or save an edit in Audio Editor.
                  </p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {filteredProjects.map((proj) => {
                    const audio = proj.audioFileId ? audioById.get(proj.audioFileId) : undefined;
                    const streamUrl = proj.audioFileId ? getAudioStreamUrl(proj.audioFileId) : null;
                    return (
                      <div key={proj.id} className="rounded-xl border border-white/10 bg-[#0e1311] p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {editingId === proj.id ? (
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  className="flex-1 min-h-[36px] rounded-lg border border-emerald-500 bg-black/50 px-2.5 text-sm text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRenameProject(proj)}
                                  className="px-3 rounded-lg bg-emerald-600 text-xs text-white cursor-pointer"
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <h3 className="text-sm font-semibold text-white truncate">{proj.title}</h3>
                            )}
                            <p className="text-xs text-neutral-400 mt-0.5 tabular-nums">
                              {proj.category} · {proj.bpm} BPM · {proj.isPublic ? 'Public' : 'Private'} ·{' '}
                              {new Date(proj.createdAt).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(proj.id);
                                setEditTitle(proj.title);
                              }}
                              className="min-w-[36px] min-h-[36px] rounded-lg border border-white/10 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer"
                              title="Rename project"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(proj.id)}
                              className="min-w-[36px] min-h-[36px] rounded-lg border border-white/10 text-red-400 hover:bg-red-500/10 flex items-center justify-center cursor-pointer"
                              title="Delete project"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {streamUrl && (
                          <div className="space-y-2">
                            {playingId === proj.id ? (
                              <audio controls autoPlay src={streamUrl} className="w-full h-9" />
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setPlayingId(playingId === proj.id ? null : proj.id)}
                                className="min-h-[36px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white flex items-center gap-1.5 cursor-pointer"
                              >
                                {playingId === proj.id ? (
                                  <Pause className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                                <span>{playingId === proj.id ? 'Hide Player' : 'Play'}</span>
                              </button>
                              {audio && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onLoadToDeck(audio, 'A')}
                                    className="min-h-[36px] px-2.5 rounded-lg border border-emerald-500/30 text-xs text-emerald-300 cursor-pointer"
                                  >
                                    Deck A
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onLoadToDeck(audio, 'B')}
                                    className="min-h-[36px] px-2.5 rounded-lg border border-amber-500/30 text-xs text-amber-300 cursor-pointer"
                                  >
                                    Deck B
                                  </button>
                                </>
                              )}
                              <a
                                href={streamUrl}
                                download={`${proj.title.replace(/\s+/g, '_')}.wav`}
                                className="min-h-[36px] px-2.5 rounded-lg border border-white/10 text-xs text-neutral-200 flex items-center gap-1"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: AUDIO EDITING STUDIO */}
      {activeTab === 'editor' && (
        <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Audio Editing Studio</h2>
              <p className="text-xs text-neutral-400">
                Supports MP3, WAV, M4A, OGG · Trim · Cut · Split · Join · Fade · Speed · Pitch · Effects · WAV Export
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="min-h-[42px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Import Audio</span>
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a"
                  className="hidden"
                  onChange={(e) => handleImportEditorFile(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={handleEditorMic}
                className={`min-h-[42px] px-4 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  micActive
                    ? 'border-red-500 bg-red-600 text-white'
                    : 'border-white/15 bg-white/5 text-white hover:bg-white/10'
                }`}
              >
                {micActive ? <Square className="w-3.5 h-3.5 fill-current" /> : <Mic className="w-3.5 h-3.5 text-amber-400" />}
                <span>{micActive ? 'Stop Mic' : 'Record Mic'}</span>
              </button>
            </div>
          </div>

          {!editorBuffer ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-black/25 p-10 text-center text-xs text-neutral-400">
              Import an audio file from your device or record from your microphone to start editing.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Waveform Display */}
              <div className="rounded-xl border border-white/10 bg-[#070a09] p-3">
                <div className="h-24 flex items-center gap-[2px]">
                  {editorPeaks.map((pk, idx) => {
                    const sec = (idx / editorPeaks.length) * editorBuffer.duration;
                    const inSel = sec >= selStart && sec <= selEnd;
                    return (
                      <div
                        key={idx}
                        style={{ height: `${Math.max(10, pk * 90)}%` }}
                        className={`flex-1 rounded-sm ${inSel ? 'bg-emerald-400' : 'bg-white/20'}`}
                      />
                    );
                  })}
                </div>
                <div className="mt-3 grid sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="flex justify-between text-neutral-400 mb-1">
                      <span>Selection Start</span>
                      <span className="font-mono text-white">{selStart.toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0.1, selEnd - 0.1)}
                      step={0.05}
                      value={selStart}
                      onChange={(e) => setSelStart(Number(e.target.value))}
                      className="w-full studio-fader"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-neutral-400 mb-1">
                      <span>Selection End</span>
                      <span className="font-mono text-white">{selEnd.toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      min={Math.min(editorBuffer.duration, selStart + 0.1)}
                      max={editorBuffer.duration}
                      step={0.05}
                      value={selEnd}
                      onChange={(e) => setSelEnd(Number(e.target.value))}
                      className="w-full studio-fader"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-neutral-400 mb-1">
                      <span>Split Point</span>
                      <span className="font-mono text-amber-300">{playhead.toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={Math.max(0.2, editorBuffer.duration - 0.1)}
                      step={0.05}
                      value={playhead}
                      onChange={(e) => setPlayhead(Number(e.target.value))}
                      className="w-full studio-fader studio-fader-emerald"
                    />
                  </div>
                </div>
              </div>

              {/* Structural Edits */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={editorBusy}
                  onClick={() => handleEditorOp('trim')}
                  className="min-h-[40px] px-3.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Scissors className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Trim to Selection</span>
                </button>
                <button
                  type="button"
                  disabled={editorBusy}
                  onClick={() => handleEditorOp('cut')}
                  className="min-h-[40px] px-3.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-white cursor-pointer"
                >
                  Cut Selected Section
                </button>
                <button
                  type="button"
                  disabled={editorBusy}
                  onClick={() => handleEditorOp('split')}
                  className="min-h-[40px] px-3.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-white cursor-pointer"
                >
                  Split at {playhead.toFixed(1)}s
                </button>
                <label className="min-h-[40px] px-3.5 rounded-lg border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium text-amber-200 flex items-center gap-1.5 cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Join Audio File</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleJoinSecondFile(e.target.files?.[0])}
                  />
                </label>
                {splitSecondBuffer && (
                  <button
                    type="button"
                    onClick={() => {
                      const blob = audioBufferToWavBlob(splitSecondBuffer);
                      const u = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = u;
                      a.download = `${editorName}_part2.wav`;
                      a.click();
                    }}
                    className="min-h-[40px] px-3.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-xs text-emerald-300 cursor-pointer"
                  >
                    Download Split Part 2
                  </button>
                )}
              </div>

              {/* DSP Processing Controls */}
              <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-3 border-t border-white/10 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-neutral-400">Volume</span>
                    <span className="font-mono">{Math.round(gain * 100)}%</span>
                  </div>
                  <input type="range" min={0.2} max={2} step={0.05} value={gain} onChange={(e) => setGain(Number(e.target.value))} className="w-full studio-fader" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-neutral-400">Fade In</span>
                    <span className="font-mono">{fadeIn.toFixed(1)}s</span>
                  </div>
                  <input type="range" min={0} max={5} step={0.2} value={fadeIn} onChange={(e) => setFadeIn(Number(e.target.value))} className="w-full studio-fader" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-neutral-400">Fade Out</span>
                    <span className="font-mono">{fadeOut.toFixed(1)}s</span>
                  </div>
                  <input type="range" min={0} max={5} step={0.2} value={fadeOut} onChange={(e) => setFadeOut(Number(e.target.value))} className="w-full studio-fader" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-neutral-400">Speed</span>
                    <span className="font-mono">{speed.toFixed(2)}x</span>
                  </div>
                  <input type="range" min={0.6} max={1.5} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full studio-fader" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-neutral-400">Pitch</span>
                    <span className="font-mono">{pitchSemi >= 0 ? `+${pitchSemi}` : pitchSemi} st</span>
                  </div>
                  <input type="range" min={-6} max={6} step={1} value={pitchSemi} onChange={(e) => setPitchSemi(Number(e.target.value))} className="w-full studio-fader" />
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Effect</label>
                  <select
                    value={editorEffect}
                    onChange={(e) => setEditorEffect(e.target.value)}
                    className="w-full min-h-[36px] rounded-lg border border-white/10 bg-[#090d0b] px-2 text-xs text-white"
                  >
                    <option value="none">None</option>
                    <option value="echo">Echo</option>
                    <option value="reverb">Reverb</option>
                    <option value="bass_boost">Bass Boost</option>
                    <option value="filter">Filter</option>
                    <option value="distortion">Distortion</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  disabled={editorBusy}
                  onClick={() => handleEditorOp('render')}
                  className="min-h-[42px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{editorBusy ? 'Processing...' : 'Render Fades, Speed, Pitch & FX'}</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={editorName}
                    onChange={(e) => setEditorName(e.target.value)}
                    className="min-h-[40px] rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
                  />
                  <button
                    type="button"
                    disabled={editorBusy}
                    onClick={handleSaveEditedProject}
                    className="min-h-[40px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Project</span>
                  </button>
                  {editorUrl && (
                    <a
                      href={editorUrl}
                      download={`${editorName.replace(/\s+/g, '_')}.wav`}
                      className="min-h-[40px] px-4 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export WAV</span>
                    </a>
                  )}
                </div>
              </div>

              {editorUrl && <audio controls src={editorUrl} className="w-full" />}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: STEM SEPARATOR */}
      {activeTab === 'stems' && (
        <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">STEM SEPARATOR — Vocal & Instrument Isolation</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Separates tracks into Vocals, Instrumental, Drums, Bass, and Other Instruments via Demucs/backend API.
              </p>
            </div>
            <span className={`text-xs font-mono ${data.providers.stems.configured ? 'text-emerald-400' : 'text-amber-400'}`}>
              {data.providers.stems.provider}
            </span>
          </div>

          {!data.providers.stems.configured && (
            <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-white">Real Separation Backend Required</p>
                <p>{data.providers.stems.message}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <label className="flex-1 min-h-[44px] rounded-xl border border-white/15 bg-black/35 px-4 flex items-center justify-between text-xs text-neutral-300 cursor-pointer">
              <span className="truncate">{stemFile ? stemFile.name : 'Choose an audio file (MP3, WAV, M4A)...'}</span>
              <Upload className="w-4 h-4 text-emerald-400 shrink-0 ml-2" />
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setStemFile(e.target.files?.[0] || null)}
              />
            </label>
            <button
              type="button"
              disabled={!stemFile || stemLoading}
              onClick={handleStartStemSeparation}
              className="min-h-[44px] px-6 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>{stemLoading ? 'Separating Stems...' : 'Separate Stems'}</span>
            </button>
          </div>

          {stemError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              {stemError}
            </div>
          )}

          {stemJob && (
            <div className="space-y-4 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-300">Separation Progress ({stemJob.status})</span>
                <span className="font-mono text-emerald-400">{stemJob.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-black/50 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${stemJob.progress}%` }} />
              </div>

              {stemJob.error && <p className="text-xs text-red-300">{stemJob.error}</p>}

              {stemJob.stems && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {Object.entries(stemJob.stems)
                    .filter(([, url]) => Boolean(url))
                    .map(([stemName, url]) => (
                      <div key={stemName} className="rounded-xl border border-white/10 bg-black/35 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white capitalize">{stemName}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setStemMuted((prev) => ({ ...prev, [stemName]: !prev[stemName] }))}
                              className={`px-2.5 py-1 rounded text-[11px] border cursor-pointer ${
                                stemMuted[stemName]
                                  ? 'border-red-500/40 bg-red-500/15 text-red-300'
                                  : 'border-white/10 text-neutral-300'
                              }`}
                            >
                              {stemMuted[stemName] ? 'Muted' : 'Mute'}
                            </button>
                            <a
                              href={url}
                              download={`${stemName}_stem.mp3`}
                              className="px-2.5 py-1 rounded border border-emerald-500/35 text-[11px] text-emerald-300"
                            >
                              Export
                            </a>
                          </div>
                        </div>
                        <audio
                          controls
                          src={url}
                          muted={Boolean(stemMuted[stemName])}
                          onVolumeChange={(e) => {
                            const v = stemVolumes[stemName] ?? 1;
                            if (Math.abs(e.currentTarget.volume - v) > 0.05) {
                              setStemVolumes((prev) => ({ ...prev, [stemName]: e.currentTarget.volume }));
                            }
                          }}
                          className="w-full h-9"
                        />
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

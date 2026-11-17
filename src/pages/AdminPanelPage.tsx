import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Check,
  Music,
  Palette,
  Plus,
  Shield,
  Sliders,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { AdminSettings, BootstrapPayload, UserProfile } from '../types/studio';

interface AdminPanelPageProps {
  data: BootstrapPayload;
  user: UserProfile | null;
  onRefresh: () => void;
}

export const AdminPanelPage: React.FC<AdminPanelPageProps> = ({ data, user, onRefresh }) => {
  const [tab, setTab] = useState<'ai_control' | 'homepage' | 'music' | 'ai' | 'effects' | 'users' | 'notifications' | 'logs'>('ai_control');
  const [settings, setSettings] = useState<AdminSettings>(data.settings);
  const [newCategory, setNewCategory] = useState('');

  // Admin AI Control
  const [aiCommand, setAiCommand] = useState('');
  const [aiPreview, setAiPreview] = useState<{
    summary: string;
    actionType: string;
    requiresConfirmation: boolean;
    payload: Record<string, unknown>;
  } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  // Music Upload
  const [trackTitle, setTrackTitle] = useState('');
  const [trackArtist, setTrackArtist] = useState('DJ MUNIX');
  const [trackCategory, setTrackCategory] = useState(data.settings.categories[0] || 'Afrobeat');
  const [trackBpm, setTrackBpm] = useState(118);
  const [trackFile, setTrackFile] = useState<File | null>(null);

  // New Effect
  const [fxName, setFxName] = useState('');
  const [fxCategory, setFxCategory] = useState('DJ Drops');
  const [fxType, setFxType] = useState('echo');
  const [fxDesc, setFxDesc] = useState('');

  // Users & Logs
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<{
    auditLogs: Array<{ id: string; actorEmail: string; action: string; targetType: string; createdAt: string }>;
    usageLogs: Array<{ id: string; feature: string; action: string; createdAt: string }>;
    stats: { totalUsers: number; totalAudioFiles: number; totalProjects: number; totalAiGenerations: number };
  } | null>(null);

  // Broadcast Notification
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMsg, setNotifMsg] = useState('');
  const [notifKind, setNotifKind] = useState<'announcement' | 'system'>('announcement');

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    setSettings(data.settings);
  }, [data.settings]);

  const loadAdminExtras = async () => {
    try {
      const [uRes, lRes] = await Promise.all([
        apiFetch<{ users: UserProfile[] }>('/api/admin/users'),
        apiFetch<{
          auditLogs: Array<{ id: string; actorEmail: string; action: string; targetType: string; createdAt: string }>;
          usageLogs: Array<{ id: string; feature: string; action: string; createdAt: string }>;
          stats: { totalUsers: number; totalAudioFiles: number; totalProjects: number; totalAiGenerations: number };
        }>('/api/admin/logs'),
      ]);
      setUsersList(uRes.users);
      setLogs(lRes);
    } catch {
      // handled by role gate
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAdminExtras();
    }
  }, [user]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-[#0e1311] p-10 text-center space-y-3 max-w-xl mx-auto mt-8">
        <Shield className="w-10 h-10 text-red-400 mx-auto" />
        <h1 className="text-xl font-bold text-white">Restricted — DJ MUNIX Admin Only</h1>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Only verified users with the administrator role may access the Admin Panel and Admin AI Control.
        </p>
      </div>
    );
  }

  const handleSaveSettings = async () => {
    setErrMsg(null);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setStatusMsg('Application settings saved and applied.');
      onRefresh();
      loadAdminExtras();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Save failed.');
    }
  };

  const handleUploadImage = async (target: 'hero' | 'logo', file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    form.append('target', target);
    const res = await apiFetch<{ settings: AdminSettings }>('/api/admin/upload-image', {
      method: 'POST',
      body: form,
    });
    setSettings(res.settings);
    setStatusMsg(`Updated ${target} image.`);
    onRefresh();
  };

  const handlePrepareAdminAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiCommand.trim()) return;
    setAiBusy(true);
    setErrMsg(null);
    setAiPreview(null);
    try {
      const res = await apiFetch<{ preview: typeof aiPreview }>('/api/admin/ai-command', {
        method: 'POST',
        body: JSON.stringify({ command: aiCommand }),
      });
      setAiPreview(res.preview);
    } catch (e2) {
      setErrMsg(e2 instanceof Error ? e2.message : 'Could not prepare admin command.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleExecuteAdminAi = async () => {
    if (!aiPreview) return;
    setAiBusy(true);
    setErrMsg(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/admin/ai-execute', {
        method: 'POST',
        body: JSON.stringify({
          actionType: aiPreview.actionType,
          payload: aiPreview.payload,
          confirmed: true,
        }),
      });
      setStatusMsg(res.message);
      setAiPreview(null);
      setAiCommand('');
      onRefresh();
      loadAdminExtras();
    } catch (e2) {
      setErrMsg(e2 instanceof Error ? e2.message : 'Execution failed.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleAdminUploadTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackFile) return;
    const form = new FormData();
    form.append('audio', trackFile);
    form.append('title', trackTitle || trackFile.name);
    form.append('artist', trackArtist);
    form.append('category', trackCategory);
    form.append('bpm', String(trackBpm));
    form.append('isFeatured', 'true');
    await apiFetch('/api/admin/music', { method: 'POST', body: form });
    setTrackTitle('');
    setTrackFile(null);
    setStatusMsg('Featured track uploaded and published.');
    onRefresh();
  };

  const handleCreateEffect = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/effects', {
      method: 'POST',
      body: JSON.stringify({ name: fxName, category: fxCategory, effectType: fxType, description: fxDesc }),
    });
    setFxName('');
    setFxDesc('');
    setStatusMsg('Added new global DJ effect.');
    onRefresh();
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ title: notifTitle, message: notifMsg, kind: notifKind }),
    });
    setNotifTitle('');
    setNotifMsg('');
    setStatusMsg('Broadcast notification published.');
    onRefresh();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">DJ MUNIX Admin Panel</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Protected Administrator Console · Audit Logged · Server-Side Role Verified
          </p>
        </div>
      </div>

      {statusMsg && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
          {statusMsg}
        </div>
      )}
      {errMsg && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {errMsg}
        </div>
      )}

      {/* Admin Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
        {[
          { id: 'ai_control', label: 'Admin AI Control', icon: Bot },
          { id: 'homepage', label: 'Homepage & Theme', icon: Palette },
          { id: 'music', label: 'Music Catalog', icon: Music },
          { id: 'ai', label: 'AI & Voice Config', icon: Sliders },
          { id: 'effects', label: 'Effects Manager', icon: Sliders },
          { id: 'users', label: 'Users & Roles', icon: Users },
          { id: 'notifications', label: 'Announcements', icon: Bell },
          { id: 'logs', label: 'Audit & System Logs', icon: Activity },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`min-h-[40px] px-3.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-amber-500 text-black font-semibold'
                  : 'bg-[#0e1311] border border-white/10 text-neutral-300 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: ADMIN AI CONTROL */}
      {tab === 'ai_control' && (
        <div className="rounded-2xl border border-amber-500/30 bg-[#0e1311] p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Admin AI Control</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Type an administrative command. The AI prepares a preview and requires your explicit confirmation before modifying anything.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              'Change the application theme to green and gold',
              'Add a new music category called Kinyarwanda Drill',
              'Publish an announcement about Friday Live DJ Mix',
              'Create a new DJ effect called Kigali Sub Drop',
            ].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setAiCommand(ex)}
                className="px-2.5 py-1.5 rounded-md border border-white/10 bg-white/5 text-xs text-neutral-300 hover:text-white cursor-pointer"
              >
                {ex}
              </button>
            ))}
          </div>

          <form onSubmit={handlePrepareAdminAi} className="flex gap-2">
            <input
              type="text"
              value={aiCommand}
              onChange={(e) => setAiCommand(e.target.value)}
              placeholder="e.g. Change the homepage hero title or add a new music category..."
              className="flex-1 min-h-[44px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
            />
            <button
              type="submit"
              disabled={aiBusy}
              className="min-h-[44px] px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
            >
              {aiBusy ? 'Preparing...' : 'Prepare Preview'}
            </button>
          </form>

          {aiPreview && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-200">Action Preview — Confirmation Required</span>
                <span className="text-xs font-mono text-white">{aiPreview.actionType}</span>
              </div>
              <p className="text-sm text-white">{aiPreview.summary}</p>
              <pre className="rounded-lg bg-black/50 p-3 text-xs font-mono text-emerald-300 overflow-x-auto">
                {JSON.stringify(aiPreview.payload, null, 2)}
              </pre>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={aiBusy || aiPreview.actionType === 'unsupported'}
                  onClick={handleExecuteAdminAi}
                  className="min-h-[40px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm & Execute</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAiPreview(null)}
                  className="min-h-[40px] px-4 rounded-lg border border-white/15 text-xs text-neutral-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: HOMEPAGE & THEME */}
      {tab === 'homepage' && (
        <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Application Name</label>
              <input
                type="text"
                value={settings.appName}
                onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                className="w-full min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Main DJ Brand Name</label>
              <input
                type="text"
                value={settings.brandName}
                onChange={(e) => setSettings({ ...settings, brandName: e.target.value })}
                className="w-full min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Hero Headline</label>
              <input
                type="text"
                value={settings.heroTitle}
                onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })}
                className="w-full min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Hero Subtitle</label>
              <input
                type="text"
                value={settings.heroSubtitle}
                onChange={(e) => setSettings({ ...settings, heroSubtitle: e.target.value })}
                className="w-full min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="min-h-[44px] px-4 rounded-xl border border-white/15 bg-black/30 flex items-center justify-between text-xs text-white cursor-pointer">
              <span>Upload New Homepage Hero Banner</span>
              <Upload className="w-4 h-4 text-emerald-400" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadImage('hero', e.target.files?.[0])} />
            </label>
            <label className="min-h-[44px] px-4 rounded-xl border border-white/15 bg-black/30 flex items-center justify-between text-xs text-white cursor-pointer">
              <span>Upload New MUNIX Brand Logo</span>
              <Upload className="w-4 h-4 text-amber-400" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadImage('logo', e.target.files?.[0])} />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Primary Emerald Accent</label>
              <input
                type="color"
                value={settings.themeAccent}
                onChange={(e) => setSettings({ ...settings, themeAccent: e.target.value })}
                className="w-full h-10 rounded-lg bg-black/40 border border-white/10 cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Gold Highlight Accent</label>
              <input
                type="color"
                value={settings.themeGold}
                onChange={(e) => setSettings({ ...settings, themeGold: e.target.value })}
                className="w-full h-10 rounded-lg bg-black/40 border border-white/10 cursor-pointer"
              />
            </div>
          </div>

          {/* Categories & Sections */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <p className="text-xs font-semibold text-white">Homepage Sections</p>
            <div className="flex flex-wrap gap-4 text-xs">
              {Object.entries(settings.enabledSections).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2 text-neutral-300 capitalize cursor-pointer">
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        enabledSections: { ...settings.enabledSections, [k]: e.target.checked },
                      })
                    }
                    className="w-4 h-4 accent-emerald-500"
                  />
                  <span>{k}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10">
            <p className="text-xs font-semibold text-white">Music Categories</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Add new genre category..."
                className="flex-1 min-h-[40px] rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => {
                  if (newCategory.trim() && !settings.categories.includes(newCategory.trim())) {
                    setSettings({ ...settings, categories: [...settings.categories, newCategory.trim()] });
                    setNewCategory('');
                  }
                }}
                className="min-h-[40px] px-4 rounded-lg border border-white/15 bg-white/5 text-xs text-white flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            className="min-h-[44px] px-6 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
          >
            Save Homepage & Theme Settings
          </button>
        </div>
      )}

      {/* TAB: MUSIC CATALOG */}
      {tab === 'music' && (
        <div className="space-y-5">
          <form onSubmit={handleAdminUploadTrack} className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">Upload Featured Song or Beat</h2>
            <div className="grid sm:grid-cols-4 gap-3">
              <input
                type="text"
                required
                placeholder="Track Title"
                value={trackTitle}
                onChange={(e) => setTrackTitle(e.target.value)}
                className="min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Artist"
                value={trackArtist}
                onChange={(e) => setTrackArtist(e.target.value)}
                className="min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
              />
              <select
                value={trackCategory}
                onChange={(e) => setTrackCategory(e.target.value)}
                className="min-h-[42px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-xs text-white"
              >
                {settings.categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="number"
                value={trackBpm}
                onChange={(e) => setTrackBpm(Number(e.target.value))}
                className="min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="min-h-[42px] px-4 rounded-lg border border-white/15 bg-black/30 text-xs text-white flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>{trackFile ? trackFile.name : 'Choose Audio File'}</span>
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => setTrackFile(e.target.files?.[0] || null)} />
              </label>
              <button
                type="submit"
                disabled={!trackFile}
                className="min-h-[42px] px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                Upload & Feature
              </button>
            </div>
          </form>

          <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Public Catalog ({data.recentTracks.length})</h3>
            <div className="divide-y divide-white/10">
              {data.recentTracks.map((t) => (
                <div key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-white">{t.title}</p>
                    <p className="text-neutral-400">
                      {t.artist} · {t.category} · {t.bpm} BPM
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/music/${t.id}`, {
                          method: 'PUT',
                          body: JSON.stringify({ isFeatured: !t.isFeatured }),
                        });
                        onRefresh();
                      }}
                      className={`min-h-[34px] px-3 rounded-md border cursor-pointer ${
                        t.isFeatured ? 'border-amber-400 bg-amber-500/20 text-amber-200' : 'border-white/10 text-neutral-300'
                      }`}
                    >
                      {t.isFeatured ? 'Featured' : 'Feature'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/music/${t.id}`, { method: 'DELETE' });
                        onRefresh();
                      }}
                      className="min-h-[34px] px-2.5 rounded-md border border-red-500/30 text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: AI & VOICE CONFIG */}
      {tab === 'ai' && (
        <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">AI Provider & Voice Governance</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Active Music Generation Provider</label>
              <select
                value={settings.aiConfig.musicProvider}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    aiConfig: { ...settings.aiConfig, musicProvider: e.target.value as 'lyria' | 'replicate' | 'custom' },
                  })
                }
                className="w-full min-h-[42px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-sm text-white"
              >
                <option value="lyria">Google Lyria (lyria-3-clip-preview / pro)</option>
                <option value="replicate">Replicate MusicGen</option>
                <option value="custom">Custom Music REST Provider</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Daily AI Generation Limit per User</label>
              <input
                type="number"
                min={1}
                max={500}
                value={settings.aiConfig.dailyLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    aiConfig: { ...settings.aiConfig, dailyLimit: Number(e.target.value) },
                  })
                }
                className="w-full min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 text-xs pt-2">
            <label className="flex items-center gap-2 text-neutral-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.aiConfig.voiceEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, aiConfig: { ...settings.aiConfig, voiceEnabled: e.target.checked } })
                }
                className="w-4 h-4 accent-emerald-500"
              />
              <span>Enable AI Voices (TTS)</span>
            </label>
            <label className="flex items-center gap-2 text-neutral-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.aiConfig.munixVoiceAuthorized}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    aiConfig: { ...settings.aiConfig, munixVoiceAuthorized: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-amber-500"
              />
              <span>Authorize Official DJ MUNIX Voice Publishing</span>
            </label>
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            className="min-h-[42px] px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
          >
            Save AI & Voice Settings
          </button>
        </div>
      )}

      {/* TAB: EFFECTS MANAGER */}
      {tab === 'effects' && (
        <div className="space-y-5">
          <form onSubmit={handleCreateEffect} className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">Add Global DJ Effect</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Effect Name"
                value={fxName}
                onChange={(e) => setFxName(e.target.value)}
                className="min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
              />
              <input
                type="text"
                required
                placeholder="Category"
                value={fxCategory}
                onChange={(e) => setFxCategory(e.target.value)}
                className="min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
              />
              <select
                value={fxType}
                onChange={(e) => setFxType(e.target.value)}
                className="min-h-[42px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-xs text-white"
              >
                <option value="echo">echo</option>
                <option value="reverb">reverb</option>
                <option value="delay">delay</option>
                <option value="flanger">flanger</option>
                <option value="phaser">phaser</option>
                <option value="filter">filter</option>
                <option value="chorus">chorus</option>
                <option value="distortion">distortion</option>
                <option value="bass_boost">bass_boost</option>
                <option value="dj_drop">dj_drop</option>
                <option value="transition">transition</option>
              </select>
            </div>
            <input
              type="text"
              placeholder="Effect description"
              value={fxDesc}
              onChange={(e) => setFxDesc(e.target.value)}
              className="w-full min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white"
            />
            <button type="submit" className="min-h-[42px] px-5 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer">
              Add Effect
            </button>
          </form>

          <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 divide-y divide-white/10">
            {data.effects.map((fx) => (
              <div key={fx.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold text-white">{fx.name}</p>
                  <p className="text-neutral-400">{fx.category} · {fx.effectType}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/effects/${fx.id}`, { method: 'DELETE' });
                    onRefresh();
                  }}
                  className="min-h-[34px] px-3 rounded border border-red-500/30 text-red-300 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: USERS & ROLES */}
      {tab === 'users' && (
        <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Registered Users ({usersList.length})</h2>
          <div className="divide-y divide-white/10">
            {usersList.map((u) => (
              <div key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold text-white">
                    {u.displayName} <span className="text-neutral-400">({u.email})</span>
                  </p>
                  <p className="text-neutral-400">
                    Role: <strong className="text-amber-400">{u.role}</strong> · Status:{' '}
                    {u.isSuspended ? 'Suspended' : 'Active'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    onChange={async (e) => {
                      await apiFetch(`/api/admin/users/${u.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ role: e.target.value }),
                      });
                      loadAdminExtras();
                    }}
                    className="min-h-[34px] rounded border border-white/15 bg-[#090d0b] px-2 text-xs text-white"
                  >
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/users/${u.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ isSuspended: !u.isSuspended }),
                      });
                      loadAdminExtras();
                    }}
                    className={`min-h-[34px] px-3 rounded border cursor-pointer ${
                      u.isSuspended ? 'border-emerald-500/40 text-emerald-300' : 'border-red-500/40 text-red-300'
                    }`}
                  >
                    {u.isSuspended ? 'Activate' : 'Suspend'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: NOTIFICATIONS */}
      {tab === 'notifications' && (
        <form onSubmit={handleSendNotification} className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
          <h2 className="text-base font-semibold text-white">Publish Announcement or Broadcast Notification</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <input
              type="text"
              required
              placeholder="Announcement Title"
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              className="min-h-[42px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
            />
            <select
              value={notifKind}
              onChange={(e) => setNotifKind(e.target.value as 'announcement' | 'system')}
              className="min-h-[42px] rounded-lg border border-white/10 bg-[#090d0b] px-3 text-sm text-white"
            >
              <option value="announcement">Homepage Announcement</option>
              <option value="system">System Notification</option>
            </select>
          </div>
          <textarea
            rows={3}
            required
            placeholder="Message to all MIX DJ – MUNIX AI users..."
            value={notifMsg}
            onChange={(e) => setNotifMsg(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white"
          />
          <button type="submit" className="min-h-[42px] px-5 rounded-lg bg-amber-500 text-black text-xs font-semibold cursor-pointer">
            Publish Broadcast
          </button>
        </form>
      )}

      {/* TAB: LOGS */}
      {tab === 'logs' && logs && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-white/10 bg-[#0e1311] p-4">
              <p className="text-xs text-neutral-400">Users</p>
              <p className="text-2xl font-bold text-white tabular-nums mt-1">{logs.stats.totalUsers}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0e1311] p-4">
              <p className="text-xs text-neutral-400">Audio Files</p>
              <p className="text-2xl font-bold text-emerald-400 tabular-nums mt-1">{logs.stats.totalAudioFiles}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0e1311] p-4">
              <p className="text-xs text-neutral-400">Projects</p>
              <p className="text-2xl font-bold text-amber-400 tabular-nums mt-1">{logs.stats.totalProjects}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0e1311] p-4">
              <p className="text-xs text-neutral-400">AI Requests</p>
              <p className="text-2xl font-bold text-white tabular-nums mt-1">{logs.stats.totalAiGenerations}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Administrator Audit Log</h3>
            <div className="divide-y divide-white/10 max-h-72 overflow-y-auto text-xs">
              {logs.auditLogs.map((l) => (
                <div key={l.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-amber-400">{l.action}</span>{' '}
                    <span className="text-neutral-400">by {l.actorEmail}</span>
                  </div>
                  <span className="font-mono text-neutral-500">{new Date(l.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

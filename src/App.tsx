import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Bot,
  Disc3,
  FileMusic,
  Globe,
  Home,
  Menu,
  Mic,
  Pause,
  Play,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  User,
  Wand2,
  X,
} from 'lucide-react';
import { djEngine } from './audio/djEngine';
import { AssistantDrawer } from './components/AssistantDrawer';
import { AuthModal } from './components/AuthModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { apiFetch, getAudioStreamUrl } from './lib/api';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { CommunityPage } from './pages/CommunityPage';
import { DJStudioPage } from './pages/DJStudioPage';
import { EffectsPage } from './pages/EffectsPage';
import { HomePage } from './pages/HomePage';
import { MunixAIPage } from './pages/MunixAIPage';
import { MyMusicPage } from './pages/MyMusicPage';
import { SettingsPage } from './pages/SettingsPage';
import { VoiceStudioPage } from './pages/VoiceStudioPage';
import { AudioFileItem, BootstrapPayload, PageId, UserProfile } from './types/studio';

export default function App() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const [history, setHistory] = useState<PageId[]>(['home']);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [suggestedAiPrompt, setSuggestedAiPrompt] = useState<string | undefined>(undefined);

  // Global mini-player for Home / Community track preview
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [playingTrack, setPlayingTrack] = useState<AudioFileItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fetchBootstrap = useCallback(async () => {
    try {
      const payload = await apiFetch<BootstrapPayload>('/api/bootstrap');
      setData(payload);
      setLoadError(null);
      if (payload.settings) {
        document.documentElement.style.setProperty('--munix-accent', payload.settings.themeAccent || '#10b981');
        document.documentElement.style.setProperty('--munix-gold', payload.settings.themeGold || '#d4af37');
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to connect to studio server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  const navigateTo = useCallback((page: PageId) => {
    setCurrentPage(page);
    setHistory((prev) => (prev[prev.length - 1] === page ? prev : [...prev, page]));
    setMobileMenuOpen(false);
    setNotifOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleBack = () => {
    if (history.length > 1) {
      const next = history.slice(0, -1);
      setHistory(next);
      setCurrentPage(next[next.length - 1]);
    } else {
      setCurrentPage('home');
    }
  };

  const handlePlayToggle = (track: AudioFileItem) => {
    const audioEl = audioElRef.current;
    if (!audioEl) return;

    if (playingTrack?.id === track.id) {
      if (isPlaying) {
        audioEl.pause();
        setIsPlaying(false);
      } else {
        audioEl.play().catch(() => {});
        setIsPlaying(true);
      }
      return;
    }

    setPlayingTrack(track);
    audioEl.src = getAudioStreamUrl(track.id);
    audioEl.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  };

  const handleLoadToDeck = async (track: AudioFileItem, deck: 'A' | 'B') => {
    try {
      await djEngine.loadFromUrl(deck, getAudioStreamUrl(track.id), {
        title: track.title,
        artist: track.artist,
        bpm: track.bpm,
      });
      setToastMsg(`Loaded "${track.title}" into Deck ${deck}`);
      window.setTimeout(() => setToastMsg(null), 3000);
      navigateTo('studio');
    } catch (err) {
      setToastMsg(err instanceof Error ? err.message : 'Failed to load track into deck.');
    }
  };

  const libraryTracks = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, AudioFileItem>();
    [...data.myAudioFiles, ...data.featuredTracks, ...data.popularMixes, ...data.recentTracks].forEach((t) =>
      map.set(t.id, t)
    );
    return Array.from(map.values());
  }, [data]);

  const unreadCount = useMemo(() => {
    if (!data) return 0;
    return data.notifications.filter((n) => !n.isRead).length;
  }, [data]);

  const navItems: Array<{ id: PageId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'studio', label: 'DJ Studio', icon: Sliders },
    { id: 'ai', label: 'MUNIX AI', icon: Sparkles },
    { id: 'voice', label: 'Voice Studio', icon: Mic },
    { id: 'mymusic', label: 'My Music', icon: FileMusic },
    { id: 'effects', label: 'Effects', icon: Wand2 },
    { id: 'community', label: 'Community', icon: Globe },
    { id: 'settings', label: 'Settings', icon: Settings },
    ...(data?.user?.role === 'admin' ? [{ id: 'admin' as PageId, label: 'Admin Panel', icon: Shield }] : []),
  ];

  const handleUserChange = (user: UserProfile | null) => {
    fetchBootstrap();
    if (!user && currentPage === 'admin') {
      navigateTo('home');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070908] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Disc3 className="w-10 h-10 text-emerald-400 animate-spin mx-auto" />
          <p className="text-sm font-medium text-neutral-300">Loading MIX DJ – MUNIX AI...</p>
        </div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="min-h-screen bg-[#070908] flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-[#0e1311] p-6 text-center space-y-4">
          <p className="text-base font-semibold text-white">Studio Server Connection Issue</p>
          <p className="text-xs text-neutral-400">{loadError || 'Unable to load studio data.'}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchBootstrap();
            }}
            className="min-h-[42px] px-5 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070908] text-[#f2f5f3] flex flex-col">
      <audio
        ref={audioElRef}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden"
      />

      {/* Top Navigation Bar (3-zone contract) */}
      <header className="sticky top-0 z-30 h-14 border-b border-white/10 bg-[#070908]/95 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between gap-6">
        {/* Zone 1: Back Button + Brand Mark */}
        <div className="flex items-center gap-3 shrink-0">
          {currentPage !== 'home' && (
            <button
              type="button"
              onClick={handleBack}
              className="min-w-[40px] min-h-[40px] px-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
              aria-label="Go Back"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigateTo('home')}
            className="flex items-center gap-2.5 text-left cursor-pointer whitespace-nowrap shrink-0"
          >
            <img
              src={data.settings.logoUrl}
              alt="MUNIX Logo"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg object-cover border border-amber-500/40"
            />
            <span className="font-display text-sm sm:text-base font-bold tracking-tight text-white">
              {data.settings.appName}
            </span>
          </button>
        </div>

        {/* Zone 2: Concise Top Nav Links (Desktop) */}
        <nav className="hidden xl:flex items-center gap-5 text-xs font-medium text-neutral-300">
          {navItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateTo(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                currentPage === item.id
                  ? 'text-emerald-400 border-emerald-400'
                  : 'border-transparent hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block">
            <PWAInstallButton variant="compact" />
          </div>

          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="min-h-[40px] px-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-medium text-emerald-300 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Bot className="w-4 h-4" />
            <span className="hidden md:inline">AI Assistant</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen(!notifOpen)}
              className="min-w-[40px] min-h-[40px] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center relative cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 text-neutral-200" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/10 bg-[#0e1311] shadow-2xl p-3 space-y-2 z-50">
                <div className="flex items-center justify-between px-1 pb-1 border-b border-white/10">
                  <span className="text-xs font-semibold text-white">Notifications</span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs text-neutral-400 hover:text-white cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {data.notifications.length === 0 ? (
                    <p className="text-xs text-neutral-500 p-3 text-center">No notifications</p>
                  ) : (
                    data.notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={async () => {
                          if (data.user && !n.isRead) {
                            await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
                            fetchBootstrap();
                          }
                        }}
                        className={`rounded-lg border p-2.5 text-xs cursor-pointer ${
                          n.isRead ? 'border-white/5 bg-black/20 text-neutral-400' : 'border-emerald-500/30 bg-emerald-500/10 text-white'
                        }`}
                      >
                        <p className="font-semibold">{n.title}</p>
                        <p className="mt-0.5 text-neutral-300 leading-relaxed">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {data.user ? (
            <button
              type="button"
              onClick={() => navigateTo('settings')}
              className="min-h-[40px] px-3 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-white flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <User className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline max-w-[110px] truncate">{data.user.displayName}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="min-h-[40px] px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              Sign In
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden min-w-[40px] min-h-[40px] rounded-lg border border-white/10 bg-white/5 flex items-center justify-center cursor-pointer"
            aria-label="Open Studio Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex relative">
        {/* Desktop Studio Sidebar */}
        <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-white/10 bg-[#0a0e0c] p-4 justify-between">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  className={`w-full min-h-[42px] px-3 rounded-lg text-xs font-medium flex items-center gap-3 transition-colors cursor-pointer ${
                    active
                      ? item.id === 'admin'
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-neutral-300 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-white/10 space-y-2 text-xs text-neutral-400">
            <p className="font-semibold text-white">{data.settings.brandName}</p>
            <p>Installable PWA · Web Audio Studio</p>
          </div>
        </aside>

        {/* Mobile Slide Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden bg-black/80 backdrop-blur-sm">
            <div className="w-72 h-full bg-[#0b100e] border-r border-white/10 p-4 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10">
                  <span className="text-sm font-bold text-white">{data.settings.appName}</span>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-neutral-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateTo(item.id)}
                      className={`w-full min-h-[44px] px-3.5 rounded-lg text-sm font-medium flex items-center gap-3 cursor-pointer ${
                        active ? 'bg-emerald-500/20 text-emerald-300' : 'text-neutral-300 hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="pt-4 border-t border-white/10">
                <PWAInstallButton variant="hero" />
              </div>
            </div>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pt-6 pb-24 lg:pb-16 max-w-7xl mx-auto w-full">
          {currentPage === 'home' && (
            <HomePage
              data={data}
              playingTrackId={playingTrack?.id || null}
              isPlaying={isPlaying}
              onPlayToggle={handlePlayToggle}
              onLoadToDeck={handleLoadToDeck}
              onNavigate={navigateTo}
            />
          )}
          {currentPage === 'studio' && (
            <DJStudioPage
              libraryTracks={libraryTracks}
              user={data.user}
              onRequireAuth={() => setAuthModalOpen(true)}
              onMixSaved={fetchBootstrap}
            />
          )}
          {currentPage === 'ai' && (
            <MunixAIPage
              data={data}
              user={data.user}
              initialPrompt={suggestedAiPrompt}
              onRequireAuth={() => setAuthModalOpen(true)}
              onGenerated={fetchBootstrap}
              onLoadToDeck={handleLoadToDeck}
            />
          )}
          {currentPage === 'voice' && (
            <VoiceStudioPage
              data={data}
              user={data.user}
              onRequireAuth={() => setAuthModalOpen(true)}
              onSaved={fetchBootstrap}
            />
          )}
          {currentPage === 'mymusic' && (
            <MyMusicPage
              data={data}
              user={data.user}
              onRequireAuth={() => setAuthModalOpen(true)}
              onRefresh={fetchBootstrap}
              onLoadToDeck={handleLoadToDeck}
            />
          )}
          {currentPage === 'effects' && (
            <EffectsPage
              effects={data.effects}
              user={data.user}
              onRequireAuth={() => setAuthModalOpen(true)}
              onSaved={fetchBootstrap}
            />
          )}
          {currentPage === 'community' && (
            <CommunityPage
              playingTrackId={playingTrack?.id || null}
              isPlaying={isPlaying}
              onPlayToggle={handlePlayToggle}
              onLoadToDeck={handleLoadToDeck}
            />
          )}
          {currentPage === 'settings' && (
            <SettingsPage
              user={data.user}
              onRequireAuth={() => setAuthModalOpen(true)}
              onUserUpdated={handleUserChange}
            />
          )}
          {currentPage === 'admin' && (
            <AdminPanelPage data={data} user={data.user} onRefresh={fetchBootstrap} />
          )}
        </main>
      </div>

      {/* Persistent Global Mini-Player */}
      {playingTrack && (
        <div className="fixed bottom-14 lg:bottom-3 left-3 right-3 lg:left-64 z-30 rounded-xl border border-emerald-500/30 bg-[#0d1310]/95 backdrop-blur-md px-4 py-2.5 shadow-2xl flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <button
              type="button"
              onClick={() => handlePlayToggle(playingTrack)}
              className="w-10 h-10 rounded-full bg-emerald-500 text-black flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{playingTrack.title}</p>
              <p className="text-[11px] text-neutral-400 truncate">
                {playingTrack.artist} · {playingTrack.bpm} BPM
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleLoadToDeck(playingTrack, 'A')}
              className="min-h-[34px] px-2.5 rounded-lg border border-emerald-500/35 text-[11px] font-medium text-emerald-300 cursor-pointer"
            >
              Deck A
            </button>
            <button
              type="button"
              onClick={() => handleLoadToDeck(playingTrack, 'B')}
              className="min-h-[34px] px-2.5 rounded-lg border border-amber-500/35 text-[11px] font-medium text-amber-300 cursor-pointer"
            >
              Deck B
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-16 right-4 z-50 rounded-lg border border-emerald-500/40 bg-[#0e1512] px-4 py-2.5 text-xs text-emerald-200 shadow-xl">
          {toastMsg}
        </div>
      )}

      {/* Mobile Bottom Tab Bar (compact <= 56px height) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 border-t border-white/10 bg-[#070908]/95 backdrop-blur-md grid grid-cols-5 items-center pb-safe">
        {[
          { id: 'home' as PageId, label: 'Home', icon: Home },
          { id: 'studio' as PageId, label: 'DJ Studio', icon: Sliders },
          { id: 'ai' as PageId, label: 'MUNIX AI', icon: Sparkles },
          { id: 'mymusic' as PageId, label: 'My Music', icon: FileMusic },
        ].map((t) => {
          const Icon = t.icon;
          const active = currentPage === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => navigateTo(t.id)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
                active ? 'text-emerald-400' : 'text-neutral-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-neutral-400 cursor-pointer"
        >
          <Menu className="w-4 h-4" />
          <span>More</span>
        </button>
      </nav>

      <OfflineIndicator />

      <AuthModal
        open={authModalOpen}
        adminEmailHint={data.adminEmailHint}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => fetchBootstrap()}
      />

      <AssistantDrawer
        open={assistantOpen}
        currentPage={currentPage}
        onClose={() => setAssistantOpen(false)}
        onNavigate={navigateTo}
        onSuggestMusicPrompt={(p) => setSuggestedAiPrompt(p)}
      />
    </div>
  );
}

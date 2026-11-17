import React, { useMemo, useState } from 'react';
import { Disc3, Megaphone, Pause, Play, Radio, Search, Sliders, Sparkles } from 'lucide-react';
import { AudioFileItem, BootstrapPayload, PageId } from '../types/studio';
import { PWAInstallButton } from '../components/PWAInstallButton';

interface HomePageProps {
  data: BootstrapPayload;
  playingTrackId: string | null;
  isPlaying: boolean;
  onPlayToggle: (track: AudioFileItem) => void;
  onLoadToDeck: (track: AudioFileItem, deck: 'A' | 'B') => void;
  onNavigate: (page: PageId) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  data,
  playingTrackId,
  isPlaying,
  onPlayToggle,
  onLoadToDeck,
  onNavigate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [imgErrorMap, setImgErrorMap] = useState<Record<string, boolean>>({});

  const allPublicTracks = useMemo(() => {
    const map = new Map<string, AudioFileItem>();
    [...data.featuredTracks, ...data.popularMixes, ...data.recentTracks].forEach((t) => map.set(t.id, t));
    return Array.from(map.values());
  }, [data.featuredTracks, data.popularMixes, data.recentTracks]);

  const filterList = (list: AudioFileItem[]) => {
    return list.filter((item) => {
      const matchesCat = selectedCategory === 'All' || item.category.toLowerCase() === selectedCategory.toLowerCase();
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.artist.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  };

  const filteredFeatured = filterList(data.featuredTracks);
  const filteredPopular = filterList(data.popularMixes);
  const filteredRecent = filterList(data.recentTracks);
  const sections = data.settings.enabledSections;

  const renderTrackCard = (track: AudioFileItem) => {
    const active = playingTrackId === track.id && isPlaying;
    const coverSrc = track.coverUrl || '/src/assets/images/featured_afrobeat_cover_1794905823849.jpg';
    const hasErr = imgErrorMap[track.id];

    return (
      <div
        key={track.id}
        className="group rounded-xl border border-white/10 bg-[#0e1311] p-4 flex flex-col justify-between gap-4 hover:border-emerald-500/40 transition-colors"
      >
        <div className="flex items-start gap-4">
          <div className="relative w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-gradient-to-br from-emerald-950 via-[#0d1210] to-amber-950 border border-white/10">
            {!hasErr ? (
              <img
                src={coverSrc}
                alt={track.title}
                referrerPolicy="no-referrer"
                onError={() => setImgErrorMap((prev) => ({ ...prev, [track.id]: true }))}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Disc3 className="w-8 h-8 text-amber-400/70" />
              </div>
            )}
            <button
              type="button"
              onClick={() => onPlayToggle(track)}
              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer"
              aria-label={active ? `Pause ${track.title}` : `Play ${track.title}`}
            >
              <span className="w-10 h-10 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-lg">
                {active ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </span>
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white truncate">{track.title}</h3>
            <p className="text-xs text-neutral-400 mt-0.5 truncate">{track.artist}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400 tabular-nums">
              <span className="text-emerald-400">{track.category}</span>
              <span aria-hidden="true">·</span>
              <span>{track.bpm} BPM</span>
              {track.durationSec > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{Math.round(track.durationSec)}s</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => onPlayToggle(track)}
            className="flex-1 min-h-[40px] rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-white flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {active ? <Pause className="w-3.5 h-3.5 text-emerald-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{active ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            onClick={() => onLoadToDeck(track, 'A')}
            className="min-h-[40px] px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-medium text-emerald-300 cursor-pointer"
          >
            Deck A
          </button>
          <button
            type="button"
            onClick={() => onLoadToDeck(track, 'B')}
            className="min-h-[40px] px-3 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium text-amber-300 cursor-pointer"
          >
            Deck B
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0d1210]">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between gap-6 relative z-10">
            <div className="space-y-4">
              <p className="text-xs font-medium tracking-wider text-amber-400">
                {data.settings.brandName} · {data.settings.aiStudioName}
              </p>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.1] max-w-2xl text-balance">
                {data.settings.heroTitle}
              </h1>
              <p className="text-sm sm:text-base text-neutral-300 max-w-xl leading-relaxed">
                {data.settings.heroSubtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('studio')}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sliders className="w-4 h-4" />
                <span>Launch DJ Studio</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('ai')}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>MUNIX AI Studio</span>
              </button>
              <PWAInstallButton variant="hero" />
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10 text-xs">
              <div>
                <p className="text-neutral-400">Studio Tracks</p>
                <p className="text-lg font-semibold text-white tabular-nums mt-0.5">{allPublicTracks.length}</p>
              </div>
              <div>
                <p className="text-neutral-400">DSP Effects</p>
                <p className="text-lg font-semibold text-emerald-400 tabular-nums mt-0.5">{data.effects.length}</p>
              </div>
              <div>
                <p className="text-neutral-400">Music Genres</p>
                <p className="text-lg font-semibold text-amber-400 tabular-nums mt-0.5">{data.settings.categories.length}</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[240px] lg:min-h-full bg-[#090d0b]">
            <img
              src={data.settings.heroImageUrl}
              alt="DJ MUNIX Studio Console"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#0d1210] via-[#0d1210]/40 to-transparent" />
          </div>
        </div>
      </section>

      {/* Search & Category Filter */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3.5" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search featured beats, DJ mixes, genres, or artists..."
              className="w-full min-h-[44px] rounded-xl border border-white/10 bg-[#0e1311] pl-10 pr-4 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>Load any track straight into Deck A or Deck B</span>
          </div>
        </div>

        {sections.categories && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
            {['All', ...data.settings.categories].map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-emerald-500 text-black font-semibold'
                      : 'bg-[#0e1311] border border-white/10 text-neutral-300 hover:text-white hover:border-white/25'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* DJ MUNIX Announcements */}
      {sections.announcements && data.announcements.length > 0 && (
        <section className="rounded-xl border border-amber-500/25 bg-[#12100a] p-5">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2.5">
              <Megaphone className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-amber-200">Featured DJ MUNIX Announcements</h2>
            </div>
            <span className="text-xs text-neutral-400 tabular-nums">{data.announcements.length} updates</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {data.announcements.slice(0, 4).map((ann) => (
              <div key={ann.id} className="rounded-lg border border-white/10 bg-black/35 p-3.5">
                <h3 className="text-sm font-medium text-white">{ann.title}</h3>
                <p className="text-xs text-neutral-300 mt-1 leading-relaxed">{ann.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Featured Songs & Beats */}
      {sections.featured && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Featured Songs & Beats</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Studio-ready tracks curated by DJ MUNIX</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              Open Mixer →
            </button>
          </div>
          {filteredFeatured.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#0e1311] p-8 text-center text-sm text-neutral-400">
              No featured tracks match your current filter.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{filteredFeatured.map(renderTrackCard)}</div>
          )}
        </section>
      )}

      {/* Popular DJ Mixes */}
      {sections.popular && filteredPopular.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Popular DJ Mixes</h2>
            <p className="text-xs text-neutral-400 mt-0.5">Club-ready grooves and live set staples</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{filteredPopular.map(renderTrackCard)}</div>
        </section>
      )}

      {/* Recently Uploaded Music */}
      {sections.recent && filteredRecent.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Recently Uploaded Music</h2>
            <p className="text-xs text-neutral-400 mt-0.5">Fresh tracks uploaded to the public catalog</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{filteredRecent.slice(0, 6).map(renderTrackCard)}</div>
        </section>
      )}

      {/* New AI-Generated Music */}
      {sections.aiNew && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">New AI-Generated Music</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Published MUNIX AI Studio creations</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ai')}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              Create with MUNIX AI →
            </button>
          </div>
          {data.aiNewTracks.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#0e1311] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white">Be the first to publish a MUNIX AI track</p>
                <p className="text-xs text-neutral-400 mt-1">
                  Compose Gospel, Afrobeat, Amapiano, or Traditional Rwandan music in MUNIX AI Studio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('ai')}
                className="min-h-[40px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Open MUNIX AI
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.aiNewTracks.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-[#0e1311] p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-white truncate">{item.title}</h3>
                  <p className="text-xs text-neutral-400">
                    {item.genre} · {item.language} · {item.mood}
                  </p>
                  <p className="text-xs text-neutral-300 line-clamp-2">{item.prompt}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

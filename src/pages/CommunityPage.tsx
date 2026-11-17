import React, { useEffect, useState } from 'react';
import { Disc3, Megaphone, Play, Pause } from 'lucide-react';
import { apiFetch, getAudioStreamUrl } from '../lib/api';
import { AudioFileItem, MusicProjectItem, NotificationItem } from '../types/studio';

interface CommunityPageProps {
  playingTrackId: string | null;
  isPlaying: boolean;
  onPlayToggle: (track: AudioFileItem) => void;
  onLoadToDeck: (track: AudioFileItem, deck: 'A' | 'B') => void;
}

export const CommunityPage: React.FC<CommunityPageProps> = ({
  playingTrackId,
  isPlaying,
  onPlayToggle,
  onLoadToDeck,
}) => {
  const [loading, setLoading] = useState(true);
  const [tracks, setTracks] = useState<AudioFileItem[]>([]);
  const [projects, setProjects] = useState<MusicProjectItem[]>([]);
  const [announcements, setAnnouncements] = useState<NotificationItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCat, setSelectedCat] = useState('All');

  useEffect(() => {
    apiFetch<{
      publicTracks: AudioFileItem[];
      publicProjects: MusicProjectItem[];
      announcements: NotificationItem[];
      categories: string[];
    }>('/api/community')
      .then((res) => {
        setTracks(res.publicTracks);
        setProjects(res.publicProjects);
        setAnnouncements(res.announcements);
        setCategories(res.categories);
      })
      .finally(() => setLoading(false));
  }, []);

  const visibleTracks = tracks.filter((t) => selectedCat === 'All' || t.category === selectedCat);

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white">Community Showcase</h1>
        <p className="text-xs text-neutral-400 mt-0.5">
          Public DJ MUNIX releases, creator mixes, and studio announcements
        </p>
      </div>

      {announcements.length > 0 && (
        <section className="rounded-2xl border border-amber-500/25 bg-[#12100a] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-200">Official Announcements</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {announcements.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/10 bg-black/35 p-3.5">
                <p className="text-sm font-medium text-white">{a.title}</p>
                <p className="text-xs text-neutral-300 mt-1">{a.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {['All', ...categories].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setSelectedCat(c)}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              selectedCat === c
                ? 'bg-emerald-500 text-black font-semibold'
                : 'bg-[#0e1311] border border-white/10 text-neutral-300 hover:text-white'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl border border-white/10 bg-[#0e1311] animate-pulse" />
          ))}
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Public Releases & Beats</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleTracks.map((track) => {
              const active = playingTrackId === track.id && isPlaying;
              return (
                <div key={track.id} className="rounded-xl border border-white/10 bg-[#0e1311] p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-950 to-amber-950 border border-white/10 flex items-center justify-center shrink-0">
                      <Disc3 className="w-6 h-6 text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-white truncate">{track.title}</h3>
                      <p className="text-xs text-neutral-400 truncate">
                        {track.artist} · {track.category} · {track.bpm} BPM
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onPlayToggle(track)}
                      className="flex-1 min-h-[38px] rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {active ? <Pause className="w-3.5 h-3.5 text-emerald-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                      <span>{active ? 'Pause' : 'Play'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoadToDeck(track, 'A')}
                      className="min-h-[38px] px-3 rounded-lg border border-emerald-500/30 text-xs text-emerald-300 cursor-pointer"
                    >
                      Deck A
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoadToDeck(track, 'B')}
                      className="min-h-[38px] px-3 rounded-lg border border-amber-500/30 text-xs text-amber-300 cursor-pointer"
                    >
                      Deck B
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Published Creator Projects</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div key={p.id} className="rounded-xl border border-white/10 bg-[#0e1311] p-4 space-y-2">
                <h3 className="text-sm font-semibold text-white truncate">{p.title}</h3>
                <p className="text-xs text-neutral-400">
                  {p.category} · {p.bpm} BPM
                </p>
                {p.audioFileId && <audio controls src={getAudioStreamUrl(p.audioFileId)} className="w-full h-8" />}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

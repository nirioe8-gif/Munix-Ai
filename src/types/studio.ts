export type PageId =
  | 'home'
  | 'studio'
  | 'ai'
  | 'voice'
  | 'mymusic'
  | 'effects'
  | 'community'
  | 'settings'
  | 'admin';

export type UserRole = 'user' | 'moderator' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  emailVerified: boolean;
  isSuspended: boolean;
  role: UserRole;
  createdAt: string;
}

export interface AudioFileItem {
  id: string;
  userId: string;
  title: string;
  artist: string;
  category: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSec: number;
  bpm: number;
  coverUrl: string | null;
  isPublic: boolean;
  isFeatured: boolean;
  isPopularMix?: boolean;
  sourceType: 'upload' | 'recording' | 'ai_music' | 'voice' | 'edited' | 'stem' | 'featured_beat';
  createdAt: string;
}

export interface MusicProjectItem {
  id: string;
  userId: string;
  title: string;
  category: string;
  projectType: 'dj_mix' | 'ai_song' | 'audio_edit' | 'voice_drop';
  bpm: number;
  durationSec: number;
  coverUrl: string | null;
  audioFileId: string | null;
  metadata: Record<string, unknown>;
  isPublic: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedMusicItem {
  id: string;
  userId: string;
  title: string;
  prompt: string;
  genre: string;
  mood: string;
  language: string;
  voiceGender: 'male' | 'female' | 'none';
  instrumentalOnly: boolean;
  durationSec: number;
  lyrics: string;
  provider: string;
  status: 'completed' | 'blueprint_only' | 'failed' | 'pending';
  audioFileId: string | null;
  arrangementJson: {
    bpm?: number;
    musicalKey?: string;
    instruments?: string[];
    sections?: Array<{ name: string; bars: number; notes: string }>;
    draftLyrics?: string;
  };
  isPublic: boolean;
  createdAt: string;
}

export interface VoiceProfileItem {
  id: string;
  userId: string;
  category: 'dj_munix_authorized' | 'ai_voice' | 'user_recording';
  name: string;
  language: string;
  voiceTone: string;
  scriptText: string;
  authorizedByOwner: boolean;
  audioFileId: string | null;
  settings: Record<string, unknown>;
  isPublic: boolean;
  createdAt: string;
}

export interface SoundEffectItem {
  id: string;
  createdBy: string | null;
  name: string;
  category: string;
  effectType: string;
  description: string;
  defaultParams: Record<string, number | string | boolean>;
  audioFileId: string | null;
  isGlobal: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string | null;
  title: string;
  message: string;
  kind: 'announcement' | 'system' | 'music' | 'admin';
  isRead: boolean;
  createdAt: string;
}

export interface AdminSettings {
  id: string;
  appName: string;
  brandName: string;
  aiStudioName: string;
  logoUrl: string;
  heroImageUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  themeAccent: string;
  themeGold: string;
  categories: string[];
  enabledSections: {
    featured: boolean;
    recent: boolean;
    popular: boolean;
    aiNew: boolean;
    categories: boolean;
    announcements: boolean;
  };
  aiConfig: {
    musicProvider: 'lyria' | 'replicate' | 'custom';
    dailyLimit: number;
    voiceEnabled: boolean;
    munixVoiceAuthorized: boolean;
    supportedLanguages: string[];
  };
  updatedAt: string;
}

export interface BootstrapPayload {
  settings: AdminSettings;
  adminEmailHint: string | null;
  user: UserProfile | null;
  featuredTracks: AudioFileItem[];
  popularMixes: AudioFileItem[];
  recentTracks: AudioFileItem[];
  aiNewTracks: GeneratedMusicItem[];
  effects: SoundEffectItem[];
  announcements: NotificationItem[];
  notifications: NotificationItem[];
  projects: MusicProjectItem[];
  myAudioFiles: AudioFileItem[];
  generatedMusic: GeneratedMusicItem[];
  voiceProfiles: VoiceProfileItem[];
  providers: {
    gemini: boolean;
    music: {
      activeProvider: string;
      providers: Array<{ id: string; name: string; configured: boolean; note: string }>;
    };
    stems: {
      configured: boolean;
      provider: string;
      message: string;
    };
  };
}

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export type UserRole = 'user' | 'moderator' | 'admin';

export interface ProfileRecord {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  passwordHash: string;
  passwordSalt: string;
  emailVerified: boolean;
  verificationToken: string | null;
  resetToken: string | null;
  resetTokenExpiresAt: number | null;
  isSuspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRoleRecord {
  id: string;
  userId: string;
  role: UserRole;
  assignedBy: string | null;
  createdAt: string;
}

export interface MusicProjectRecord {
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

export interface AudioFileRecord {
  id: string;
  userId: string;
  title: string;
  artist: string;
  category: string;
  storagePath: string;
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

export interface GeneratedMusicRecord {
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
  arrangementJson: Record<string, unknown>;
  isPublic: boolean;
  createdAt: string;
}

export interface VoiceProfileRecord {
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

export interface SoundEffectRecord {
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

export interface NotificationRecord {
  id: string;
  userId: string | null; // null = global broadcast
  title: string;
  message: string;
  kind: 'announcement' | 'system' | 'music' | 'admin';
  readBy: string[];
  createdAt: string;
}

export interface AdminSettingsRecord {
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

export interface UsageLogRecord {
  id: string;
  userId: string | null;
  feature: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorUserId: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface MunixDatabase {
  profiles: ProfileRecord[];
  user_roles: UserRoleRecord[];
  music_projects: MusicProjectRecord[];
  audio_files: AudioFileRecord[];
  generated_music: GeneratedMusicRecord[];
  voice_profiles: VoiceProfileRecord[];
  sound_effects: SoundEffectRecord[];
  notifications: NotificationRecord[];
  admin_settings: AdminSettingsRecord;
  usage_logs: UsageLogRecord[];
  audit_logs: AuditLogRecord[];
}

function resolveWritableDataDir(): string {
  const preferred = path.resolve(process.cwd(), 'data');
  try {
    if (!fs.existsSync(preferred)) {
      fs.mkdirSync(preferred, { recursive: true });
    }
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'munix-ai-data');
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }
}

export const DATA_DIR = resolveWritableDataDir();
export const DB_PATH = path.join(DATA_DIR, 'munix-db.json');
export const STORAGE_AUDIO_DIR = path.join(DATA_DIR, 'storage', 'audio');
export const STORAGE_PUBLIC_DIR = path.join(DATA_DIR, 'storage', 'public');
export const STORAGE_IMAGES_DIR = path.join(DATA_DIR, 'storage', 'images');

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'nirioe8@gmail.com').toLowerCase().trim();
const SESSION_SECRET = process.env.SESSION_SECRET || 'munix-ai-studio-session-secret-key-2026';

function ensureDirectories() {
  for (const dir of [DATA_DIR, STORAGE_AUDIO_DIR, STORAGE_PUBLIC_DIR, STORAGE_IMAGES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
ensureDirectories();

/**
 * Generates clean, playable WAV studio grooves on first boot so Featured Beats
 * and Deck A/B quick-load tracks play real rhythmic audio out of the box.
 */
function writeSynthesizedWav(filePath: string, bpm: number, rootHz: number, grooveType: 'afrobeat' | 'gospel' | 'amapiano' | 'rwandan') {
  if (fs.existsSync(filePath)) return;
  const sampleRate = 22050;
  const durationSec = 16;
  const totalSamples = sampleRate * durationSec;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = totalSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const beatSec = 60 / bpm;
  const chordRatios =
    grooveType === 'gospel'
      ? [1, 1.25, 1.5, 1.875]
      : grooveType === 'amapiano'
        ? [1, 1.189, 1.498, 1.782]
        : grooveType === 'rwandan'
          ? [1, 1.122, 1.335, 1.498]
          : [1, 1.2, 1.5, 1.78];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatPos = (t / beatSec) % 4;
    const stepPos = (t / (beatSec / 4)) % 16;
    const fracBeat = t % beatSec;
    const fracStep = t % (beatSec / 4);

    // Kick drum on quarter beats or syncopated pattern
    const kickTrig =
      grooveType === 'afrobeat'
        ? fracBeat < 0.18 && (Math.floor(stepPos) === 0 || Math.floor(stepPos) === 4 || Math.floor(stepPos) === 10 || Math.floor(stepPos) === 12)
        : fracBeat < 0.22;
    const kickEnv = kickTrig ? Math.exp(-fracBeat * 18) : 0;
    const kickFreq = 110 * Math.exp(-fracBeat * 24) + 46;
    const kick = Math.sin(2 * Math.PI * kickFreq * fracBeat) * kickEnv * 0.52;

    // Shaker / hi-hat on 16th steps
    const hatEnv = Math.exp(-fracStep * 42);
    const hatNoise = Math.sin(i * 12.9898) * 43758.5453;
    const hat = ((hatNoise - Math.floor(hatNoise)) * 2 - 1) * hatEnv * (Math.floor(stepPos) % 2 === 1 ? 0.14 : 0.08);

    // Log drum / bassline groove
    const chordIdx = Math.floor(t / (beatSec * 4)) % chordRatios.length;
    const bassFreq = rootHz * 0.5 * chordRatios[chordIdx];
    const bassEnv = Math.exp(-(t % (beatSec / 2)) * 5.5);
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * bassEnv * (grooveType === 'amapiano' ? 0.42 : 0.28);

    // Warm chord pad / marimba pluck
    const chordPad =
      (Math.sin(2 * Math.PI * rootHz * chordRatios[chordIdx] * t) +
        0.6 * Math.sin(2 * Math.PI * rootHz * 1.5 * chordRatios[chordIdx] * t)) *
      0.16 *
      (0.55 + 0.45 * Math.exp(-((t % beatSec) * 4)));

    // Fade edges cleanly
    let masterEnv = 1;
    if (t < 0.05) masterEnv = t / 0.05;
    if (t > durationSec - 0.1) masterEnv = (durationSec - t) / 0.1;

    const sample = Math.max(-0.98, Math.min(0.98, (kick + hat + bass + chordPad) * masterEnv));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

function createInitialDb(): MunixDatabase {
  const now = new Date().toISOString();
  const afrobeatPath = path.join(STORAGE_PUBLIC_DIR, 'dj_munix_kigali_pulse_106bpm.wav');
  const gospelPath = path.join(STORAGE_PUBLIC_DIR, 'munix_ai_grace_piano_92bpm.wav');
  const amapianoPath = path.join(STORAGE_PUBLIC_DIR, 'dj_munix_emerald_logdrum_114bpm.wav');
  const rwandanPath = path.join(STORAGE_PUBLIC_DIR, 'traditional_rwandan_groove_122bpm.wav');

  writeSynthesizedWav(afrobeatPath, 106, 220, 'afrobeat');
  writeSynthesizedWav(gospelPath, 92, 261.63, 'gospel');
  writeSynthesizedWav(amapianoPath, 114, 196, 'amapiano');
  writeSynthesizedWav(rwandanPath, 122, 246.94, 'rwandan');

  return {
    profiles: [],
    user_roles: [],
    music_projects: [],
    audio_files: [
      {
        id: 'track-featured-1',
        userId: 'system',
        title: 'Kigali Gold Pulse (Club Mix)',
        artist: 'DJ MUNIX',
        category: 'Afrobeat',
        storagePath: afrobeatPath,
        mimeType: 'audio/wav',
        fileSizeBytes: fs.statSync(afrobeatPath).size,
        durationSec: 16,
        bpm: 106,
        coverUrl: '/src/assets/images/featured_afrobeat_cover_1794905823849.jpg',
        isPublic: true,
        isFeatured: true,
        isPopularMix: true,
        sourceType: 'featured_beat',
        createdAt: now,
      },
      {
        id: 'track-featured-2',
        userId: 'system',
        title: 'Emerald Log Drum Sessions',
        artist: 'DJ MUNIX',
        category: 'Amapiano',
        storagePath: amapianoPath,
        mimeType: 'audio/wav',
        fileSizeBytes: fs.statSync(amapianoPath).size,
        durationSec: 16,
        bpm: 114,
        coverUrl: '/src/assets/images/featured_amapiano_cover_1794905825163.jpg',
        isPublic: true,
        isFeatured: true,
        isPopularMix: true,
        sourceType: 'featured_beat',
        createdAt: now,
      },
      {
        id: 'track-featured-3',
        userId: 'system',
        title: 'Grace & Keys (Kinyarwanda Gospel Beat)',
        artist: 'MUNIX Studio',
        category: 'Gospel',
        storagePath: gospelPath,
        mimeType: 'audio/wav',
        fileSizeBytes: fs.statSync(gospelPath).size,
        durationSec: 16,
        bpm: 92,
        coverUrl: '/src/assets/images/featured_gospel_cover_1794905825204.jpg',
        isPublic: true,
        isFeatured: true,
        isPopularMix: false,
        sourceType: 'featured_beat',
        createdAt: now,
      },
      {
        id: 'track-featured-4',
        userId: 'system',
        title: 'Rwandan Heritage Rhythm 122',
        artist: 'DJ MUNIX',
        category: 'Traditional Rwandan music',
        storagePath: rwandanPath,
        mimeType: 'audio/wav',
        fileSizeBytes: fs.statSync(rwandanPath).size,
        durationSec: 16,
        bpm: 122,
        coverUrl: '/src/assets/images/featured_afrobeat_cover_1794905823849.jpg',
        isPublic: true,
        isFeatured: false,
        isPopularMix: true,
        sourceType: 'featured_beat',
        createdAt: now,
      },
    ],
    generated_music: [],
    voice_profiles: [],
    sound_effects: [
      { id: 'fx-echo', createdBy: null, name: 'Dub Tape Echo', category: 'Time & Space', effectType: 'echo', description: 'Tempo-synced warm feedback delay for smooth transitions.', defaultParams: { delayTime: 0.35, feedback: 0.45, mix: 0.4 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-reverb', createdBy: null, name: 'Cathedral Hall Reverb', category: 'Time & Space', effectType: 'reverb', description: 'Lush studio hall impulse tail for vocals and gospel intros.', defaultParams: { decay: 2.4, mix: 0.38 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-delay', createdBy: null, name: 'Ping-Pong Delay', category: 'Time & Space', effectType: 'delay', description: 'Crisp rhythmic slapback delay for MC hype & drops.', defaultParams: { delayTime: 0.25, feedback: 0.35, mix: 0.35 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-flanger', createdBy: null, name: 'Jet Sweeper Flanger', category: 'Modulation', effectType: 'flanger', description: 'Sweeping comb-filter modulation for EDM and club risers.', defaultParams: { rate: 0.4, depth: 0.004, feedback: 0.5 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-phaser', createdBy: null, name: 'Analog Stage Phaser', category: 'Modulation', effectType: 'phaser', description: 'Warm 4-stage notch sweep for afro-fusion synths.', defaultParams: { rate: 0.6, baseFreq: 800, q: 4 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-filter', createdBy: null, name: 'DJ Sweep Filter', category: 'Filter & EQ', effectType: 'filter', description: 'Resonant lowpass/highpass sweep for deck drops.', defaultParams: { cutoff: 1400, resonance: 6, mode: 'lowpass' }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-chorus', createdBy: null, name: 'Stereo Ensemble Chorus', category: 'Modulation', effectType: 'chorus', description: 'Thickens lead vocals and acoustic guitars.', defaultParams: { rate: 1.5, depth: 0.003, mix: 0.35 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-distortion', createdBy: null, name: 'Tube Saturation Drive', category: 'Dynamics', effectType: 'distortion', description: 'Harmonic analog grit for 808s and log drums.', defaultParams: { drive: 24, mix: 0.3 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-bassboost', createdBy: null, name: 'Sub Bass Boost +9dB', category: 'Filter & EQ', effectType: 'bass_boost', description: 'Tight 75Hz low-shelf punch for club sound systems.', defaultParams: { gainDb: 9, freq: 85 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-voicechanger', createdBy: null, name: 'Studio Pitch Formant', category: 'Voice', effectType: 'voice_changer', description: 'Adjusts pitch rate & presence for MC drops.', defaultParams: { pitchShift: 1.12, clarity: 4 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-djdrop', createdBy: null, name: 'MUNIX Laser Airhorn Drop', category: 'DJ Drops', effectType: 'dj_drop', description: 'Classic club synth horn + sub impact drop.', defaultParams: { gain: 0.85 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
      { id: 'fx-transition', createdBy: null, name: 'White Noise Riser & Impact', category: 'Transitions', effectType: 'transition', description: '4-beat filtered sweep into clean sub drop.', defaultParams: { duration: 1.8 }, audioFileId: null, isGlobal: true, isActive: true, createdAt: now },
    ],
    notifications: [
      {
        id: 'notif-welcome-1',
        userId: null,
        title: 'Welcome to MIX DJ – MUNIX AI',
        message: 'Dual-deck Web Audio mixer, Audio Editing Studio, and Gemini AI Voice & Assistant are live. Install the PWA for offline studio access.',
        kind: 'announcement',
        readBy: [],
        createdAt: now,
      },
    ],
    admin_settings: {
      id: 'global',
      appName: 'MIX DJ – MUNIX AI',
      brandName: 'DJ MUNIX',
      aiStudioName: 'MUNIX AI',
      logoUrl: '/src/assets/images/munix_logo_emblem_1794905823104.jpg',
      heroImageUrl: '/src/assets/images/hero_dj_munix_1794905824293.jpg',
      heroTitle: 'Mix Live. Produce with MUNIX AI.',
      heroSubtitle: 'Two-deck Web Audio DJ console, studio audio editor, vocal & instrument tools, and voice studio engineered for DJ MUNIX.',
      themeAccent: '#10b981',
      themeGold: '#d4af37',
      categories: [
        'Gospel',
        'Afrobeat',
        'Amapiano',
        'Hip-hop',
        'R&B',
        'Dancehall',
        'Reggae',
        'Afro-pop',
        'Traditional Rwandan music',
        'Electronic dance music',
        'Worship',
        'Jazz',
        'Acoustic',
      ],
      enabledSections: {
        featured: true,
        recent: true,
        popular: true,
        aiNew: true,
        categories: true,
        announcements: true,
      },
      aiConfig: {
        musicProvider: (process.env.MUSIC_PROVIDER as 'lyria' | 'replicate' | 'custom') || 'lyria',
        dailyLimit: 25,
        voiceEnabled: true,
        munixVoiceAuthorized: false,
        supportedLanguages: ['Kinyarwanda', 'English', 'French', 'Kiswahili', 'Lingala', 'Luganda'],
      },
      updatedAt: now,
    },
    usage_logs: [],
    audit_logs: [],
  };
}

let cachedDb: MunixDatabase | null = null;

export function getDb(): MunixDatabase {
  ensureDirectories();
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    cachedDb = initial;
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    cachedDb = JSON.parse(raw) as MunixDatabase;
    // Ensure seeded public WAV files exist even if db json existed from prior run
    for (const file of cachedDb.audio_files) {
      if (file.sourceType === 'featured_beat' && !fs.existsSync(file.storagePath)) {
        const fresh = createInitialDb();
        const match = fresh.audio_files.find((f) => f.id === file.id);
        if (match) file.storagePath = match.storagePath;
      }
    }
    return cachedDb;
  } catch {
    const initial = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    cachedDb = initial;
    return cachedDb;
  }
}

export function saveDb(db: MunixDatabase): void {
  ensureDirectories();
  cachedDb = db;
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash: derived, salt: actualSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const hashBuf = Buffer.from(hash, 'hex');
  if (derived.length !== hashBuf.length) return false;
  return crypto.timingSafeEqual(derived, hashBuf);
}

export interface SessionPayload {
  userId: string;
  email: string;
  exp: number;
}

export function signSessionToken(userId: string, email: string, ttlSeconds = 60 * 60 * 24 * 7): string {
  const payload: SessionPayload = {
    userId,
    email,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.userId || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function sanitizeProfile(profile: ProfileRecord, role: UserRole) {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    emailVerified: profile.emailVerified,
    isSuspended: profile.isSuspended,
    role,
    createdAt: profile.createdAt,
  };
}

import 'dotenv/config';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {
  ADMIN_EMAIL,
  type AudioFileRecord,
  getDb,
  hashPassword,
  type MusicProjectRecord,
  type ProfileRecord,
  sanitizeProfile,
  saveDb,
  signSessionToken,
  STORAGE_AUDIO_DIR,
  STORAGE_IMAGES_DIR,
  type UserRole,
  verifyPassword,
  verifySessionToken,
} from './server/db.ts';
import {
  chatWithMunixAssistant,
  generateArrangementBlueprint,
  generateVoiceTTS,
  isGeminiConfigured,
  parseAdminAiCommand,
} from './server/gemini.ts';
import { generateMusicWithProvider, getMusicProviderStatus } from './server/providers/musicProvider.ts';
import { getStemProviderStatus, pollStemSeparation, startStemSeparation } from './server/providers/stemProvider.ts';

interface AuthRequest extends Request {
  authUser?: ProfileRecord;
  authRole?: UserRole;
}

const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORAGE_AUDIO_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.wav';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB
});

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORAGE_IMAGES_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `img_${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('munix_session='));
    if (match) {
      return decodeURIComponent(match.split('=')[1] || '');
    }
  }
  return null;
}

function resolveUserFromRequest(req: AuthRequest): { user: ProfileRecord; role: UserRole } | null {
  const token = extractToken(req);
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const db = getDb();
  const profile = db.profiles.find((p) => p.id === payload.userId);
  if (!profile || profile.isSuspended) return null;
  const roleRec = db.user_roles.find((r) => r.userId === profile.id);
  return { user: profile, role: roleRec?.role || 'user' };
}

function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const resolved = resolveUserFromRequest(req);
  if (resolved) {
    req.authUser = resolved.user;
    req.authRole = resolved.role;
  }
  next();
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const resolved = resolveUserFromRequest(req);
  if (!resolved) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  req.authUser = resolved.user;
  req.authRole = resolved.role;
  next();
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.authUser || req.authRole !== 'admin') {
    return res.status(403).json({ error: 'Administrator privileges required (DJ MUNIX only).' });
  }
  next();
}

function recordUsage(userId: string | null, feature: string, action: string, metadata: Record<string, unknown> = {}) {
  const db = getDb();
  db.usage_logs.unshift({
    id: crypto.randomUUID(),
    userId,
    feature,
    action,
    metadata,
    createdAt: new Date().toISOString(),
  });
  if (db.usage_logs.length > 500) db.usage_logs.length = 500;
  saveDb(db);
}

function recordAudit(
  actorUserId: string | null,
  actorEmail: string,
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown> = {}
) {
  const db = getDb();
  db.audit_logs.unshift({
    id: crypto.randomUUID(),
    actorUserId,
    actorEmail,
    action,
    targetType,
    targetId,
    details,
    createdAt: new Date().toISOString(),
  });
  if (db.audit_logs.length > 500) db.audit_logs.length = 500;
  saveDb(db);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/media/images', express.static(STORAGE_IMAGES_DIR));

  // ---------------- AUTH ROUTES ----------------
  app.post('/api/auth/signup', (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim() || email.split('@')[0] || 'DJ Creator';

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const db = getDb();
    if (db.profiles.some((p) => p.email === email)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const now = new Date().toISOString();
    const { hash, salt } = hashPassword(password);
    const userId = crypto.randomUUID();
    const verificationToken = crypto.randomBytes(16).toString('hex');

    // Grant initial admin role exclusively to configured owner email if no admin exists yet
    const hasExistingAdmin = db.user_roles.some((r) => r.role === 'admin');
    const isInitialOwner = email === ADMIN_EMAIL && !hasExistingAdmin;
    const role: UserRole = isInitialOwner ? 'admin' : 'user';

    const profile: ProfileRecord = {
      id: userId,
      email,
      displayName,
      avatarUrl: null,
      bio: isInitialOwner ? 'Founder & Lead DJ — DJ MUNIX Studio' : 'Music Creator on MIX DJ – MUNIX AI',
      passwordHash: hash,
      passwordSalt: salt,
      emailVerified: isInitialOwner,
      verificationToken: isInitialOwner ? null : verificationToken,
      resetToken: null,
      resetTokenExpiresAt: null,
      isSuspended: false,
      createdAt: now,
      updatedAt: now,
    };

    db.profiles.push(profile);
    db.user_roles.push({
      id: crypto.randomUUID(),
      userId,
      role,
      assignedBy: isInitialOwner ? userId : null,
      createdAt: now,
    });
    saveDb(db);

    if (isInitialOwner) {
      recordAudit(userId, email, 'admin_account_initialized', 'user_roles', userId, { role: 'admin' });
    }
    recordUsage(userId, 'auth', 'signup', { role });

    const token = signSessionToken(userId, email);
    res.cookie('munix_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    return res.status(201).json({
      token,
      user: sanitizeProfile(profile, role),
      verificationPending: !profile.emailVerified,
      verificationToken: profile.verificationToken,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const password = String(req.body?.password || '');

    const db = getDb();
    const profile = db.profiles.find((p) => p.email === email);
    if (!profile || !verifyPassword(password, profile.passwordHash, profile.passwordSalt)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (profile.isSuspended) {
      return res.status(403).json({ error: 'This account has been suspended by the administrator.' });
    }

    const role = db.user_roles.find((r) => r.userId === profile.id)?.role || 'user';
    const token = signSessionToken(profile.id, profile.email);
    recordUsage(profile.id, 'auth', 'login', { role });
    res.cookie('munix_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    return res.json({
      token,
      user: sanitizeProfile(profile, role),
    });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('munix_session');
    return res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    return res.json({ user: sanitizeProfile(req.authUser!, req.authRole!) });
  });

  app.post('/api/auth/verify-email', (req, res) => {
    const token = String(req.body?.token || '').trim();
    const db = getDb();
    const profile = db.profiles.find((p) => p.verificationToken === token);
    if (!profile) {
      return res.status(400).json({ error: 'Invalid or expired verification token.' });
    }
    profile.emailVerified = true;
    profile.verificationToken = null;
    profile.updatedAt = new Date().toISOString();
    saveDb(db);
    const role = db.user_roles.find((r) => r.userId === profile.id)?.role || 'user';
    return res.json({ ok: true, user: sanitizeProfile(profile, role) });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const db = getDb();
    const profile = db.profiles.find((p) => p.email === email);
    if (!profile) {
      return res.json({
        ok: true,
        message: 'If an account matches that email, a password reset code has been generated.',
      });
    }
    const resetToken = crypto.randomBytes(12).toString('hex');
    profile.resetToken = resetToken;
    profile.resetTokenExpiresAt = Date.now() + 30 * 60 * 1000;
    saveDb(db);

    return res.json({
      ok: true,
      message: 'Password reset token generated (valid for 30 minutes).',
      // Returned in preview environment when no SMTP relay is attached
      resetTokenPreview: resetToken,
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const resetToken = String(req.body?.resetToken || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    const db = getDb();
    const profile = db.profiles.find(
      (p) => p.email === email && p.resetToken === resetToken && (p.resetTokenExpiresAt || 0) > Date.now()
    );
    if (!profile) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    const { hash, salt } = hashPassword(newPassword);
    profile.passwordHash = hash;
    profile.passwordSalt = salt;
    profile.resetToken = null;
    profile.resetTokenExpiresAt = null;
    profile.updatedAt = new Date().toISOString();
    saveDb(db);

    recordAudit(profile.id, profile.email, 'password_reset_completed', 'profiles', profile.id);
    return res.json({ ok: true, message: 'Password updated permanently.' });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthRequest, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const db = getDb();
    const profile = db.profiles.find((p) => p.id === req.authUser!.id);
    if (!profile || !verifyPassword(currentPassword, profile.passwordHash, profile.passwordSalt)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const { hash, salt } = hashPassword(newPassword);
    profile.passwordHash = hash;
    profile.passwordSalt = salt;
    profile.updatedAt = new Date().toISOString();
    saveDb(db);

    recordAudit(profile.id, profile.email, 'password_changed', 'profiles', profile.id, { role: req.authRole });
    return res.json({ ok: true, message: 'Password updated permanently.' });
  });

  app.put('/api/profile', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const profile = db.profiles.find((p) => p.id === req.authUser!.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    if (typeof req.body?.displayName === 'string' && req.body.displayName.trim()) {
      profile.displayName = req.body.displayName.trim().slice(0, 60);
    }
    if (typeof req.body?.bio === 'string') {
      profile.bio = req.body.bio.trim().slice(0, 280);
    }
    profile.updatedAt = new Date().toISOString();
    saveDb(db);
    return res.json({ user: sanitizeProfile(profile, req.authRole!) });
  });

  app.post('/api/profile/avatar', requireAuth, uploadImage.single('avatar'), (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
    const db = getDb();
    const profile = db.profiles.find((p) => p.id === req.authUser!.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    profile.avatarUrl = `/media/images/${req.file.filename}`;
    profile.updatedAt = new Date().toISOString();
    saveDb(db);
    return res.json({ user: sanitizeProfile(profile, req.authRole!), avatarUrl: profile.avatarUrl });
  });

  // ---------------- BOOTSTRAP & PUBLIC CATALOG ----------------
  app.get('/api/bootstrap', optionalAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const userId = req.authUser?.id || null;
    const isAdmin = req.authRole === 'admin';

    const publicTracks = db.audio_files.filter((a) => a.isPublic);
    const featuredTracks = publicTracks.filter((a) => a.isFeatured);
    const popularMixes = publicTracks.filter((a) => a.isPopularMix || a.sourceType === 'featured_beat');
    const recentTracks = [...publicTracks]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12);
    const aiNewTracks = db.generated_music
      .filter((g) => g.isPublic && g.status === 'completed')
      .slice(0, 8);

    const announcements = db.notifications
      .filter((n) => n.userId === null && n.kind === 'announcement')
      .slice(0, 6);

    const visibleNotifications = userId
      ? db.notifications
          .filter((n) => n.userId === null || n.userId === userId)
          .slice(0, 20)
          .map((n) => ({ ...n, isRead: n.readBy.includes(userId) }))
      : announcements.map((n) => ({ ...n, isRead: false }));

    const effects = db.sound_effects.filter((e) => (e.isGlobal && e.isActive) || (userId && e.createdBy === userId));

    const userProjects = userId ? db.music_projects.filter((p) => p.userId === userId) : [];
    const userAudioFiles = userId ? db.audio_files.filter((a) => a.userId === userId) : [];
    const userGeneratedMusic = userId ? db.generated_music.filter((g) => g.userId === userId) : [];
    const visibleVoices = db.voice_profiles.filter(
      (v) => v.isPublic || (userId && v.userId === userId) || (isAdmin && v.category === 'dj_munix_authorized')
    );

    const hasAdminAccount = db.user_roles.some((r) => r.role === 'admin');

    return res.json({
      settings: db.admin_settings,
      adminEmailHint: hasAdminAccount ? null : ADMIN_EMAIL,
      user: req.authUser ? sanitizeProfile(req.authUser, req.authRole!) : null,
      featuredTracks,
      popularMixes,
      recentTracks,
      aiNewTracks,
      effects,
      announcements,
      notifications: visibleNotifications,
      projects: userProjects,
      myAudioFiles: userAudioFiles,
      generatedMusic: userGeneratedMusic,
      voiceProfiles: visibleVoices,
      providers: {
        gemini: isGeminiConfigured(),
        music: getMusicProviderStatus(),
        stems: getStemProviderStatus(),
      },
    });
  });

  // ---------------- AUDIO UPLOAD, STREAMING & PRIVACY ----------------
  app.get('/api/audio/:fileId', optionalAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const record = db.audio_files.find((a) => a.id === req.params.fileId);
    if (!record) return res.status(404).json({ error: 'Audio file not found.' });

    const isOwner = req.authUser && record.userId === req.authUser.id;
    const isAdmin = req.authRole === 'admin';
    if (!record.isPublic && !isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Private audio file. Authorization required.' });
    }

    if (!fs.existsSync(record.storagePath)) {
      return res.status(404).json({ error: 'Audio file missing from storage.' });
    }

    const stat = fs.statSync(record.storagePath);
    const range = req.headers.range;
    res.setHeader('Content-Type', record.mimeType || 'audio/wav');
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', chunkSize);
      fs.createReadStream(record.storagePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(record.storagePath).pipe(res);
    }
  });

  app.post('/api/audio/upload', requireAuth, uploadAudio.single('audio'), (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded.' });
    const db = getDb();
    const now = new Date().toISOString();
    const title = String(req.body?.title || path.parse(req.file.originalname).name || 'Untitled Audio').trim();
    const artist = String(req.body?.artist || req.authUser!.displayName).trim();
    const category = String(req.body?.category || 'Afrobeat').trim();
    const bpm = Number(req.body?.bpm) || 120;
    const durationSec = Number(req.body?.durationSec) || 0;
    const sourceType = (req.body?.sourceType || 'upload') as AudioFileRecord['sourceType'];
    const isPublic = req.body?.isPublic === 'true' || req.body?.isPublic === true;

    const audioRec: AudioFileRecord = {
      id: crypto.randomUUID(),
      userId: req.authUser!.id,
      title,
      artist,
      category,
      storagePath: req.file.path,
      mimeType: req.file.mimetype || 'audio/wav',
      fileSizeBytes: req.file.size,
      durationSec,
      bpm,
      coverUrl: null,
      isPublic,
      isFeatured: false,
      sourceType,
      createdAt: now,
    };
    db.audio_files.unshift(audioRec);

    const createProject = req.body?.createProject !== 'false';
    let projectRec: MusicProjectRecord | null = null;
    if (createProject) {
      projectRec = {
        id: crypto.randomUUID(),
        userId: req.authUser!.id,
        title,
        category,
        projectType:
          sourceType === 'recording'
            ? 'dj_mix'
            : sourceType === 'edited'
              ? 'audio_edit'
              : sourceType === 'voice'
                ? 'voice_drop'
                : 'dj_mix',
        bpm,
        durationSec: Math.round(durationSec),
        coverUrl: null,
        audioFileId: audioRec.id,
        metadata: { originalFilename: req.file.originalname },
        isPublic,
        isFeatured: false,
        createdAt: now,
        updatedAt: now,
      };
      db.music_projects.unshift(projectRec);
    }

    saveDb(db);
    recordUsage(req.authUser!.id, 'audio', 'upload', { sourceType, size: req.file.size });
    return res.status(201).json({ audioFile: audioRec, project: projectRec });
  });

  app.delete('/api/audio/:fileId', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const idx = db.audio_files.findIndex((a) => a.id === req.params.fileId);
    if (idx === -1) return res.status(404).json({ error: 'Audio file not found.' });
    const rec = db.audio_files[idx];
    if (rec.userId !== req.authUser!.id && req.authRole !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to delete this audio file.' });
    }
    db.audio_files.splice(idx, 1);
    if (fs.existsSync(rec.storagePath) && !rec.storagePath.includes(`${path.sep}public${path.sep}`)) {
      try {
        fs.unlinkSync(rec.storagePath);
      } catch {
        // ignore file unlink error
      }
    }
    saveDb(db);
    return res.json({ ok: true });
  });

  // ---------------- PROJECTS CRUD ----------------
  app.get('/api/projects', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const list = db.music_projects.filter((p) => p.userId === req.authUser!.id);
    return res.json({ projects: list });
  });

  app.post('/api/projects', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const now = new Date().toISOString();
    const project: MusicProjectRecord = {
      id: crypto.randomUUID(),
      userId: req.authUser!.id,
      title: String(req.body?.title || 'Untitled Project').trim(),
      category: String(req.body?.category || 'Afrobeat'),
      projectType: req.body?.projectType || 'dj_mix',
      bpm: Number(req.body?.bpm) || 120,
      durationSec: Number(req.body?.durationSec) || 0,
      coverUrl: req.body?.coverUrl || null,
      audioFileId: req.body?.audioFileId || null,
      metadata: req.body?.metadata || {},
      isPublic: Boolean(req.body?.isPublic),
      isFeatured: false,
      createdAt: now,
      updatedAt: now,
    };
    db.music_projects.unshift(project);
    saveDb(db);
    return res.status(201).json({ project });
  });

  app.put('/api/projects/:id', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const project = db.music_projects.find((p) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (project.userId !== req.authUser!.id && req.authRole !== 'admin') {
      return res.status(403).json({ error: 'Private project access denied.' });
    }
    if (typeof req.body?.title === 'string' && req.body.title.trim()) {
      project.title = req.body.title.trim();
    }
    if (typeof req.body?.category === 'string') project.category = req.body.category;
    if (typeof req.body?.bpm === 'number') project.bpm = req.body.bpm;
    if (typeof req.body?.isPublic === 'boolean') {
      project.isPublic = req.body.isPublic;
      if (project.audioFileId) {
        const audio = db.audio_files.find((a) => a.id === project.audioFileId);
        if (audio && audio.userId === project.userId) audio.isPublic = req.body.isPublic;
      }
    }
    if (req.body?.metadata && typeof req.body.metadata === 'object') {
      project.metadata = { ...project.metadata, ...req.body.metadata };
    }
    project.updatedAt = new Date().toISOString();
    saveDb(db);
    return res.json({ project });
  });

  app.delete('/api/projects/:id', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const idx = db.music_projects.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Project not found.' });
    const project = db.music_projects[idx];
    if (project.userId !== req.authUser!.id && req.authRole !== 'admin') {
      return res.status(403).json({ error: 'Private project access denied.' });
    }
    db.music_projects.splice(idx, 1);
    saveDb(db);
    return res.json({ ok: true });
  });

  // ---------------- MUNIX AI MUSIC GENERATOR ----------------
  app.get('/api/music/providers', (_req, res) => {
    return res.json(getMusicProviderStatus());
  });

  app.post('/api/music/generate', requireAuth, async (req: AuthRequest, res) => {
    const title = String(req.body?.title || 'MUNIX AI Creation').trim();
    const prompt = String(req.body?.prompt || '').trim();
    const genre = String(req.body?.genre || 'Gospel');
    const mood = String(req.body?.mood || 'Uplifting');
    const language = String(req.body?.language || 'Kinyarwanda');
    const voiceGender = (req.body?.voiceGender || 'female') as 'male' | 'female' | 'none';
    const instrumentalOnly = Boolean(req.body?.instrumentalOnly);
    const durationSec = Math.min(180, Math.max(15, Number(req.body?.durationSec) || 30));
    const lyrics = String(req.body?.lyrics || '');
    const saveAsPublic = Boolean(req.body?.isPublic);

    if (!prompt) {
      return res.status(400).json({ error: 'Please describe the song you want to create.' });
    }

    const db = getDb();
    // Enforce daily AI usage limit from admin_settings
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const userDailyCount = db.usage_logs.filter(
      (l) => l.userId === req.authUser!.id && l.feature === 'munix_ai_music' && l.createdAt.startsWith(todayPrefix)
    ).length;
    if (req.authRole !== 'admin' && userDailyCount >= db.admin_settings.aiConfig.dailyLimit) {
      return res.status(429).json({
        error: `Daily AI generation limit (${db.admin_settings.aiConfig.dailyLimit}) reached.`,
      });
    }

    let arrangement: Record<string, unknown> = {};
    if (isGeminiConfigured()) {
      try {
        arrangement = await generateArrangementBlueprint({
          title,
          prompt,
          genre,
          mood,
          language,
          voiceGender,
          instrumentalOnly,
          lyrics,
        });
      } catch (err) {
        console.error('Blueprint generation error:', err);
      }
    }

    const genResult = await generateMusicWithProvider({
      userId: req.authUser!.id,
      title,
      prompt,
      genre,
      mood,
      language,
      voiceGender,
      instrumentalOnly,
      durationSec,
      lyrics,
      providerOverride: db.admin_settings.aiConfig.musicProvider,
    });

    const now = new Date().toISOString();
    let audioFileRec: AudioFileRecord | null = null;

    if (genResult.status === 'completed' && genResult.storagePath && genResult.audioBuffer) {
      audioFileRec = {
        id: crypto.randomUUID(),
        userId: req.authUser!.id,
        title,
        artist: `${req.authUser!.displayName} × MUNIX AI`,
        category: genre,
        storagePath: genResult.storagePath,
        mimeType: genResult.mimeType || 'audio/mpeg',
        fileSizeBytes: genResult.audioBuffer.length,
        durationSec,
        bpm: Number((arrangement as { bpm?: number }).bpm) || 110,
        coverUrl: '/src/assets/images/featured_gospel_cover_1794905825204.jpg',
        isPublic: saveAsPublic,
        isFeatured: false,
        sourceType: 'ai_music',
        createdAt: now,
      };
      db.audio_files.unshift(audioFileRec);
    }

    const genRecordId = crypto.randomUUID();
    const generatedRecord = {
      id: genRecordId,
      userId: req.authUser!.id,
      title,
      prompt,
      genre,
      mood,
      language,
      voiceGender: instrumentalOnly ? ('none' as const) : voiceGender,
      instrumentalOnly,
      durationSec,
      lyrics: lyrics || String((arrangement as { draftLyrics?: string }).draftLyrics || genResult.generatedLyrics || ''),
      provider: genResult.provider,
      status:
        genResult.status === 'completed'
          ? ('completed' as const)
          : genResult.status === 'provider_required'
            ? ('blueprint_only' as const)
            : ('failed' as const),
      audioFileId: audioFileRec?.id || null,
      arrangementJson: arrangement,
      isPublic: saveAsPublic,
      createdAt: now,
    };

    db.generated_music.unshift(generatedRecord);
    if (audioFileRec) {
      db.music_projects.unshift({
        id: crypto.randomUUID(),
        userId: req.authUser!.id,
        title,
        category: genre,
        projectType: 'ai_song',
        bpm: audioFileRec.bpm,
        durationSec,
        coverUrl: audioFileRec.coverUrl,
        audioFileId: audioFileRec.id,
        metadata: { generatedMusicId: genRecordId, language, mood },
        isPublic: saveAsPublic,
        isFeatured: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    saveDb(db);
    recordUsage(req.authUser!.id, 'munix_ai_music', genResult.status, { genre, language, provider: genResult.provider });

    return res.json({
      result: genResult,
      generatedMusic: generatedRecord,
      audioFile: audioFileRec,
      arrangement,
    });
  });

  // ---------------- VOICE STUDIO (GEMINI TTS + AUTHORIZED DJ MUNIX VOICE) ----------------
  app.post('/api/voice/tts', requireAuth, async (req: AuthRequest, res) => {
    const db = getDb();
    if (!db.admin_settings.aiConfig.voiceEnabled) {
      return res.status(403).json({ error: 'AI Voice synthesis is currently disabled by administrator.' });
    }
    if (!isGeminiConfigured()) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is required in server environment secrets for AI Voice TTS.' });
    }

    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Please enter voice text to synthesize.' });

    const voiceName = (req.body?.voiceName || 'Kore') as 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
    const style = String(req.body?.style || 'Clear studio DJ announcer');
    const language = String(req.body?.language || 'English');
    const expressiveMode = Boolean(req.body?.expressiveMode);
    const saveToLibrary = Boolean(req.body?.saveToLibrary);
    const title = String(req.body?.title || `AI Voice: ${text.slice(0, 28)}`).trim();

    try {
      const tts = await generateVoiceTTS({ text, voiceName, style, language, expressiveMode });
      let audioFile: AudioFileRecord | null = null;
      let voiceProfile = null;

      if (saveToLibrary) {
        const wavBuffer = Buffer.from(tts.base64Wav, 'base64');
        const storagePath = path.join(STORAGE_AUDIO_DIR, `tts_${crypto.randomUUID()}.wav`);
        fs.writeFileSync(storagePath, wavBuffer);
        const now = new Date().toISOString();

        audioFile = {
          id: crypto.randomUUID(),
          userId: req.authUser!.id,
          title,
          artist: `MUNIX AI Voice (${voiceName})`,
          category: 'Voice Drops',
          storagePath,
          mimeType: tts.mimeType,
          fileSizeBytes: wavBuffer.length,
          durationSec: 0,
          bpm: 120,
          coverUrl: null,
          isPublic: false,
          isFeatured: false,
          sourceType: 'voice',
          createdAt: now,
        };
        db.audio_files.unshift(audioFile);

        voiceProfile = {
          id: crypto.randomUUID(),
          userId: req.authUser!.id,
          category: 'ai_voice' as const,
          name: title,
          language,
          voiceTone: `${voiceName} · ${style}`,
          scriptText: text,
          authorizedByOwner: false,
          audioFileId: audioFile.id,
          settings: { voiceName, style, expressiveMode },
          isPublic: false,
          createdAt: now,
        };
        db.voice_profiles.unshift(voiceProfile);
        saveDb(db);
      }

      recordUsage(req.authUser!.id, 'voice_studio', 'tts_generate', { voiceName, language });
      return res.json({
        audioDataUrl: `data:${tts.mimeType};base64,${tts.base64Wav}`,
        mimeType: tts.mimeType,
        audioFile,
        voiceProfile,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate AI speech.';
      return res.status(500).json({ error: msg });
    }
  });

  app.post('/api/voice/recording', requireAuth, uploadAudio.single('audio'), (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No voice recording uploaded.' });
    const db = getDb();
    const category = String(req.body?.category || 'user_recording');
    const authorizedByOwner = req.body?.authorizedByOwner === 'true';

    // Strict protection: official DJ MUNIX voice profile requires admin role + explicit owner authorization
    if (category === 'dj_munix_authorized') {
      if (req.authRole !== 'admin' || !authorizedByOwner) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({
          error: 'Only DJ MUNIX (verified administrator) with explicit owner authorization may publish official DJ MUNIX voice recordings.',
        });
      }
    }

    const now = new Date().toISOString();
    const title = String(req.body?.title || 'Voice Studio Recording').trim();
    const language = String(req.body?.language || 'English');
    const voiceTone = String(req.body?.voiceTone || 'Natural Studio');
    const scriptText = String(req.body?.scriptText || '');
    const isPublic = category === 'dj_munix_authorized' && req.body?.isPublic === 'true';

    const audioFile: AudioFileRecord = {
      id: crypto.randomUUID(),
      userId: req.authUser!.id,
      title,
      artist: category === 'dj_munix_authorized' ? 'DJ MUNIX (Authorized)' : req.authUser!.displayName,
      category: 'Voice Drops',
      storagePath: req.file.path,
      mimeType: req.file.mimetype || 'audio/wav',
      fileSizeBytes: req.file.size,
      durationSec: Number(req.body?.durationSec) || 0,
      bpm: 120,
      coverUrl: null,
      isPublic,
      isFeatured: false,
      sourceType: 'voice',
      createdAt: now,
    };
    db.audio_files.unshift(audioFile);

    const voiceProfile = {
      id: crypto.randomUUID(),
      userId: req.authUser!.id,
      category: category === 'dj_munix_authorized' ? ('dj_munix_authorized' as const) : ('user_recording' as const),
      name: title,
      language,
      voiceTone,
      scriptText,
      authorizedByOwner: category === 'dj_munix_authorized',
      audioFileId: audioFile.id,
      settings: { fx: req.body?.fxSettings ? JSON.parse(String(req.body.fxSettings)) : {} },
      isPublic,
      createdAt: now,
    };
    db.voice_profiles.unshift(voiceProfile);
    saveDb(db);

    if (category === 'dj_munix_authorized') {
      recordAudit(req.authUser!.id, req.authUser!.email, 'dj_munix_voice_uploaded', 'voice_profiles', voiceProfile.id, { title });
    }
    return res.status(201).json({ audioFile, voiceProfile });
  });

  // ---------------- STEM SEPARATOR ----------------
  app.get('/api/stems/status', (_req, res) => {
    return res.json(getStemProviderStatus());
  });

  app.post('/api/stems/separate', requireAuth, uploadMemory.single('audio'), async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'Please select an audio file to separate.' });
    const status = getStemProviderStatus();
    if (!status.configured) {
      return res.status(503).json({
        error: status.message,
        providerRequired: true,
      });
    }
    try {
      const job = await startStemSeparation(req.file.buffer, req.file.mimetype, req.file.originalname);
      recordUsage(req.authUser!.id, 'stem_separator', 'start', { provider: status.provider });
      return res.json({ job });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Stem separation failed.';
      return res.status(500).json({ error: msg });
    }
  });

  app.get('/api/stems/jobs/:jobId', requireAuth, async (req, res) => {
    try {
      const job = await pollStemSeparation(req.params.jobId);
      return res.json({ job });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to check separation status.';
      return res.status(500).json({ error: msg });
    }
  });

  // ---------------- EFFECTS PRESETS ----------------
  app.post('/api/effects/presets', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Effect preset name is required.' });

    const effect = {
      id: crypto.randomUUID(),
      createdBy: req.authUser!.id,
      name,
      category: String(req.body?.category || 'Custom Presets'),
      effectType: String(req.body?.effectType || 'echo'),
      description: String(req.body?.description || 'User saved studio preset'),
      defaultParams: req.body?.defaultParams || {},
      audioFileId: null,
      isGlobal: false,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    db.sound_effects.unshift(effect);
    saveDb(db);
    return res.status(201).json({ effect });
  });

  // ---------------- NOTIFICATIONS & COMMUNITY ----------------
  app.post('/api/notifications/:id/read', requireAuth, (req: AuthRequest, res) => {
    const db = getDb();
    const notif = db.notifications.find((n) => n.id === req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notification not found.' });
    if (!notif.readBy.includes(req.authUser!.id)) {
      notif.readBy.push(req.authUser!.id);
      saveDb(db);
    }
    return res.json({ ok: true });
  });

  app.get('/api/community', (_req, res) => {
    const db = getDb();
    const publicProjects = db.music_projects.filter((p) => p.isPublic).slice(0, 30);
    const publicTracks = db.audio_files.filter((a) => a.isPublic).slice(0, 40);
    const announcements = db.notifications.filter((n) => n.userId === null).slice(0, 10);
    return res.json({ publicProjects, publicTracks, announcements, categories: db.admin_settings.categories });
  });

  // ---------------- MUNIX DJ ASSISTANT ----------------
  app.post('/api/assistant/chat', optionalAuth, async (req: AuthRequest, res) => {
    const message = String(req.body?.message || '').trim();
    const currentPage = String(req.body?.currentPage || 'home');
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!message) return res.status(400).json({ error: 'Please enter a command or question.' });
    if (!isGeminiConfigured()) {
      return res.status(503).json({
        error: 'MUNIX DJ ASSISTANT requires GEMINI_API_KEY in environment secrets.',
      });
    }

    try {
      const response = await chatWithMunixAssistant(message, currentPage, history);
      recordUsage(req.authUser?.id || null, 'assistant', 'chat', {
        navigationTarget: response.navigationTarget,
        hasDeckAction: Boolean(response.deckAction?.command),
      });
      return res.json(response);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Assistant error.';
      return res.status(500).json({ error: msg });
    }
  });

  // ---------------- ADMIN PANEL ROUTES (DJ MUNIX ONLY) ----------------
  app.put('/api/admin/settings', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const db = getDb();
    const s = db.admin_settings;
    const body = req.body || {};

    if (typeof body.appName === 'string' && body.appName.trim()) s.appName = body.appName.trim();
    if (typeof body.brandName === 'string' && body.brandName.trim()) s.brandName = body.brandName.trim();
    if (typeof body.aiStudioName === 'string' && body.aiStudioName.trim()) s.aiStudioName = body.aiStudioName.trim();
    if (typeof body.logoUrl === 'string' && body.logoUrl.trim()) s.logoUrl = body.logoUrl.trim();
    if (typeof body.heroImageUrl === 'string' && body.heroImageUrl.trim()) s.heroImageUrl = body.heroImageUrl.trim();
    if (typeof body.heroTitle === 'string') s.heroTitle = body.heroTitle;
    if (typeof body.heroSubtitle === 'string') s.heroSubtitle = body.heroSubtitle;
    if (typeof body.themeAccent === 'string') s.themeAccent = body.themeAccent;
    if (typeof body.themeGold === 'string') s.themeGold = body.themeGold;
    if (Array.isArray(body.categories)) s.categories = body.categories.map((c: unknown) => String(c).trim()).filter(Boolean);
    if (body.enabledSections && typeof body.enabledSections === 'object') {
      s.enabledSections = { ...s.enabledSections, ...body.enabledSections };
    }
    if (body.aiConfig && typeof body.aiConfig === 'object') {
      s.aiConfig = { ...s.aiConfig, ...body.aiConfig };
    }
    s.updatedAt = new Date().toISOString();
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, 'admin_settings_updated', 'admin_settings', 'global', body);
    return res.json({ settings: s });
  });

  app.post('/api/admin/upload-image', requireAuth, requireAdmin, uploadImage.single('image'), (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
    const url = `/media/images/${req.file.filename}`;
    const target = String(req.body?.target || 'hero');
    const db = getDb();
    if (target === 'hero') db.admin_settings.heroImageUrl = url;
    if (target === 'logo') db.admin_settings.logoUrl = url;
    db.admin_settings.updatedAt = new Date().toISOString();
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, 'admin_image_uploaded', 'admin_settings', target, { url });
    return res.json({ url, settings: db.admin_settings });
  });

  app.post('/api/admin/music', requireAuth, requireAdmin, uploadAudio.single('audio'), (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'Audio file is required.' });
    const db = getDb();
    const now = new Date().toISOString();
    const track: AudioFileRecord = {
      id: crypto.randomUUID(),
      userId: req.authUser!.id,
      title: String(req.body?.title || path.parse(req.file.originalname).name).trim(),
      artist: String(req.body?.artist || 'DJ MUNIX').trim(),
      category: String(req.body?.category || 'Afrobeat').trim(),
      storagePath: req.file.path,
      mimeType: req.file.mimetype || 'audio/wav',
      fileSizeBytes: req.file.size,
      durationSec: Number(req.body?.durationSec) || 0,
      bpm: Number(req.body?.bpm) || 118,
      coverUrl: req.body?.coverUrl || '/src/assets/images/featured_afrobeat_cover_1794905823849.jpg',
      isPublic: true,
      isFeatured: req.body?.isFeatured !== 'false',
      isPopularMix: req.body?.isPopularMix === 'true',
      sourceType: 'featured_beat',
      createdAt: now,
    };
    db.audio_files.unshift(track);
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, 'admin_track_added', 'audio_files', track.id, { title: track.title });
    return res.status(201).json({ track });
  });

  app.put('/api/admin/music/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const db = getDb();
    const track = db.audio_files.find((a) => a.id === req.params.id);
    if (!track) return res.status(404).json({ error: 'Track not found.' });

    if (typeof req.body?.title === 'string') track.title = req.body.title;
    if (typeof req.body?.artist === 'string') track.artist = req.body.artist;
    if (typeof req.body?.category === 'string') track.category = req.body.category;
    if (typeof req.body?.bpm === 'number') track.bpm = req.body.bpm;
    if (typeof req.body?.isFeatured === 'boolean') track.isFeatured = req.body.isFeatured;
    if (typeof req.body?.isPopularMix === 'boolean') track.isPopularMix = req.body.isPopularMix;
    if (typeof req.body?.isPublic === 'boolean') track.isPublic = req.body.isPublic;
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, 'admin_track_updated', 'audio_files', track.id, req.body);
    return res.json({ track });
  });

  app.delete('/api/admin/music/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const db = getDb();
    const idx = db.audio_files.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Track not found.' });
    const removed = db.audio_files.splice(idx, 1)[0];
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, 'admin_track_removed', 'audio_files', removed.id, { title: removed.title });
    return res.json({ ok: true });
  });

  app.post('/api/admin/effects', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const db = getDb();
    const effect = {
      id: crypto.randomUUID(),
      createdBy: req.authUser!.id,
      name: String(req.body?.name || 'New DJ Effect').trim(),
      category: String(req.body?.category || 'Time & Space').trim(),
      effectType: String(req.body?.effectType || 'echo').trim(),
      description: String(req.body?.description || '').trim(),
      defaultParams: req.body?.defaultParams || { mix: 0.4 },
      audioFileId: null,
      isGlobal: true,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    db.sound_effects.unshift(effect);
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, 'admin_effect_created', 'sound_effects', effect.id, { name: effect.name });
    return res.status(201).json({ effect });
  });

  app.put('/api/admin/effects/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const db = getDb();
    const effect = db.sound_effects.find((e) => e.id === req.params.id);
    if (!effect) return res.status(404).json({ error: 'Effect not found.' });
    if (typeof req.body?.name === 'string') effect.name = req.body.name;
    if (typeof req.body?.category === 'string') effect.category = req.body.category;
    if (typeof req.body?.description === 'string') effect.description = req.body.description;
    if (typeof req.body?.isActive === 'boolean') effect.isActive = req.body.isActive;
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, 'admin_effect_updated', 'sound_effects', effect.id, req.body);
    return res.json({ effect });
  });

  app.delete('/api/admin/effects/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const db = getDb();
    const idx = db.sound_effects.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Effect not found.' });
    const removed = db.sound_effects.splice(idx, 1)[0];
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, 'admin_effect_deleted', 'sound_effects', removed.id, { name: removed.name });
    return res.json({ ok: true });
  });

  app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
    const db = getDb();
    const users = db.profiles.map((p) => {
      const role = db.user_roles.find((r) => r.userId === p.id)?.role || 'user';
      return sanitizeProfile(p, role);
    });
    return res.json({ users });
  });

  app.put('/api/admin/users/:id', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const db = getDb();
    const profile = db.profiles.find((p) => p.id === req.params.id);
    if (!profile) return res.status(404).json({ error: 'User not found.' });

    if (typeof req.body?.isSuspended === 'boolean') {
      if (profile.id === req.authUser!.id && req.body.isSuspended) {
        return res.status(400).json({ error: 'You cannot suspend your own admin account.' });
      }
      profile.isSuspended = req.body.isSuspended;
    }

    if (req.body?.role && ['user', 'moderator', 'admin'].includes(req.body.role)) {
      const roleRec = db.user_roles.find((r) => r.userId === profile.id);
      if (roleRec) {
        roleRec.role = req.body.role;
        roleRec.assignedBy = req.authUser!.id;
      }
    }
    profile.updatedAt = new Date().toISOString();
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, 'admin_user_updated', 'profiles', profile.id, req.body);
    const role = db.user_roles.find((r) => r.userId === profile.id)?.role || 'user';
    return res.json({ user: sanitizeProfile(profile, role) });
  });

  app.post('/api/admin/notifications', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const db = getDb();
    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    const kind = (req.body?.kind || 'announcement') as 'announcement' | 'system' | 'music' | 'admin';
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required.' });
    }
    const notif = {
      id: crypto.randomUUID(),
      userId: req.body?.userId || null,
      title,
      message,
      kind,
      readBy: [],
      createdAt: new Date().toISOString(),
    };
    db.notifications.unshift(notif);
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, 'admin_notification_sent', 'notifications', notif.id, { title, kind });
    return res.status(201).json({ notification: notif });
  });

  app.get('/api/admin/logs', requireAuth, requireAdmin, (_req, res) => {
    const db = getDb();
    return res.json({
      auditLogs: db.audit_logs.slice(0, 100),
      usageLogs: db.usage_logs.slice(0, 100),
      stats: {
        totalUsers: db.profiles.length,
        totalAudioFiles: db.audio_files.length,
        totalProjects: db.music_projects.length,
        totalAiGenerations: db.generated_music.length,
      },
    });
  });

  // ---------------- ADMIN AI CONTROL ----------------
  app.post('/api/admin/ai-command', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    const command = String(req.body?.command || '').trim();
    if (!command) return res.status(400).json({ error: 'Enter an administrative command.' });
    if (!isGeminiConfigured()) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is required for Admin AI Control.' });
    }
    try {
      const db = getDb();
      const preview = await parseAdminAiCommand(command, db.admin_settings.categories);
      return res.json({ preview });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Admin AI parse error.';
      return res.status(500).json({ error: msg });
    }
  });

  app.post('/api/admin/ai-execute', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const { actionType, payload, confirmed } = req.body || {};
    if (!confirmed) {
      return res.status(400).json({ error: 'Explicit administrator confirmation is required before execution.' });
    }

    const db = getDb();
    let resultMessage = '';

    switch (actionType) {
      case 'update_hero_text': {
        if (payload?.heroTitle) db.admin_settings.heroTitle = String(payload.heroTitle);
        if (payload?.heroSubtitle) db.admin_settings.heroSubtitle = String(payload.heroSubtitle);
        resultMessage = 'Homepage hero copy updated.';
        break;
      }
      case 'add_category': {
        const cat = String(payload?.category || '').trim();
        if (cat && !db.admin_settings.categories.includes(cat)) {
          db.admin_settings.categories.push(cat);
          resultMessage = `Added category "${cat}".`;
        } else {
          resultMessage = `Category "${cat}" already exists.`;
        }
        break;
      }
      case 'set_theme_colors': {
        if (payload?.themeAccent) db.admin_settings.themeAccent = String(payload.themeAccent);
        if (payload?.themeGold) db.admin_settings.themeGold = String(payload.themeGold);
        resultMessage = 'Application theme colors updated.';
        break;
      }
      case 'create_effect': {
        db.sound_effects.unshift({
          id: crypto.randomUUID(),
          createdBy: req.authUser!.id,
          name: String(payload?.name || 'AI Created Effect'),
          category: String(payload?.category || 'Custom FX'),
          effectType: String(payload?.effectType || 'echo'),
          description: String(payload?.description || 'Created via Admin AI Control'),
          defaultParams: { mix: 0.4 },
          audioFileId: null,
          isGlobal: true,
          isActive: true,
          createdAt: new Date().toISOString(),
        });
        resultMessage = `Created new DJ effect "${payload?.name}".`;
        break;
      }
      case 'publish_announcement': {
        db.notifications.unshift({
          id: crypto.randomUUID(),
          userId: null,
          title: String(payload?.title || 'DJ MUNIX Announcement'),
          message: String(payload?.message || ''),
          kind: 'announcement',
          readBy: [],
          createdAt: new Date().toISOString(),
        });
        resultMessage = 'Published new broadcast announcement.';
        break;
      }
      case 'toggle_featured': {
        const trackTitle = String(payload?.trackTitle || '').toLowerCase();
        const track = db.audio_files.find((a) => a.title.toLowerCase().includes(trackTitle));
        if (!track) return res.status(404).json({ error: `Track matching "${payload?.trackTitle}" not found.` });
        track.isFeatured = Boolean(payload?.isFeatured);
        resultMessage = `${track.title} featured state set to ${track.isFeatured}.`;
        break;
      }
      default:
        return res.status(400).json({ error: 'This command requires manual action or file upload in the Admin Panel.' });
    }

    db.admin_settings.updatedAt = new Date().toISOString();
    saveDb(db);
    recordAudit(req.authUser!.id, req.authUser!.email, `admin_ai_${actionType}`, 'admin_ai_control', null, payload || {});
    return res.json({ ok: true, message: resultMessage, settings: db.admin_settings });
  });

  // ---------------- VITE OR STATIC SERVING ----------------
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`MIX DJ – MUNIX AI server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

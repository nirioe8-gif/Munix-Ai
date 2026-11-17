# MIX DJ – MUNIX AI — Setup, API Integration, Testing & Deployment Guide

## 1. Architecture Overview
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + `vite-plugin-pwa` (installable PWA on Android, iOS Safari, Windows, Mac, and tablets).
- **Audio Processing Engine**: Web Audio API (`DualDeckAudioEngine`, `OfflineAudioContext`, `BiquadFilterNode`, `ConvolverNode`, `DelayNode`, `WaveShaperNode`, `AnalyserNode`, `MediaRecorder` + lossless PCM WAV encoder).
- **Backend**: Express (`server.ts`) with scrypt password hashing, HMAC-SHA256 session tokens, server-side RBAC, private-by-default audio streaming, and persistent 11-table relational store (`data/munix-db.json` + `data/storage/`).
- **PostgreSQL / Supabase Schema**: Production SQL schema & Row Level Security (RLS) policies provided in `database/schema.sql`.

## 2. Required & Optional Environment Variables
See `.env.example`:
- `GEMINI_API_KEY`: Required for **MUNIX DJ ASSISTANT** (`gemini-4-hydrogen`), **Admin AI Control** (`gemini-4-hydrogen`), **AI Voices TTS** (`gemini-3.8-flash-lite-tts` / `gemini-3.8-flash-tts`), and **Lyria** music generation (paid tier key).
- `SESSION_SECRET`: Strong random secret for signing user authentication session tokens.
- `ADMIN_EMAIL`: Owner email address granted initial administrator role upon first signup (default: `nirioe8@gmail.com`).
- `MUSIC_PROVIDER`: `'lyria' | 'replicate' | 'custom'` (default: `'lyria'`).
- `MUSIC_API_KEY` & `MUSIC_API_URL`: Optional external REST music provider credentials.
- `REPLICATE_API_TOKEN`: Optional Replicate token for MusicGen and Demucs 4-stem separation.
- `STEM_API_URL` & `STEM_API_KEY`: Optional dedicated Demucs/Spleeter stem separation endpoint.

## 3. External Services & APIs Requiring Keys / Setup
1. **AI Music Audio Synthesis (`MUNIX AI`)**:
   - Uses a pluggable provider layer (`server/providers/musicProvider.ts`).
   - Full audio synthesis requires either a billing-enabled `GEMINI_API_KEY` (for Lyria), `REPLICATE_API_TOKEN`, or `MUSIC_API_URL` + `MUSIC_API_KEY`.
   - When no paid music synthesis key is configured, the app displays a clear setup notice and still generates structured AI arrangement blueprints without faking audio.
2. **Vocal & Instrument Separation (`STEM SEPARATOR`)**:
   - Uses `server/providers/stemProvider.ts`.
   - Requires `REPLICATE_API_TOKEN` (Demucs) or a dedicated `STEM_API_URL` + `STEM_API_KEY` service. Never fabricates fake stems.
3. **DJ MUNIX Voice Drops**:
   - Official DJ MUNIX voice recordings require administrator role + explicit owner authorization check before publishing.

## 4. Database Setup (PostgreSQL / Supabase)
Run `database/schema.sql` in your Supabase SQL Editor or PostgreSQL database to provision all 11 tables (`profiles`, `user_roles`, `music_projects`, `audio_files`, `generated_music`, `voice_profiles`, `sound_effects`, `notifications`, `admin_settings`, `usage_logs`, `audit_logs`) with Row Level Security policies.

## 5. Testing Checklist
- Run `npm run lint` (`tsc --noEmit`) and `npm run build` (`vite build`).
- Verify registration, login, forgot/reset password, and permanent password change in **Settings**.
- Verify non-admin users receive `403` on `/api/admin/*` and cannot access private audio files of other users.
- Test Deck A & Deck B playback, 3-band EQ, pitch/BPM, cue, loop, crossfader, and mix recording/export in **DJ Studio**.
- Test Trim, Cut, Split, Join, Fade, Speed, Pitch, Effects, and WAV Export in **My Music → Audio Editor**.
- Test **Install App** button on Chrome/Edge/Android and Safari iOS **Add to Home Screen**.

## 6. Deployment
```bash
npm install
npm run build
NODE_ENV=production npm start
```
Ensure `PORT=3000` (or reverse-proxy port 3000) and all production secrets are configured in your hosting environment.

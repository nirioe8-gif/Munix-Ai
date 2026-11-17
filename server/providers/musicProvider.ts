import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { STORAGE_AUDIO_DIR } from '../db.ts';

export interface MusicGenerationRequest {
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
  providerOverride?: 'lyria' | 'replicate' | 'custom';
}

export interface MusicGenerationResult {
  status: 'completed' | 'provider_required' | 'failed';
  provider: string;
  audioBuffer?: Buffer;
  mimeType?: string;
  generatedLyrics?: string;
  storagePath?: string;
  message: string;
  setupInstructions?: string[];
}

export function getMusicProviderStatus() {
  const activeProvider = (process.env.MUSIC_PROVIDER || 'lyria').toLowerCase();
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  const hasReplicate = Boolean(process.env.REPLICATE_API_TOKEN);
  const hasCustom = Boolean(process.env.MUSIC_API_URL && process.env.MUSIC_API_KEY);

  return {
    activeProvider,
    providers: [
      {
        id: 'lyria',
        name: 'Google Lyria (lyria-3-clip-preview / lyria-3-pro-preview)',
        configured: hasGeminiKey,
        note: hasGeminiKey
          ? 'GEMINI_API_KEY detected. Requires a billing-enabled (paid) API key for Lyria audio synthesis.'
          : 'Set GEMINI_API_KEY (paid tier) to synthesize music tracks via Lyria.',
      },
      {
        id: 'replicate',
        name: 'Replicate MusicGen / AudioCraft',
        configured: hasReplicate,
        note: hasReplicate
          ? 'REPLICATE_API_TOKEN detected.'
          : 'Set REPLICATE_API_TOKEN in environment variables to enable Replicate MusicGen.',
      },
      {
        id: 'custom',
        name: 'Custom Music Provider REST Adapter',
        configured: hasCustom,
        note: hasCustom
          ? 'Custom MUSIC_API_URL and MUSIC_API_KEY configured.'
          : 'Set MUSIC_API_URL and MUSIC_API_KEY to connect Suno/Udio/custom music generation endpoints.',
      },
    ],
  };
}

export async function generateMusicWithProvider(req: MusicGenerationRequest): Promise<MusicGenerationResult> {
  const provider = (req.providerOverride || process.env.MUSIC_PROVIDER || 'lyria').toLowerCase();
  const fullPrompt = [
    `Title: ${req.title}`,
    `Genre: ${req.genre}`,
    `Mood: ${req.mood}`,
    `Language: ${req.language}`,
    req.instrumentalOnly ? 'Instrumental only, no vocals.' : `Include ${req.voiceGender} vocals.`,
    `Target duration: ~${req.durationSec}s.`,
    `Description: ${req.prompt}`,
    req.lyrics ? `Lyrics:\n${req.lyrics}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (provider === 'custom') {
    const apiUrl = process.env.MUSIC_API_URL;
    const apiKey = process.env.MUSIC_API_KEY;
    if (!apiUrl || !apiKey) {
      return {
        status: 'provider_required',
        provider: 'custom',
        message: 'Custom music provider selected, but MUSIC_API_URL and MUSIC_API_KEY are not configured.',
        setupInstructions: [
          'Set MUSIC_API_URL to your music generation REST endpoint.',
          'Set MUSIC_API_KEY in server environment secrets.',
        ],
      };
    }
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        title: req.title,
        prompt: fullPrompt,
        genre: req.genre,
        mood: req.mood,
        language: req.language,
        instrumental: req.instrumentalOnly,
        duration: req.durationSec,
        lyrics: req.lyrics,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return {
        status: 'failed',
        provider: 'custom',
        message: `Music provider returned HTTP ${resp.status}: ${errText.slice(0, 240)}`,
      };
    }
    const contentType = resp.headers.get('content-type') || 'audio/mpeg';
    const arrayBuf = await resp.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuf);
    const fileName = `ai_${crypto.randomUUID()}.mp3`;
    const storagePath = path.join(STORAGE_AUDIO_DIR, fileName);
    fs.writeFileSync(storagePath, audioBuffer);
    return {
      status: 'completed',
      provider: 'custom',
      audioBuffer,
      mimeType: contentType,
      storagePath,
      message: 'Track generated via configured music provider.',
    };
  }

  if (provider === 'replicate') {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return {
        status: 'provider_required',
        provider: 'replicate',
        message: 'Replicate MusicGen requires REPLICATE_API_TOKEN in server environment variables.',
        setupInstructions: [
          'Add REPLICATE_API_TOKEN to your environment secrets.',
          'Restart the server and retry generation.',
        ],
      };
    }
    const createResp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: '671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
        input: {
          prompt: fullPrompt,
          duration: Math.min(30, Math.max(8, req.durationSec)),
          output_format: 'mp3',
        },
      }),
    });
    if (!createResp.ok) {
      return {
        status: 'failed',
        provider: 'replicate',
        message: `Replicate API error (${createResp.status}). Verify REPLICATE_API_TOKEN and billing.`,
      };
    }
    const pred = (await createResp.json()) as { id: string; urls?: { get: string } };
    let outputUrl: string | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(pred.urls?.get || `https://api.replicate.com/v1/predictions/${pred.id}`, {
        headers: { Authorization: `Token ${token}` },
      });
      const data = (await poll.json()) as { status: string; output?: string | string[]; error?: string };
      if (data.status === 'succeeded') {
        outputUrl = Array.isArray(data.output) ? data.output[0] : data.output || null;
        break;
      }
      if (data.status === 'failed' || data.status === 'canceled') {
        return {
          status: 'failed',
          provider: 'replicate',
          message: data.error || 'Music generation job failed on Replicate.',
        };
      }
    }
    if (!outputUrl) {
      return { status: 'failed', provider: 'replicate', message: 'Replicate generation timed out.' };
    }
    const audioRes = await fetch(outputUrl);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const storagePath = path.join(STORAGE_AUDIO_DIR, `ai_${crypto.randomUUID()}.mp3`);
    fs.writeFileSync(storagePath, audioBuffer);
    return {
      status: 'completed',
      provider: 'replicate-musicgen',
      audioBuffer,
      mimeType: 'audio/mpeg',
      storagePath,
      message: 'Track generated via Replicate MusicGen.',
    };
  }

  // Default: Lyria via @google/genai
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      status: 'provider_required',
      provider: 'lyria',
      message: 'No music-generation API key is configured. Add a paid GEMINI_API_KEY (for Lyria), REPLICATE_API_TOKEN, or MUSIC_API_KEY.',
      setupInstructions: [
        'Configure a billing-enabled GEMINI_API_KEY in AI Studio Settings > Secrets for Lyria audio generation, OR',
        'Set REPLICATE_API_TOKEN / MUSIC_API_URL + MUSIC_API_KEY to connect an external music provider.',
      ],
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const model = req.durationSec > 35 ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
    const response = await ai.models.generateContentStream({
      model,
      contents: fullPrompt,
    });

    const audioChunks: Buffer[] = [];
    let generatedLyrics = '';
    let mimeType = 'audio/mpeg';

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (audioChunks.length === 0 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
        }
        if (part.text) {
          generatedLyrics += part.text;
        }
      }
    }

    if (audioChunks.length === 0) {
      return {
        status: 'provider_required',
        provider: model,
        message: 'Lyria returned no audio stream. A billing-enabled Gemini API key or external music provider key is required for audio synthesis.',
        setupInstructions: [
          'Verify your GEMINI_API_KEY has billing enabled for Lyria models, or configure REPLICATE_API_TOKEN / MUSIC_API_KEY.',
        ],
      };
    }

    const audioBuffer = Buffer.concat(audioChunks);
    const ext = mimeType.includes('wav') ? 'wav' : 'mp3';
    const storagePath = path.join(STORAGE_AUDIO_DIR, `lyria_${crypto.randomUUID()}.${ext}`);
    fs.writeFileSync(storagePath, audioBuffer);

    return {
      status: 'completed',
      provider: model,
      audioBuffer,
      mimeType,
      generatedLyrics,
      storagePath,
      message: `Full audio synthesized via ${model}.`,
    };
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const isQuotaOrPaid =
      rawMsg.includes('403') ||
      rawMsg.includes('429') ||
      rawMsg.includes('404') ||
      rawMsg.toLowerCase().includes('billing') ||
      rawMsg.toLowerCase().includes('permission') ||
      rawMsg.toLowerCase().includes('not found');
    return {
      status: isQuotaOrPaid ? 'provider_required' : 'failed',
      provider: 'lyria',
      message: isQuotaOrPaid
        ? 'Audio synthesis via Lyria requires a paid/billing-enabled GEMINI_API_KEY or an external music provider (REPLICATE_API_TOKEN / MUSIC_API_KEY). An AI production blueprint was still created for your project.'
        : `Music provider error: ${rawMsg}`,
      setupInstructions: [
        'Enable billing on your Gemini API key in Settings > Secrets for Lyria audio output, OR',
        'Set MUSIC_PROVIDER=replicate with REPLICATE_API_TOKEN, OR',
        'Set MUSIC_PROVIDER=custom with MUSIC_API_URL and MUSIC_API_KEY.',
      ],
    };
  }
}

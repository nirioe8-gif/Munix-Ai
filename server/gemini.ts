import { GoogleGenAI, Type } from '@google/genai';

function createClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 0 && key !== 'MY_GEMINI_API_KEY');
}

export interface AssistantActionResponse {
  reply: string;
  navigationTarget: string | null;
  deckAction: {
    deck: 'A' | 'B' | 'MASTER' | null;
    command: 'play' | 'pause' | 'add_echo' | 'reduce_bass' | 'slower' | 'faster' | 'reset_eq' | null;
  } | null;
  requiresConfirmation: boolean;
  confirmationPrompt: string | null;
  suggestedMusicPrompt: string | null;
}

export async function chatWithMunixAssistant(
  message: string,
  currentPage: string,
  history: Array<{ role: 'user' | 'assistant'; text: string }>
): Promise<AssistantActionResponse> {
  const ai = createClient();

  const contextLines = history
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'User' : 'MUNIX Assistant'}: ${h.text}`)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `${contextLines ? `Recent conversation:\n${contextLines}\n\n` : ''}Current Page: ${currentPage}\nUser Request: ${message}`,
    config: {
      systemInstruction: `You are MUNIX DJ ASSISTANT inside MIX DJ – MUNIX AI (brand: DJ MUNIX, AI studio: MUNIX AI).
Help DJs, producers, and singers operate the studio cleanly and concisely.
Available pages for navigationTarget: 'home', 'studio', 'ai', 'voice', 'mymusic', 'effects', 'community', 'settings', 'admin'.
Available deckAction commands: 'play', 'pause', 'add_echo', 'reduce_bass', 'slower', 'faster', 'reset_eq' on deck 'A', 'B', or 'MASTER'.
If the user asks to open a page (e.g. "Open DJ Studio", "Show my saved projects", "Open Voice Studio"), set navigationTarget accordingly.
If the user asks to create/generate music (e.g. "Create an Afrobeat beat"), set navigationTarget to 'ai' and populate suggestedMusicPrompt.
If the user asks to change deck sound ("Add echo", "Reduce the bass", "Make the music slower"), set deckAction appropriately.
If the user requests deleting or overwriting important data, set requiresConfirmation to true and provide confirmationPrompt.
Keep replies practical, concise, and musical.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING, description: 'Clear conversational response to the user.' },
          navigationTarget: {
            type: Type.STRING,
            nullable: true,
            description: "One of 'home','studio','ai','voice','mymusic','effects','community','settings','admin' or null.",
          },
          deckAction: {
            type: Type.OBJECT,
            nullable: true,
            properties: {
              deck: { type: Type.STRING, nullable: true },
              command: { type: Type.STRING, nullable: true },
            },
          },
          requiresConfirmation: { type: Type.BOOLEAN },
          confirmationPrompt: { type: Type.STRING, nullable: true },
          suggestedMusicPrompt: { type: Type.STRING, nullable: true },
        },
        required: ['reply', 'requiresConfirmation'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as AssistantActionResponse;
  return {
    reply: parsed.reply || 'Ready in the studio.',
    navigationTarget: parsed.navigationTarget ?? null,
    deckAction: parsed.deckAction ?? null,
    requiresConfirmation: Boolean(parsed.requiresConfirmation),
    confirmationPrompt: parsed.confirmationPrompt ?? null,
    suggestedMusicPrompt: parsed.suggestedMusicPrompt ?? null,
  };
}

export interface AdminAiPreview {
  summary: string;
  actionType:
    | 'update_hero_text'
    | 'add_category'
    | 'set_theme_colors'
    | 'create_effect'
    | 'publish_announcement'
    | 'toggle_featured'
    | 'unsupported';
  requiresConfirmation: boolean;
  payload: Record<string, string | boolean | number>;
}

export async function parseAdminAiCommand(command: string, currentCategories: string[]): Promise<AdminAiPreview> {
  const ai = createClient();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Admin command: "${command}"\nExisting categories: ${currentCategories.join(', ')}`,
    config: {
      systemInstruction: `You are Admin AI Control inside MIX DJ – MUNIX AI.
Convert the verified administrator's natural-language command into a structured action preview.
Supported actionType values:
- 'update_hero_text': payload { heroTitle, heroSubtitle }
- 'add_category': payload { category }
- 'set_theme_colors': payload { themeAccent, themeGold } (hex colors)
- 'create_effect': payload { name, category, effectType, description }
- 'publish_announcement': payload { title, message }
- 'toggle_featured': payload { trackTitle, isFeatured }
- 'unsupported': when the request requires a file upload from disk or cannot be executed safely.
Always set requiresConfirmation: true so the administrator explicitly reviews and confirms before execution.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          actionType: { type: Type.STRING },
          requiresConfirmation: { type: Type.BOOLEAN },
          payload: {
            type: Type.OBJECT,
            properties: {
              heroTitle: { type: Type.STRING },
              heroSubtitle: { type: Type.STRING },
              category: { type: Type.STRING },
              themeAccent: { type: Type.STRING },
              themeGold: { type: Type.STRING },
              name: { type: Type.STRING },
              effectType: { type: Type.STRING },
              description: { type: Type.STRING },
              title: { type: Type.STRING },
              message: { type: Type.STRING },
              trackTitle: { type: Type.STRING },
              isFeatured: { type: Type.BOOLEAN },
            },
          },
        },
        required: ['summary', 'actionType', 'requiresConfirmation', 'payload'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as AdminAiPreview;
  return {
    summary: parsed.summary || 'Action prepared for review.',
    actionType: parsed.actionType || 'unsupported',
    requiresConfirmation: true,
    payload: parsed.payload || {},
  };
}

export async function generateArrangementBlueprint(params: {
  title: string;
  prompt: string;
  genre: string;
  mood: string;
  language: string;
  voiceGender: string;
  instrumentalOnly: boolean;
  lyrics: string;
}) {
  const ai = createClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Create a structured production arrangement sheet for:
Title: ${params.title || 'Untitled MUNIX Track'}
Prompt: ${params.prompt}
Genre: ${params.genre}
Mood: ${params.mood}
Language: ${params.language}
Vocal: ${params.instrumentalOnly ? 'Instrumental Only' : `${params.voiceGender} vocal`}
Original Lyrics provided: ${params.lyrics || '(none - please draft original chorus/verse ideas)'}`,
    config: {
      systemInstruction:
        'You are a music producer in MUNIX AI Studio. Return a concise production blueprint JSON with BPM, musical key, instrumentation list, song structure sections, and lyrical hook suggestions in the requested language. Do NOT claim that this blueprint is an audio file.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          bpm: { type: Type.INTEGER },
          musicalKey: { type: Type.STRING },
          instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                bars: { type: Type.INTEGER },
                notes: { type: Type.STRING },
              },
            },
          },
          draftLyrics: { type: Type.STRING },
        },
        required: ['bpm', 'musicalKey', 'instruments', 'sections', 'draftLyrics'],
      },
    },
  });

  return JSON.parse((response.text ?? '{}').trim()) as {
    bpm: number;
    musicalKey: string;
    instruments: string[];
    sections: Array<{ name: string; bars: number; notes: string }>;
    draftLyrics: string;
  };
}

export async function generateVoiceTTS(params: {
  text: string;
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  style: string;
  language: string;
  expressiveMode?: boolean;
}): Promise<{ base64Wav: string; mimeType: string }> {
  const ai = createClient();
  const model = params.expressiveMode ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: params.text,
            speechMetadata: {
              style: `${params.style} in ${params.language}`,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: params.voiceName },
        },
      },
    },
  });

  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) {
    throw new Error('TTS model did not return audio data.');
  }
  return {
    base64Wav: inline.data,
    mimeType: inline.mimeType || 'audio/wav',
  };
}

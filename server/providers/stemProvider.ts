export interface StemProviderStatus {
  configured: boolean;
  provider: 'replicate-demucs' | 'custom-stem-api' | 'unconfigured';
  message: string;
}

export interface StemSeparationJob {
  id: string;
  provider: string;
  status: 'processing' | 'succeeded' | 'failed';
  progress: number;
  stems?: {
    vocals?: string;
    drums?: string;
    bass?: string;
    other?: string;
    instrumental?: string;
  };
  error?: string;
}

export function getStemProviderStatus(): StemProviderStatus {
  if (process.env.STEM_API_URL && process.env.STEM_API_KEY) {
    return {
      configured: true,
      provider: 'custom-stem-api',
      message: 'Connected to dedicated stem separation backend (STEM_API_URL).',
    };
  }
  if (process.env.REPLICATE_API_TOKEN) {
    return {
      configured: true,
      provider: 'replicate-demucs',
      message: 'Connected to Replicate Demucs 4-stem separation model.',
    };
  }
  return {
    configured: false,
    provider: 'unconfigured',
    message:
      'No real audio-separation provider is configured. Set REPLICATE_API_TOKEN (for Demucs) or STEM_API_URL + STEM_API_KEY on the server to separate Vocals, Drums, Bass, and Other stems.',
  };
}

export async function startStemSeparation(audioBuffer: Buffer, mimeType: string, fileName: string): Promise<StemSeparationJob> {
  const customUrl = process.env.STEM_API_URL;
  const customKey = process.env.STEM_API_KEY;
  if (customUrl && customKey) {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType || 'audio/wav' });
    form.append('file', blob, fileName);

    const res = await fetch(customUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customKey}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Stem separation backend returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as StemSeparationJob;
    return data;
  }

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) {
    throw new Error(
      'STEM_PROVIDER_UNCONFIGURED: Connect REPLICATE_API_TOKEN or STEM_API_URL + STEM_API_KEY in server environment variables to run real stem separation.'
    );
  }

  const base64Audio = `data:${mimeType || 'audio/mpeg'};base64,${audioBuffer.toString('base64')}`;
  const resp = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${replicateToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // Demucs v4 stem separation model on Replicate
      version: '25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953',
      input: {
        audio: base64Audio,
        stem: 'none',
        output_format: 'mp3',
      },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Replicate Demucs error (${resp.status}): ${txt.slice(0, 200)}`);
  }

  const pred = (await resp.json()) as { id: string; status: string };
  return {
    id: pred.id,
    provider: 'replicate-demucs',
    status: 'processing',
    progress: 15,
  };
}

export async function pollStemSeparation(jobId: string): Promise<StemSeparationJob> {
  const customUrl = process.env.STEM_API_URL;
  const customKey = process.env.STEM_API_KEY;
  if (customUrl && customKey) {
    const res = await fetch(`${customUrl.replace(/\/$/, '')}/${jobId}`, {
      headers: { Authorization: `Bearer ${customKey}` },
    });
    if (!res.ok) {
      throw new Error(`Stem job poll failed (${res.status})`);
    }
    return (await res.json()) as StemSeparationJob;
  }

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) {
    throw new Error('REPLICATE_API_TOKEN is missing.');
  }

  const res = await fetch(`https://api.replicate.com/v1/predictions/${jobId}`, {
    headers: { Authorization: `Token ${replicateToken}` },
  });
  if (!res.ok) {
    throw new Error(`Replicate poll failed (${res.status})`);
  }

  const data = (await res.json()) as {
    id: string;
    status: string;
    output?: Record<string, string>;
    error?: string;
  };

  if (data.status === 'succeeded' && data.output) {
    return {
      id: data.id,
      provider: 'replicate-demucs',
      status: 'succeeded',
      progress: 100,
      stems: {
        vocals: data.output.vocals,
        drums: data.output.drums,
        bass: data.output.bass,
        other: data.output.other,
        instrumental: data.output.no_vocals || data.output.other,
      },
    };
  }

  if (data.status === 'failed' || data.status === 'canceled') {
    return {
      id: data.id,
      provider: 'replicate-demucs',
      status: 'failed',
      progress: 0,
      error: data.error || 'Separation job failed.',
    };
  }

  return {
    id: data.id,
    provider: 'replicate-demucs',
    status: 'processing',
    progress: data.status === 'processing' ? 55 : 25,
  };
}

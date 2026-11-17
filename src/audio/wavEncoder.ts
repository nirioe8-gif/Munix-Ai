export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export function createImpulseResponse(ctx: BaseAudioContext, durationSec = 2.0, decay = 2.5): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * durationSec);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

export function createDistortionCurve(amount = 24): Float32Array<ArrayBuffer> {
  const n = 44100;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export function trimAudioBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const sr = buffer.sampleRate;
  const s = Math.max(0, Math.floor(startSec * sr));
  const e = Math.min(buffer.length, Math.floor(endSec * sr));
  const len = Math.max(1, e - s);
  const out = ctx.createBuffer(buffer.numberOfChannels, len, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    out.copyToChannel(src.subarray(s, s + len), ch);
  }
  return out;
}

export function cutAudioBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  cutStartSec: number,
  cutEndSec: number
): AudioBuffer {
  const sr = buffer.sampleRate;
  const s = Math.max(0, Math.floor(cutStartSec * sr));
  const e = Math.min(buffer.length, Math.floor(cutEndSec * sr));
  const newLen = Math.max(1, buffer.length - Math.max(0, e - s));
  const out = ctx.createBuffer(buffer.numberOfChannels, newLen, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(0, s), 0);
    if (e < buffer.length) {
      dst.set(src.subarray(e), s);
    }
  }
  return out;
}

export function splitAudioBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  splitSec: number
): [AudioBuffer, AudioBuffer] {
  const partA = trimAudioBuffer(ctx, buffer, 0, splitSec);
  const partB = trimAudioBuffer(ctx, buffer, splitSec, buffer.duration);
  return [partA, partB];
}

export function joinAudioBuffers(ctx: BaseAudioContext, first: AudioBuffer, second: AudioBuffer): AudioBuffer {
  const numCh = Math.max(first.numberOfChannels, second.numberOfChannels);
  const sr = first.sampleRate;
  const out = ctx.createBuffer(numCh, first.length + second.length, sr);
  for (let ch = 0; ch < numCh; ch++) {
    const dst = out.getChannelData(ch);
    const srcA = first.getChannelData(Math.min(ch, first.numberOfChannels - 1));
    const srcB = second.getChannelData(Math.min(ch, second.numberOfChannels - 1));
    dst.set(srcA, 0);
    dst.set(srcB, first.length);
  }
  return out;
}

export async function renderProcessedBuffer(
  buffer: AudioBuffer,
  options: {
    gain: number;
    fadeInSec: number;
    fadeOutSec: number;
    speed: number;
    pitchSemitones: number;
    effectType?: string;
  }
): Promise<AudioBuffer> {
  const effectiveRate = Math.max(0.4, Math.min(2.2, options.speed * Math.pow(2, options.pitchSemitones / 12)));
  const outDuration = Math.max(0.2, buffer.duration / effectiveRate);
  const extraTail = options.effectType === 'reverb' || options.effectType === 'echo' ? 1.5 : 0;
  const totalSamples = Math.ceil((outDuration + extraTail) * buffer.sampleRate);

  const offline = new OfflineAudioContext(buffer.numberOfChannels, totalSamples, buffer.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = effectiveRate;

  const gainNode = offline.createGain();
  gainNode.gain.setValueAtTime(options.fadeInSec > 0 ? 0.001 : options.gain, 0);
  if (options.fadeInSec > 0) {
    gainNode.gain.linearRampToValueAtTime(options.gain, Math.min(outDuration * 0.5, options.fadeInSec));
  }
  if (options.fadeOutSec > 0 && outDuration > options.fadeOutSec) {
    gainNode.gain.setValueAtTime(options.gain, outDuration - options.fadeOutSec);
    gainNode.gain.linearRampToValueAtTime(0.0001, outDuration);
  }

  src.connect(gainNode);

  if (options.effectType === 'echo' || options.effectType === 'delay') {
    const delay = offline.createDelay(2.0);
    delay.delayTime.value = options.effectType === 'echo' ? 0.35 : 0.22;
    const fb = offline.createGain();
    fb.gain.value = 0.4;
    const wet = offline.createGain();
    wet.gain.value = 0.4;
    gainNode.connect(offline.destination);
    gainNode.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(offline.destination);
  } else if (options.effectType === 'reverb') {
    const convolver = offline.createConvolver();
    convolver.buffer = createImpulseResponse(offline, 2.2, 2.6);
    const wet = offline.createGain();
    wet.gain.value = 0.45;
    gainNode.connect(offline.destination);
    gainNode.connect(convolver);
    convolver.connect(wet);
    wet.connect(offline.destination);
  } else if (options.effectType === 'bass_boost') {
    const bass = offline.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 95;
    bass.gain.value = 9;
    gainNode.connect(bass);
    bass.connect(offline.destination);
  } else if (options.effectType === 'filter') {
    const filter = offline.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.Q.value = 5;
    gainNode.connect(filter);
    filter.connect(offline.destination);
  } else if (options.effectType === 'distortion') {
    const shaper = offline.createWaveShaper();
    shaper.curve = createDistortionCurve(28);
    shaper.oversample = '4x';
    gainNode.connect(shaper);
    shaper.connect(offline.destination);
  } else {
    gainNode.connect(offline.destination);
  }

  src.start(0);
  return await offline.startRendering();
}

export function estimateBpmFromBuffer(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const win = Math.floor(sr * 0.02);
  const energies: number[] = [];
  for (let i = 0; i < Math.min(data.length, sr * 25); i += win) {
    let sum = 0;
    for (let j = 0; j < win && i + j < data.length; j++) {
      sum += data[i + j] * data[i + j];
    }
    energies.push(sum / win);
  }
  if (energies.length < 20) return 120;
  const avg = energies.reduce((a, b) => a + b, 0) / energies.length;
  const peaks: number[] = [];
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > avg * 1.45 && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] > 10) {
        peaks.push(i);
      }
    }
  }
  if (peaks.length < 4) return 118;
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const sec = (peaks[i] - peaks[i - 1]) * 0.02;
    if (sec > 0.35 && sec < 0.85) intervals.push(sec);
  }
  if (intervals.length === 0) return 118;
  const meanSec = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return Math.round(Math.max(70, Math.min(165, 60 / meanSec)));
}

export function playSynthesizedEffectPreview(
  effectType: string,
  params: Record<string, number | string | boolean> = {},
  customBuffer?: AudioBuffer | null
): () => void {
  const ctx = new AudioContext();
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.75;
  master.connect(ctx.destination);

  let stopNodes: Array<{ stop?: () => void }> = [];

  if (effectType === 'dj_drop') {
    // Classic 3-burst club airhorn + sub drop
    const freqs = [392, 493.88, 587.33];
    [0, 0.22, 0.44].forEach((offset, idx) => {
      const dur = idx === 2 ? 0.65 : 0.16;
      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now + offset);
        if (idx === 2) osc.frequency.exponentialRampToValueAtTime(f * 0.92, now + offset + dur);
        g.gain.setValueAtTime(0.001, now + offset);
        g.gain.linearRampToValueAtTime(0.18, now + offset + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(now + offset);
        osc.stop(now + offset + dur + 0.02);
        stopNodes.push(osc);
      });
    });
  } else if (effectType === 'transition') {
    // White noise riser + sub impact
    const len = Math.floor(ctx.sampleRate * 1.8);
    const noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(180, now);
    filter.frequency.exponentialRampToValueAtTime(6500, now + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.02, now);
    g.gain.linearRampToValueAtTime(0.5, now + 1.45);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.75);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(now);
    stopNodes.push(src);
  } else {
    // Play either customBuffer or a rhythmic synth chord pulse through the selected DSP effect
    let sourceNode: AudioNode;
    if (customBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = customBuffer;
      if (effectType === 'voice_changer') {
        src.playbackRate.value = Number(params.pitchShift) || 1.15;
      }
      src.start(now);
      src.stop(now + Math.min(4.5, customBuffer.duration));
      stopNodes.push(src);
      sourceNode = src;
    } else {
      const bus = ctx.createGain();
      [0, 0.45, 0.9].forEach((offset) => {
        [220, 277.18, 329.63].forEach((f) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = effectType === 'voice_changer' ? f * 1.18 : f;
          g.gain.setValueAtTime(0.001, now + offset);
          g.gain.linearRampToValueAtTime(0.16, now + offset + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.35);
          osc.connect(g);
          g.connect(bus);
          osc.start(now + offset);
          osc.stop(now + offset + 0.38);
          stopNodes.push(osc);
        });
      });
      sourceNode = bus;
    }

    if (effectType === 'echo' || effectType === 'delay') {
      const delay = ctx.createDelay(2);
      delay.delayTime.value = Number(params.delayTime) || (effectType === 'echo' ? 0.35 : 0.22);
      const fb = ctx.createGain();
      fb.gain.value = Number(params.feedback) || 0.45;
      sourceNode.connect(master);
      sourceNode.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(master);
    } else if (effectType === 'reverb') {
      const conv = ctx.createConvolver();
      conv.buffer = createImpulseResponse(ctx, Number(params.decay) || 2.2, 2.4);
      sourceNode.connect(master);
      sourceNode.connect(conv);
      conv.connect(master);
    } else if (effectType === 'flanger' || effectType === 'chorus') {
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = effectType === 'flanger' ? 0.005 : 0.02;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = Number(params.rate) || (effectType === 'flanger' ? 0.6 : 1.5);
      lfoGain.gain.value = Number(params.depth) || 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start(now);
      lfo.stop(now + 4);
      sourceNode.connect(master);
      sourceNode.connect(delay);
      delay.connect(master);
    } else if (effectType === 'phaser') {
      const ap = ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.setValueAtTime(400, now);
      ap.frequency.exponentialRampToValueAtTime(2400, now + 1.5);
      sourceNode.connect(ap);
      ap.connect(master);
    } else if (effectType === 'filter') {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = Number(params.resonance) || 7;
      f.frequency.setValueAtTime(250, now);
      f.frequency.exponentialRampToValueAtTime(Number(params.cutoff) || 2800, now + 1.6);
      sourceNode.connect(f);
      f.connect(master);
    } else if (effectType === 'distortion') {
      const ws = ctx.createWaveShaper();
      ws.curve = createDistortionCurve(Number(params.drive) || 30);
      sourceNode.connect(ws);
      ws.connect(master);
    } else if (effectType === 'bass_boost') {
      const eq = ctx.createBiquadFilter();
      eq.type = 'lowshelf';
      eq.frequency.value = 90;
      eq.gain.value = Number(params.gainDb) || 10;
      sourceNode.connect(eq);
      eq.connect(master);
    } else {
      sourceNode.connect(master);
    }
  }

  const timer = window.setTimeout(() => {
    ctx.close().catch(() => {});
  }, 4800);

  return () => {
    window.clearTimeout(timer);
    stopNodes.forEach((n) => {
      try {
        n.stop?.();
      } catch {
        // ignore
      }
    });
    ctx.close().catch(() => {});
  };
}

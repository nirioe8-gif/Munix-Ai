import { createImpulseResponse, estimateBpmFromBuffer } from './wavEncoder';

export type DeckId = 'A' | 'B';

export interface DeckState {
  id: DeckId;
  title: string;
  artist: string;
  loaded: boolean;
  playing: boolean;
  duration: number;
  position: number;
  baseBpm: number;
  effectiveBpm: number;
  volume: number; // 0..1
  pitchRate: number; // 0.5..1.5
  bassDb: number; // -12..12
  midDb: number; // -12..12
  trebleDb: number; // -12..12
  filterCutoff: number; // 120..18000 Hz
  echoMix: number; // 0..1
  reverbMix: number; // 0..1
  cuePoint: number;
  loopEnabled: boolean;
  loopLengthSec: number;
  headphoneCue: boolean;
  waveformPeaks: number[];
}

interface InternalDeck {
  state: DeckState;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  startedAtCtxTime: number;
  offsetAtStart: number;
  gainNode: GainNode;
  bassFilter: BiquadFilterNode;
  midFilter: BiquadFilterNode;
  trebleFilter: BiquadFilterNode;
  sweepFilter: BiquadFilterNode;
  echoDelay: DelayNode;
  echoFeedback: GainNode;
  echoWet: GainNode;
  reverbWet: GainNode;
  crossfadeGain: GainNode;
  cueMonitorGain: GainNode;
}

export class DualDeckAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private masterAnalyser!: AnalyserNode;
  private cueBusGain!: GainNode;
  private convolver!: ConvolverNode;
  private recordDest!: MediaStreamAudioDestinationNode;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private deckA!: InternalDeck;
  private deckB!: InternalDeck;
  private crossfader = 0; // -1 (A) to +1 (B)
  private masterVolume = 0.85;
  private listeners = new Set<() => void>();
  private rafId: number | null = null;
  private recordingStartTime = 0;
  public isRecording = false;
  public recordingDurationSec = 0;

  private ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const ctx = new AudioContext();
    this.ctx = ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;

    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 128;

    this.cueBusGain = ctx.createGain();
    this.cueBusGain.gain.value = 0.7;

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = createImpulseResponse(ctx, 2.0, 2.5);

    this.recordDest = ctx.createMediaStreamDestination();

    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(ctx.destination);
    this.masterGain.connect(this.recordDest);
    this.cueBusGain.connect(ctx.destination);

    this.deckA = this.createDeckNodes('A', ctx);
    this.deckB = this.createDeckNodes('B', ctx);
    this.applyCrossfader(this.crossfader);
    this.startTicker();
  }

  private createDeckNodes(id: DeckId, ctx: AudioContext): InternalDeck {
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 120;

    const midFilter = ctx.createBiquadFilter();
    midFilter.type = 'peaking';
    midFilter.frequency.value = 1000;
    midFilter.Q.value = 0.9;

    const trebleFilter = ctx.createBiquadFilter();
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 6000;

    const sweepFilter = ctx.createBiquadFilter();
    sweepFilter.type = 'lowpass';
    sweepFilter.frequency.value = 18000;
    sweepFilter.Q.value = 1.5;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.85;

    const crossfadeGain = ctx.createGain();
    const cueMonitorGain = ctx.createGain();
    cueMonitorGain.gain.value = 0;

    // Echo send
    const echoDelay = ctx.createDelay(2.0);
    echoDelay.delayTime.value = 0.32;
    const echoFeedback = ctx.createGain();
    echoFeedback.gain.value = 0.42;
    const echoWet = ctx.createGain();
    echoWet.gain.value = 0;

    // Reverb send
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0;

    bassFilter.connect(midFilter);
    midFilter.connect(trebleFilter);
    trebleFilter.connect(sweepFilter);
    sweepFilter.connect(gainNode);

    gainNode.connect(crossfadeGain);
    gainNode.connect(cueMonitorGain);
    cueMonitorGain.connect(this.cueBusGain);

    gainNode.connect(echoDelay);
    echoDelay.connect(echoFeedback);
    echoFeedback.connect(echoDelay);
    echoDelay.connect(echoWet);
    echoWet.connect(crossfadeGain);

    gainNode.connect(reverbWet);
    reverbWet.connect(this.convolver);
    this.convolver.connect(this.masterGain);

    crossfadeGain.connect(this.masterGain);

    return {
      state: {
        id,
        title: `Deck ${id} — Empty`,
        artist: 'Load audio from library or device',
        loaded: false,
        playing: false,
        duration: 0,
        position: 0,
        baseBpm: 120,
        effectiveBpm: 120,
        volume: 0.85,
        pitchRate: 1.0,
        bassDb: 0,
        midDb: 0,
        trebleDb: 0,
        filterCutoff: 18000,
        echoMix: 0,
        reverbMix: 0,
        cuePoint: 0,
        loopEnabled: false,
        loopLengthSec: 4,
        headphoneCue: false,
        waveformPeaks: [],
      },
      buffer: null,
      source: null,
      startedAtCtxTime: 0,
      offsetAtStart: 0,
      gainNode,
      bassFilter,
      midFilter,
      trebleFilter,
      sweepFilter,
      echoDelay,
      echoFeedback,
      echoWet,
      reverbWet,
      crossfadeGain,
      cueMonitorGain,
    };
  }

  private getDeck(id: DeckId): InternalDeck {
    this.ensureContext();
    return id === 'A' ? this.deckA : this.deckB;
  }

  private computePeaks(buffer: AudioBuffer, bars = 120): number[] {
    const ch = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      const start = i * step;
      for (let j = 0; j < step && start + j < ch.length; j += Math.max(1, Math.floor(step / 16))) {
        const val = Math.abs(ch[start + j]);
        if (val > max) max = val;
      }
      peaks.push(Math.min(1, max));
    }
    return peaks;
  }

  public async loadFromArrayBuffer(
    id: DeckId,
    arrayBuffer: ArrayBuffer,
    meta: { title: string; artist: string; bpm?: number }
  ) {
    const deck = this.getDeck(id);
    this.stop(id);
    const decoded = await this.ctx!.decodeAudioData(arrayBuffer.slice(0));
    deck.buffer = decoded;
    const detectedBpm = meta.bpm || estimateBpmFromBuffer(decoded);
    deck.state = {
      ...deck.state,
      title: meta.title,
      artist: meta.artist,
      loaded: true,
      playing: false,
      duration: decoded.duration,
      position: 0,
      baseBpm: detectedBpm,
      effectiveBpm: Math.round(detectedBpm * deck.state.pitchRate),
      cuePoint: 0,
      waveformPeaks: this.computePeaks(decoded),
    };
    this.notify();
  }

  public async loadFromUrl(id: DeckId, url: string, meta: { title: string; artist: string; bpm?: number }) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch audio (${resp.status})`);
    const buf = await resp.arrayBuffer();
    await this.loadFromArrayBuffer(id, buf, meta);
  }

  public play(id: DeckId, fromOffset?: number) {
    const deck = this.getDeck(id);
    if (!deck.buffer || !this.ctx) return;
    if (deck.source) {
      try {
        deck.source.onended = null;
        deck.source.stop();
        deck.source.disconnect();
      } catch {
        // ignore
      }
      deck.source = null;
    }

    const startOffset =
      fromOffset !== undefined
        ? Math.max(0, Math.min(deck.buffer.duration - 0.05, fromOffset))
        : deck.state.position >= deck.buffer.duration - 0.05
          ? 0
          : deck.state.position;

    const src = this.ctx.createBufferSource();
    src.buffer = deck.buffer;
    src.playbackRate.value = deck.state.pitchRate;

    if (deck.state.loopEnabled) {
      src.loop = true;
      src.loopStart = Math.max(0, deck.state.cuePoint);
      src.loopEnd = Math.min(deck.buffer.duration, deck.state.cuePoint + deck.state.loopLengthSec);
    }

    src.connect(deck.bassFilter);
    src.onended = () => {
      if (deck.source === src && !src.loop) {
        deck.state.playing = false;
        deck.state.position = 0;
        deck.source = null;
        this.notify();
      }
    };

    src.start(0, startOffset);
    deck.source = src;
    deck.startedAtCtxTime = this.ctx.currentTime;
    deck.offsetAtStart = startOffset;
    deck.state.playing = true;
    deck.state.position = startOffset;
    this.notify();
  }

  public pause(id: DeckId) {
    const deck = this.getDeck(id);
    if (!deck.state.playing || !this.ctx) return;
    const elapsed = (this.ctx.currentTime - deck.startedAtCtxTime) * deck.state.pitchRate;
    deck.state.position = Math.min(deck.state.duration, deck.offsetAtStart + elapsed);
    if (deck.source) {
      try {
        deck.source.onended = null;
        deck.source.stop();
        deck.source.disconnect();
      } catch {
        // ignore
      }
      deck.source = null;
    }
    deck.state.playing = false;
    this.notify();
  }

  public togglePlay(id: DeckId) {
    const deck = this.getDeck(id);
    if (deck.state.playing) {
      this.pause(id);
    } else {
      this.play(id);
    }
  }

  public stop(id: DeckId) {
    const deck = this.getDeck(id);
    if (deck.source) {
      try {
        deck.source.onended = null;
        deck.source.stop();
        deck.source.disconnect();
      } catch {
        // ignore
      }
      deck.source = null;
    }
    deck.state.playing = false;
    deck.state.position = deck.state.cuePoint || 0;
    this.notify();
  }

  public seek(id: DeckId, seconds: number) {
    const deck = this.getDeck(id);
    const clamped = Math.max(0, Math.min(deck.state.duration, seconds));
    deck.state.position = clamped;
    if (deck.state.playing) {
      this.play(id, clamped);
    } else {
      this.notify();
    }
  }

  public setCuePoint(id: DeckId) {
    const deck = this.getDeck(id);
    this.updateLivePosition(deck);
    deck.state.cuePoint = deck.state.position;
    this.notify();
  }

  public jumpToCue(id: DeckId) {
    const deck = this.getDeck(id);
    const cue = deck.state.cuePoint || 0;
    if (deck.state.playing) {
      this.play(id, cue);
    } else {
      deck.state.position = cue;
      this.notify();
    }
  }

  public toggleLoop(id: DeckId, lengthSec?: number) {
    const deck = this.getDeck(id);
    if (lengthSec !== undefined) {
      deck.state.loopLengthSec = lengthSec;
      deck.state.loopEnabled = true;
    } else {
      deck.state.loopEnabled = !deck.state.loopEnabled;
    }
    if (deck.state.playing) {
      this.updateLivePosition(deck);
      this.play(id, deck.state.position);
    } else {
      this.notify();
    }
  }

  public setDeckParam(
    id: DeckId,
    param: 'volume' | 'pitchRate' | 'bassDb' | 'midDb' | 'trebleDb' | 'filterCutoff' | 'echoMix' | 'reverbMix' | 'headphoneCue',
    value: number | boolean
  ) {
    const deck = this.getDeck(id);
    if (param === 'volume' && typeof value === 'number') {
      deck.state.volume = value;
      deck.gainNode.gain.setTargetAtTime(value, this.ctx!.currentTime, 0.02);
    } else if (param === 'pitchRate' && typeof value === 'number') {
      this.updateLivePosition(deck);
      deck.state.pitchRate = value;
      deck.state.effectiveBpm = Math.round(deck.state.baseBpm * value);
      if (deck.source) {
        deck.source.playbackRate.setTargetAtTime(value, this.ctx!.currentTime, 0.02);
        deck.startedAtCtxTime = this.ctx!.currentTime;
        deck.offsetAtStart = deck.state.position;
      }
    } else if (param === 'bassDb' && typeof value === 'number') {
      deck.state.bassDb = value;
      deck.bassFilter.gain.setTargetAtTime(value, this.ctx!.currentTime, 0.02);
    } else if (param === 'midDb' && typeof value === 'number') {
      deck.state.midDb = value;
      deck.midFilter.gain.setTargetAtTime(value, this.ctx!.currentTime, 0.02);
    } else if (param === 'trebleDb' && typeof value === 'number') {
      deck.state.trebleDb = value;
      deck.trebleFilter.gain.setTargetAtTime(value, this.ctx!.currentTime, 0.02);
    } else if (param === 'filterCutoff' && typeof value === 'number') {
      deck.state.filterCutoff = value;
      deck.sweepFilter.frequency.setTargetAtTime(value, this.ctx!.currentTime, 0.02);
    } else if (param === 'echoMix' && typeof value === 'number') {
      deck.state.echoMix = value;
      deck.echoWet.gain.setTargetAtTime(value, this.ctx!.currentTime, 0.02);
    } else if (param === 'reverbMix' && typeof value === 'number') {
      deck.state.reverbMix = value;
      deck.reverbWet.gain.setTargetAtTime(value, this.ctx!.currentTime, 0.02);
    } else if (param === 'headphoneCue' && typeof value === 'boolean') {
      deck.state.headphoneCue = value;
      deck.cueMonitorGain.gain.setTargetAtTime(value ? 0.55 : 0, this.ctx!.currentTime, 0.02);
    }
    this.notify();
  }

  public setCrossfader(val: number) {
    this.ensureContext();
    this.crossfader = Math.max(-1, Math.min(1, val));
    this.applyCrossfader(this.crossfader);
    this.notify();
  }

  private applyCrossfader(val: number) {
    // Equal-power crossfade curve (-1 = full A, 0 = center both, +1 = full B)
    const norm = (val + 1) / 2; // 0..1
    const gainA = Math.cos(norm * 0.5 * Math.PI);
    const gainB = Math.cos((1 - norm) * 0.5 * Math.PI);
    this.deckA.crossfadeGain.gain.setTargetAtTime(gainA, this.ctx!.currentTime, 0.015);
    this.deckB.crossfadeGain.gain.setTargetAtTime(gainB, this.ctx!.currentTime, 0.015);
  }

  public setMasterVolume(val: number) {
    this.ensureContext();
    this.masterVolume = Math.max(0, Math.min(1.2, val));
    this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx!.currentTime, 0.02);
    this.notify();
  }

  public getCrossfader() {
    return this.crossfader;
  }

  public getMasterVolume() {
    return this.masterVolume;
  }

  public getStates(): { A: DeckState; B: DeckState } {
    if (!this.ctx) {
      return {
        A: {
          id: 'A',
          title: 'Deck A — Empty',
          artist: 'Load audio from library or device',
          loaded: false,
          playing: false,
          duration: 0,
          position: 0,
          baseBpm: 120,
          effectiveBpm: 120,
          volume: 0.85,
          pitchRate: 1,
          bassDb: 0,
          midDb: 0,
          trebleDb: 0,
          filterCutoff: 18000,
          echoMix: 0,
          reverbMix: 0,
          cuePoint: 0,
          loopEnabled: false,
          loopLengthSec: 4,
          headphoneCue: false,
          waveformPeaks: [],
        },
        B: {
          id: 'B',
          title: 'Deck B — Empty',
          artist: 'Load audio from library or device',
          loaded: false,
          playing: false,
          duration: 0,
          position: 0,
          baseBpm: 120,
          effectiveBpm: 120,
          volume: 0.85,
          pitchRate: 1,
          bassDb: 0,
          midDb: 0,
          trebleDb: 0,
          filterCutoff: 18000,
          echoMix: 0,
          reverbMix: 0,
          cuePoint: 0,
          loopEnabled: false,
          loopLengthSec: 4,
          headphoneCue: false,
          waveformPeaks: [],
        },
      };
    }
    return { A: { ...this.deckA.state }, B: { ...this.deckB.state } };
  }

  public getFrequencyData(target: Uint8Array<ArrayBuffer>) {
    if (!this.masterAnalyser) return;
    this.masterAnalyser.getByteFrequencyData(target);
  }

  public startRecording() {
    this.ensureContext();
    if (this.isRecording) return;
    this.recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    this.mediaRecorder = new MediaRecorder(this.recordDest.stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(250);
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    this.recordingDurationSec = 0;
    this.notify();
  }

  public async stopRecording(): Promise<Blob | null> {
    if (!this.mediaRecorder || !this.isRecording) return null;
    return new Promise((resolve) => {
      const rec = this.mediaRecorder!;
      rec.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: rec.mimeType || 'audio/webm' });
        this.isRecording = false;
        this.mediaRecorder = null;
        this.notify();
        resolve(blob);
      };
      rec.stop();
    });
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private updateLivePosition(deck: InternalDeck) {
    if (!deck.state.playing || !this.ctx) return;
    const elapsed = (this.ctx.currentTime - deck.startedAtCtxTime) * deck.state.pitchRate;
    let pos = deck.offsetAtStart + elapsed;
    if (deck.state.loopEnabled && deck.state.loopLengthSec > 0) {
      const lStart = deck.state.cuePoint;
      const lEnd = Math.min(deck.state.duration, lStart + deck.state.loopLengthSec);
      if (lEnd > lStart && pos > lEnd) {
        pos = lStart + ((pos - lStart) % (lEnd - lStart));
      }
    }
    deck.state.position = Math.min(deck.state.duration, pos);
  }

  private startTicker() {
    if (this.rafId !== null) return;
    let lastNotify = 0;
    const tick = (ts: number) => {
      if (this.deckA?.state.playing) this.updateLivePosition(this.deckA);
      if (this.deckB?.state.playing) this.updateLivePosition(this.deckB);
      if (this.isRecording) {
        this.recordingDurationSec = Math.floor((Date.now() - this.recordingStartTime) / 1000);
      }
      if (ts - lastNotify > 90 && (this.deckA?.state.playing || this.deckB?.state.playing || this.isRecording)) {
        lastNotify = ts;
        this.notify();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
}

export const djEngine = new DualDeckAudioEngine();

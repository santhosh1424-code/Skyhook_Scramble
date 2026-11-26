// Procedural Web Audio API sound engine with surface footsteps, 3D spatial mix, shanty music & subtitles

export class PirateAudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oceanGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private stepIdx = 0;
  private subtitleTimer: number | null = null;

  public enabled = true;
  public musicEnabled = true;
  public volume = 0.7;
  public subtitlesEnabled = true;
  private subtitleEl: HTMLElement | null = null;

  public attachSubtitleEl(el: HTMLElement | null): void {
    this.subtitleEl = el;
  }

  public showSubtitle(text: string): void {
    if (!this.subtitlesEnabled || !this.subtitleEl || !text) return;
    this.subtitleEl.textContent = text;
    this.subtitleEl.classList.remove('hidden');
    if (this.subtitleTimer) window.clearTimeout(this.subtitleTimer);
    this.subtitleTimer = window.setTimeout(() => this.subtitleEl?.classList.add('hidden'), 2400);
  }

  public ensureStarted(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.startAmbientLoop();
      this.startShantyLoop();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.05);
    }
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
    this.setVolume(this.volume);
  }

  private startAmbientLoop(): void {
    if (!this.ctx || !this.masterGain) return;
    // Filtered pink/white noise for ocean surf & island breeze
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.98 * b0 + white * 0.04;
      data[i] = b0 * 2.5;
    }

    const oceanSrc = this.ctx.createBufferSource();
    oceanSrc.buffer = buf;
    oceanSrc.loop = true;
    const oceanFilter = this.ctx.createBiquadFilter();
    oceanFilter.type = 'lowpass';
    oceanFilter.frequency.value = 380;
    this.oceanGain = this.ctx.createGain();
    this.oceanGain.gain.value = 0.16;
    oceanSrc.connect(oceanFilter).connect(this.oceanGain).connect(this.masterGain);
    oceanSrc.start();

    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 720;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.06;
    windSrc.connect(windFilter).connect(this.windGain).connect(this.masterGain);
    windSrc.start();
  }

  private startShantyLoop(): void {
    // Upbeat Dorian sea-shanty motif
    const notes = [293.66, 329.63, 349.23, 440.0, 392.0, 349.23, 329.63, 293.66, 261.63, 293.66, 349.23, 329.63];
    this.musicTimer = window.setInterval(() => {
      if (!this.enabled || !this.musicEnabled || !this.ctx || this.ctx.state !== 'running') return;
      const freq = notes[this.stepIdx % notes.length];
      this.stepIdx++;
      this.tone(freq, 0.28, 'triangle', 0.045);
    }, 460);
  }

  public updateAmbientMix(distToShore: number, windStrength: number, height: number): void {
    if (!this.ctx || !this.oceanGain || !this.windGain) return;
    const shoreFactor = Math.max(0.03, Math.min(0.28, 0.28 - distToShore * 0.002));
    this.oceanGain.gain.setTargetAtTime(shoreFactor, this.ctx.currentTime, 0.2);
    const windFactor = Math.min(0.24, 0.04 * windStrength + Math.max(0, height) * 0.0012);
    this.windGain.gain.setTargetAtTime(windFactor, this.ctx.currentTime, 0.2);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gainVal: number, slideTo?: number, pan = 0): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), now + dur);
    gain.gain.setValueAtTime(Math.max(0.001, gainVal), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      osc.connect(gain).connect(panner).connect(this.masterGain);
    } else {
      osc.connect(gain).connect(this.masterGain);
    }
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  public playFootstep(surface: 'sand' | 'grass' | 'rock' | 'mud' | 'water'): void {
    if (surface === 'water') this.tone(240, 0.12, 'sine', 0.1, 120);
    else if (surface === 'rock') this.tone(190, 0.06, 'triangle', 0.09, 110);
    else if (surface === 'mud') this.tone(120, 0.09, 'sine', 0.1, 75);
    else if (surface === 'sand') this.tone(310, 0.06, 'sine', 0.05, 190);
    else this.tone(240, 0.05, 'triangle', 0.05, 160);
  }

  public playDig(struckChest = false): void {
    this.tone(150, 0.16, 'sawtooth', 0.14, 75);
    if (struckChest) {
      setTimeout(() => this.tone(520, 0.18, 'triangle', 0.2, 680), 80);
      this.showSubtitle('[Thunk! Shovel struck buried chest!]');
    } else {
      this.showSubtitle('[Scrape! Digging soil]');
    }
  }

  public playCutlass(hit = false): void {
    this.tone(480, 0.12, 'sawtooth', 0.13, 180);
    if (hit) {
      setTimeout(() => this.tone(920, 0.14, 'square', 0.14, 420), 40);
      this.showSubtitle('[Clang! Cutlass strike]');
    }
  }

  public playChestOpen(): void {
    this.tone(160, 0.35, 'sawtooth', 0.16, 220);
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.24, 'triangle', 0.2), i * 100));
    this.showSubtitle('[Creak & Chime! Treasure Chest unearthed!]');
  }

  public playClueFound(): void {
    this.tone(587, 0.14, 'triangle', 0.18);
    setTimeout(() => this.tone(880, 0.22, 'triangle', 0.2), 110);
    this.showSubtitle('[Parchment rustle! New clue unlocked]');
  }

  public playVictory(): void {
    [523, 659, 784, 659, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.26, 'triangle', 0.22), i * 130));
    this.showSubtitle('[Victory fanfare!]');
  }

  public dispose(): void {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.ctx?.close().catch(() => {});
  }
}

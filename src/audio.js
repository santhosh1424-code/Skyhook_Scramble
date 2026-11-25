// Procedural cheerful Web Audio API synthesizer + Accessibility Subtitle Emitter

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.subtitlesEnabled = true;
    this.subtitleEl = null;
    this.subtitleTimer = null;
  }

  attachSubtitleEl(el) {
    this.subtitleEl = el;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  showSubtitle(text) {
    if (!this.subtitlesEnabled || !this.subtitleEl || !text) return;
    this.subtitleEl.textContent = text;
    this.subtitleEl.classList.remove('hidden');
    clearTimeout(this.subtitleTimer);
    this.subtitleTimer = setTimeout(() => {
      this.subtitleEl.classList.add('hidden');
    }, 2400);
  }

  playTone(freq, duration = 0.14, type = 'triangle', gainVal = 0.2, slideTo = null) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), now + duration);
    }
    const vol = Math.max(0.001, gainVal * this.volume);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  jump() {
    this.playTone(280, 0.14, 'sine', 0.22, 520);
  }

  bounce() {
    this.playTone(220, 0.24, 'triangle', 0.26, 760);
    this.showSubtitle('[Boing! Spring bounce]');
  }

  grapple() {
    this.playTone(540, 0.09, 'sawtooth', 0.14, 920);
    setTimeout(() => this.playTone(780, 0.08, 'triangle', 0.16, 440), 55);
    this.showSubtitle('[Clink! Skyhook latched]');
  }

  climb() {
    this.playTone(320, 0.1, 'triangle', 0.15, 450);
  }

  dash() {
    this.playTone(260, 0.13, 'sawtooth', 0.12, 480);
  }

  gadget(id) {
    if (id === 'smoke') {
      this.playTone(180, 0.25, 'sine', 0.2, 90);
      this.showSubtitle('[Poof! Smoke bomb deployed]');
    } else if (id === 'spring') {
      this.playTone(340, 0.15, 'square', 0.12, 620);
      this.showSubtitle('[Spring mine armed]');
    } else if (id === 'shield') {
      this.playTone(460, 0.26, 'sine', 0.2, 690);
      this.showSubtitle('[Hum! Shield bubble active]');
    } else if (id === 'pull') {
      this.playTone(620, 0.18, 'sawtooth', 0.15, 250);
      this.showSubtitle('[Zip! Short-range pull]');
    }
  }

  pickupCore() {
    this.playTone(523, 0.11, 'triangle', 0.22);
    setTimeout(() => this.playTone(659, 0.12, 'triangle', 0.22), 80);
    setTimeout(() => this.playTone(784, 0.2, 'triangle', 0.24), 160);
    this.showSubtitle('[Chime! Storm Core picked up]');
  }

  scoreFanfare() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.22, 'triangle', 0.25), idx * 95);
    });
    this.showSubtitle('[Fanfare! Storm Core delivered!]');
  }

  thunder() {
    this.playTone(130, 0.32, 'sawtooth', 0.22, 48);
    this.showSubtitle('[Crack! Lightning strike nearby]');
  }

  windGust() {
    this.playTone(210, 0.28, 'sine', 0.12, 340);
  }

  warning() {
    this.playTone(700, 0.12, 'square', 0.12);
    setTimeout(() => this.playTone(880, 0.15, 'square', 0.12), 140);
  }

  victory() {
    const notes = [523, 659, 784, 659, 784, 1046];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.24, 'triangle', 0.25), idx * 120);
    });
    this.showSubtitle('[Victory brass fanfare!]');
  }
}

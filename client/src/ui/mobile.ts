// Landscape-only mobile touch controls (reusing & fixing SKY src/mobile.js)

export function detectTouchDevice(): boolean {
  return (
    'ontouchstart' in window ||
    (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) ||
    Boolean(window.matchMedia?.('(pointer: coarse)').matches)
  );
}

export interface MobileControlCallbacks {
  onJump: () => void;
  onDig: () => void;
  onAttack: () => void;
  onShove: () => void;
  onSprintToggle: (sprinting: boolean) => void;
  onMap: () => void;
  onWardrobe: () => void;
  onEmote: () => void;
  onCameraDelta: (dx: number, dy: number) => void;
}

export class MobileControls {
  private readonly root = document.getElementById('mobile-controls');
  private readonly joystickZone = document.getElementById('mobile-joystick-zone');
  private readonly joystickBase = document.getElementById('joystick-base');
  private readonly joystickKnob = document.getElementById('joystick-knob');
  private readonly camZone = document.getElementById('mobile-cam-zone');

  private readonly btnJump = document.getElementById('m-btn-jump');
  private readonly btnDig = document.getElementById('m-btn-dig');
  private readonly btnAttack = document.getElementById('m-btn-attack');
  private readonly btnShove = document.getElementById('m-btn-shove');
  private readonly btnSprint = document.getElementById('m-btn-sprint');
  private readonly btnMap = document.getElementById('m-btn-map');
  private readonly btnWardrobe = document.getElementById('m-btn-wardrobe');
  private readonly btnEmote = document.getElementById('m-btn-emote');

  public enabled = detectTouchDevice();
  public joystickSize: 'small' | 'medium' | 'large' = 'medium';
  public buttonSize: 'small' | 'medium' | 'large' = 'medium';
  public buttonOpacity = 0.85;
  public moveX = 0;
  public moveY = 0;
  public sprintToggled = false;

  private joyTouchId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private joyMaxRadius = 48;

  private camTouchId: number | null = null;
  private camLastX = 0;
  private camLastY = 0;

  constructor(private readonly cb: MobileControlCallbacks) {
    this.bindEvents();
    this.applySettings();
  }

  public async requestLandscapeFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      const orient = screen.orientation as unknown as { lock?: (mode: string) => Promise<void> };
      await orient?.lock?.('landscape');
    } catch {
      // Unsupported on iOS Safari — portrait overlay handles orientation prompt gracefully
    }
  }

  public getSizePx(): number {
    if (this.joystickSize === 'small') return 96;
    if (this.joystickSize === 'large') return 148;
    return 120;
  }

  public getButtonScale(): number {
    if (this.buttonSize === 'small') return 0.88; // keeps >= 48px
    if (this.buttonSize === 'large') return 1.14;
    return 1.0;
  }

  public applySettings(): void {
    const px = this.getSizePx();
    this.joyMaxRadius = Math.max(24, px * 0.4);
    if (this.joystickBase) {
      this.joystickBase.style.width = `${px}px`;
      this.joystickBase.style.height = `${px}px`;
    }
    if (this.root) {
      this.root.style.setProperty('--mobile-btn-opacity', String(this.buttonOpacity));
      this.root.style.setProperty('--mobile-btn-scale', String(this.getButtonScale()));
    }
  }

  public setActive(active: boolean): void {
    if (!this.root) return;
    const show = this.enabled && active;
    this.root.classList.toggle('hidden', !show);
    if (!show) this.resetInputs();
  }

  public forceEnable(): void {
    if (!this.enabled) {
      this.enabled = true;
      document.body.classList.add('is-touch-device');
      if (document.body.classList.contains('playing-active')) {
        this.root?.classList.remove('hidden');
      }
    }
  }

  public resetInputs(): void {
    this.joyTouchId = null;
    this.camTouchId = null;
    this.moveX = 0;
    this.moveY = 0;
    if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    if (this.joystickBase) {
      this.joystickBase.style.left = '';
      this.joystickBase.style.top = '';
      this.joystickBase.style.bottom = '';
      this.joystickBase.classList.remove('active');
    }
  }

  private bindEvents(): void {
    if (!this.root || !this.joystickZone || !this.camZone || !this.joystickBase || !this.joystickKnob) return;

    window.addEventListener('touchstart', () => this.forceEnable(), { passive: true, once: true });

    this.joystickZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.forceEnable();
        if (this.joyTouchId !== null) return;
        const touch = Array.from(e.changedTouches).find((t) => t.identifier !== this.camTouchId);
        if (!touch) return;
        this.joyTouchId = touch.identifier;

        const rect = this.joystickZone!.getBoundingClientRect();
        const size = this.getSizePx();
        const half = size / 2;
        const relX = Math.max(half + 8, Math.min(rect.width - half - 8, touch.clientX - rect.left));
        const relY = Math.max(half + 8, Math.min(rect.height - half - 8, touch.clientY - rect.top));

        this.joyOriginX = rect.left + relX;
        this.joyOriginY = rect.top + relY;
        this.joystickBase!.style.left = `${relX}px`;
        this.joystickBase!.style.top = `${relY}px`;
        this.joystickBase!.style.bottom = 'auto';
        this.joystickBase!.classList.add('active');
        this.updateJoystick(touch.clientX, touch.clientY);
      },
      { passive: false }
    );

    this.joystickZone.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.joyTouchId) this.updateJoystick(t.clientX, t.clientY);
        }
      },
      { passive: false }
    );

    const endJoy = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyTouchId) this.resetJoyOnly();
      }
    };
    this.joystickZone.addEventListener('touchend', endJoy, { passive: false });
    this.joystickZone.addEventListener('touchcancel', endJoy, { passive: false });

    this.camZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.forceEnable();
        if (this.camTouchId !== null) return;
        const touch = Array.from(e.changedTouches).find((t) => t.identifier !== this.joyTouchId);
        if (!touch) return;
        this.camTouchId = touch.identifier;
        this.camLastX = touch.clientX;
        this.camLastY = touch.clientY;
      },
      { passive: false }
    );

    this.camZone.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.camTouchId) {
            const dx = t.clientX - this.camLastX;
            const dy = t.clientY - this.camLastY;
            this.camLastX = t.clientX;
            this.camLastY = t.clientY;
            this.cb.onCameraDelta(dx, dy);
          }
        }
      },
      { passive: false }
    );

    const endCam = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.camTouchId) this.camTouchId = null;
      }
    };
    this.camZone.addEventListener('touchend', endCam, { passive: false });
    this.camZone.addEventListener('touchcancel', endCam, { passive: false });

    const bindBtn = (el: HTMLElement | null, handler: () => void) => {
      if (!el) return;
      el.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.forceEnable();
          el.classList.add('pressed');
          handler();
        },
        { passive: false }
      );
      const rel = (e: TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('pressed');
      };
      el.addEventListener('touchend', rel, { passive: false });
      el.addEventListener('touchcancel', rel, { passive: false });
    };

    bindBtn(this.btnJump, this.cb.onJump);
    bindBtn(this.btnDig, this.cb.onDig);
    bindBtn(this.btnAttack, this.cb.onAttack);
    bindBtn(this.btnShove, this.cb.onShove);
    bindBtn(this.btnMap, this.cb.onMap);
    bindBtn(this.btnWardrobe, this.cb.onWardrobe);
    bindBtn(this.btnEmote, this.cb.onEmote);
    bindBtn(this.btnSprint, () => {
      this.sprintToggled = !this.sprintToggled;
      this.btnSprint?.classList.toggle('active', this.sprintToggled);
      this.cb.onSprintToggle(this.sprintToggled);
    });
  }

  private resetJoyOnly(): void {
    this.joyTouchId = null;
    this.moveX = 0;
    this.moveY = 0;
    if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    if (this.joystickBase) {
      this.joystickBase.style.left = '';
      this.joystickBase.style.top = '';
      this.joystickBase.style.bottom = '';
      this.joystickBase.classList.remove('active');
    }
  }

  private updateJoystick(clientX: number, clientY: number): void {
    let dx = clientX - this.joyOriginX;
    let dy = clientY - this.joyOriginY;
    const dist = Math.hypot(dx, dy);
    const maxR = Math.max(1, this.joyMaxRadius);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
    const nx = dx / maxR;
    const ny = dy / maxR;
    const mag = Math.hypot(nx, ny);
    if (mag < 0.12) {
      this.moveX = 0;
      this.moveY = 0;
    } else {
      this.moveX = Math.max(-1, Math.min(1, nx));
      this.moveY = Math.max(-1, Math.min(1, ny));
    }
  }
}

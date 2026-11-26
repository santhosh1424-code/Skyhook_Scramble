// Optional WebRTC proximity voice chat over the room WebSocket signaling channel
import type { TreasureNetClient } from './netClient';

export class ProximityVoiceManager {
  public enabled = false;
  public muted = false;
  private localStream: MediaStream | null = null;
  private readonly peers = new Map<string, { pc: RTCPeerConnection; audio: HTMLAudioElement }>();

  constructor(private readonly net: TreasureNetClient) {
    this.net.on('rtc_signal', (msg) => {
      this.handleSignal(msg.fromId, msg.signal).catch(() => {});
    });
  }

  public async toggle(): Promise<boolean> {
    if (this.enabled) {
      this.stop();
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia || this.net.status !== 'connected') {
      return false;
    }
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.enabled = true;
    return true;
  }

  public setMuted(val: boolean): void {
    this.muted = val;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = !val));
    }
  }

  public async connectToPeer(peerId: string): Promise<void> {
    if (!this.enabled || !this.localStream || this.peers.has(peerId)) return;
    const entry = this.createPeer(peerId);
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    this.net.send({ type: 'rtc_signal', targetId: peerId, signal: { sdp: offer } });
  }

  private createPeer(peerId: string) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    }
    const audio = new Audio();
    audio.autoplay = true;
    pc.ontrack = (ev) => {
      audio.srcObject = ev.streams[0];
      audio.play().catch(() => {});
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.net.send({ type: 'rtc_signal', targetId: peerId, signal: { candidate: ev.candidate } });
      }
    };
    const entry = { pc, audio };
    this.peers.set(peerId, entry);
    return entry;
  }

  private async handleSignal(fromId: string, signal: any): Promise<void> {
    if (!this.enabled) return;
    let entry = this.peers.get(fromId);
    if (!entry) entry = this.createPeer(fromId);

    if (signal.sdp) {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        this.net.send({ type: 'rtc_signal', targetId: fromId, signal: { sdp: answer } });
      }
    } else if (signal.candidate) {
      await entry.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }

  public updateProximityVolume(peerId: string, distMeters: number): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.audio.volume = Math.max(0, Math.min(1, 1 - distMeters / 45));
  }

  public stop(): void {
    this.enabled = false;
    for (const p of this.peers.values()) {
      p.pc.close();
      p.audio.srcObject = null;
    }
    this.peers.clear();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }
}

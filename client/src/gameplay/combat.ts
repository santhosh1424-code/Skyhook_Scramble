import * as THREE from 'three';

export interface CombatTarget {
  id: string;
  teamId: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  carryingChest: boolean;
  knockedDownTimer: number;
  hitStunTimer: number;
  onHit: (kind: 'slash' | 'shove', knockVec: THREE.Vector3) => void;
}

export class PirateCombat {
  public attackCooldown = 0;
  public shoveCooldown = 0;

  public update(dt: number): void {
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.shoveCooldown > 0) this.shoveCooldown = Math.max(0, this.shoveCooldown - dt);
  }

  public tryCutlassSwing(
    attackerId: string,
    attackerTeamId: number,
    attackerPos: THREE.Vector3,
    attackerYaw: number,
    targets: CombatTarget[]
  ): CombatTarget | null {
    if (this.attackCooldown > 0) return null;
    this.attackCooldown = 0.65;

    const fwd = new THREE.Vector3(Math.sin(attackerYaw), 0, Math.cos(attackerYaw));
    for (const t of targets) {
      if (t.id === attackerId || t.teamId === attackerTeamId || t.knockedDownTimer > 0) continue;
      const toTarget = t.pos.clone().sub(attackerPos);
      const dist = toTarget.length();
      if (dist <= 2.75) {
        toTarget.y = 0;
        if (dist < 0.5 || toTarget.normalize().dot(fwd) > 0.25) {
          const knock = fwd.clone().multiplyScalar(8.5).add(new THREE.Vector3(0, 3.5, 0));
          t.onHit('slash', knock);
          return t;
        }
      }
    }
    return null;
  }

  public tryShoveKick(
    attackerId: string,
    attackerTeamId: number,
    attackerPos: THREE.Vector3,
    attackerYaw: number,
    targets: CombatTarget[]
  ): CombatTarget | null {
    if (this.shoveCooldown > 0) return null;
    this.shoveCooldown = 1.6;

    const fwd = new THREE.Vector3(Math.sin(attackerYaw), 0, Math.cos(attackerYaw));
    for (const t of targets) {
      if (t.id === attackerId || t.teamId === attackerTeamId || t.knockedDownTimer > 0) continue;
      const toTarget = t.pos.clone().sub(attackerPos);
      const dist = toTarget.length();
      if (dist <= 2.4) {
        const knock = fwd.clone().multiplyScalar(12.5).add(new THREE.Vector3(0, 4.5, 0));
        t.onHit('shove', knock);
        return t;
      }
    }
    return null;
  }
}

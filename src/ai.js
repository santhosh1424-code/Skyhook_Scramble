import * as THREE from 'three';

export function computeBotInput(bot, world, core, players, dt) {
  bot.aiStateTimer -= dt;
  if (bot.aiStateTimer <= 0) {
    bot.aiStateTimer = 0.75 + Math.random() * 0.85;
    bot.aiStrafeDir = Math.random() < 0.5 ? -1 : 1;
  }

  // Stuck detection: if bot barely moved for > 1.1s, jump & strafe/grapple free
  const moved = bot.pos.distanceTo(bot.aiLastPos);
  if (moved < 0.45 * dt * 2) {
    bot.aiStuckTimer += dt;
  } else {
    bot.aiStuckTimer = Math.max(0, bot.aiStuckTimer - dt * 2);
  }
  bot.aiLastPos.copy(bot.pos);

  let targetPos = core.pos.clone();
  if (bot.hasCore) {
    targetPos = bot.homePos.clone();
  } else if (core.carrier) {
    if (core.carrier.teamId === bot.teamId && core.carrier.id !== bot.id) {
      targetPos = core.carrier.pos.clone().add(new THREE.Vector3(bot.aiStrafeDir * 3.8, 0, 3.8));
    } else {
      targetPos = core.carrier.pos.clone();
    }
  }

  const toTarget = targetPos.clone().sub(bot.pos);
  const flatDist = Math.hypot(toTarget.x, toTarget.z);
  const moveVec = new THREE.Vector3();

  if (flatDist > 0.6) {
    moveVec.set(toTarget.x, 0, toTarget.z).normalize();
  }

  // Hazard avoidance: steer away from telegraphed lightning rings
  for (const lz of world.lightningZones) {
    if (!lz.struck) {
      const away = bot.pos.clone().sub(lz.pos);
      away.y = 0;
      const d = away.length();
      if (d < lz.radius + 1.8 && d > 0.1) {
        moveVec.addScaledVector(away.normalize(), 1.4);
      }
    }
  }

  const perp = new THREE.Vector3(-moveVec.z, 0, moveVec.x);
  moveVec.addScaledVector(perp, bot.aiStrafeDir * (bot.aiStuckTimer > 0.6 ? 0.65 : 0.16)).normalize();

  // Ground ahead check
  const aheadX = bot.pos.x + moveVec.x * 2.5;
  const aheadZ = bot.pos.z + moveVec.z * 2.5;
  const groundAhead = world.platforms.some((p) => {
    if (!p.active) return false;
    if (p.shape === 'cylinder') {
      const dx = aheadX - p.x;
      const dz = aheadZ - p.z;
      return dx * dx + dz * dz <= p.radius * p.radius;
    }
    return Math.abs(aheadX - p.x) <= p.halfW && Math.abs(aheadZ - p.z) <= p.halfD;
  });

  let wantsJump = false;
  let wantsGrapple = false;
  let wantsDash = false;

  if (!groundAhead && bot.grounded) {
    wantsJump = true;
  }
  if (bot.aiStuckTimer > 0.9 && bot.grounded) {
    wantsJump = true;
    wantsGrapple = true;
    bot.aiStuckTimer = 0;
  }
  if (!bot.grounded && bot.vel.y < 1.5 && flatDist > 11 && !bot.grappleActive && Math.random() < 0.11) {
    wantsGrapple = true;
  }
  if (targetPos.y > bot.pos.y + 2.2 && bot.grounded && Math.random() < 0.08) {
    wantsJump = true;
  }

  // Dash to intercept rival carrier or escape chase
  if (bot.dashCooldown <= 0) {
    if (!bot.hasCore && core.carrier && core.carrier.teamId !== bot.teamId && core.carrier.pos.distanceTo(bot.pos) < 6.5) {
      wantsDash = true;
    } else if (bot.hasCore && bot.grounded && flatDist > 16 && Math.random() < 0.025) {
      wantsDash = true;
    }
  }

  // Contextual Gadget usage
  let wantsGadget = false;
  if (bot.gadgetCooldown <= 0) {
    const nearestRival = players.find(
      (p) => p.id !== bot.id && p.teamId !== bot.teamId && p.pos.distanceTo(bot.pos) < 9.5
    );
    if (bot.hasCore && nearestRival && (bot.gadgetId === 'smoke' || bot.gadgetId === 'shield' || bot.gadgetId === 'spring')) {
      wantsGadget = true;
    } else if (!bot.hasCore && core.carrier && core.carrier.teamId !== bot.teamId && core.carrier.pos.distanceTo(bot.pos) < 12.5 && bot.gadgetId === 'pull') {
      wantsGadget = true;
    }
  }

  return { moveVec, wantsJump, wantsGrapple, wantsDash, wantsGadget };
}

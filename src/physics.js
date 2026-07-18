import Matter from 'matter-js';
import { STATE } from './state.js';

export const physicsEvents = new EventTarget();
export let engine;
export let world;

let _ground, _leftWall, _rightWall;

export function updateWalls() {
  const W = window.innerWidth, H = window.innerHeight;
  if (_ground) {
    Matter.Body.setPosition(_ground,    { x: W / 2,  y: H + 25 });
    Matter.Body.setPosition(_leftWall,  { x: -25,    y: H / 2  });
    Matter.Body.setPosition(_rightWall, { x: W + 25, y: H / 2  });
  }
}

export function initPhysics() {
  engine = Matter.Engine.create({ enableSleeping: true });
  world  = engine.world;
  engine.gravity.y = 1;

  const W = window.innerWidth, H = window.innerHeight;
  const wallOpts = { isStatic: true, friction: 0.1, restitution: 0.8, label: 'wall' };
  _ground    = Matter.Bodies.rectangle(W / 2,  H + 25, W,  50, wallOpts);
  _leftWall  = Matter.Bodies.rectangle(-25,    H / 2,  50, H,  wallOpts);
  _rightWall = Matter.Bodies.rectangle(W + 25, H / 2,  50, H,  wallOpts);
  Matter.World.add(world, [_ground, _leftWall, _rightWall]);

  // Percussive impacts
  Matter.Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach(({ bodyA, bodyB }) => {
      const vA = bodyA.velocity || { x: 0, y: 0 };
      const vB = bodyB.velocity || { x: 0, y: 0 };
      const relVel = Math.sqrt((vA.x - vB.x) ** 2 + (vA.y - vB.y) ** 2);
      if (relVel > 1.5) {
        physicsEvents.dispatchEvent(new CustomEvent('impact', {
          detail: { bodyA, bodyB, velocity: relVel }
        }));
        bodyA.render.glow = 1.0;
        bodyB.render.glow = 1.0;
      }
    });
  });

  // collisionActive intentionally omitted until sustained-note gate is implemented

  Matter.Events.on(engine, 'beforeUpdate', () => {
    const now    = performance.now();
    const bodies = Matter.Composite.allBodies(world);

    // Glow decay + deferred body removal (safe — collected first, removed after loop)
    const toRemove = [];
    bodies.forEach(b => {
      if (b.render && b.render.glow > 0) b.render.glow -= 0.05;
      if (b.isDying && b.deathTime && now >= b.deathTime) toRemove.push(b);
    });
    toRemove.forEach(b => Matter.World.remove(world, b));

    // Vacuum attraction
    STATE.vacuums.forEach(vac => {
      bodies.forEach(body => {
        if (body.label !== 'ball' || body.isStatic || body.isDying) return;
        const dx = vac.x - body.position.x;
        const dy = vac.y - body.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < vac.radius && dist > 0) {
          // Wake sleeping bodies so force is applied
          if (body.isSleeping) Matter.Sleeping.set(body, false);
          const mag = (vac.power * 0.0001) / (dist * 0.01 + 1);
          Matter.Body.applyForce(body, body.position, {
            x: (dx / dist) * mag,
            y: (dy / dist) * mag
          });
          if (dist < 20 && !body.isDying) {
            body.isDying  = true;
            body.deathTime = now + 200;
            physicsEvents.dispatchEvent(new CustomEvent('absorbed', { detail: { body } }));
          }
        }
      });
    });
  });
}

export function updatePhysics() {
  Matter.Engine.update(engine, 1000 / 60);
}

const MAX_BALLS = 120; // global cap — prevents browser overload

export function getBallCount() {
  return Matter.Composite.allBodies(world).filter(b => b.label === 'ball').length;
}

export function clearAllBalls() {
  const balls = Matter.Composite.allBodies(world).filter(b => b.label === 'ball');
  balls.forEach(b => Matter.World.remove(world, b));
}

export function spawnBall(portal) {
  if (getBallCount() >= MAX_BALLS) return; // density cap

  const scale    = STATE.SCALES[portal.scale] || STATE.SCALES.major;
  const scaleLen = scale.length;

  // Arpeggio mode: stateful ascending/descending index per portal
  let scaleNoteIndex;
  if (portal.mode === 'up') {
    if (portal._arpIndex == null) portal._arpIndex = 0;
    scaleNoteIndex    = portal._arpIndex % scaleLen;
    portal._arpIndex  = (portal._arpIndex + 1) % scaleLen;
  } else if (portal.mode === 'down') {
    if (portal._arpIndex == null) portal._arpIndex = scaleLen - 1;
    portal._arpIndex  = (portal._arpIndex - 1 + scaleLen) % scaleLen;
    scaleNoteIndex    = portal._arpIndex;
  } else {
    scaleNoteIndex = Math.floor(Math.random() * scaleLen);
  }

  const ball = Matter.Bodies.circle(portal.x, portal.y, portal.size / 2, {
    restitution: 0.85,
    friction: 0.001,
    frictionAir: 0.001,
    label: 'ball',
    portalId: portal.id,
    scaleNoteIndex,
    octaveOffset: Math.floor(Math.random() * 2), // octave 3 or 4 base
    render: { glow: 0 }
  });

  Matter.Body.setVelocity(ball, { x: (Math.random() - 0.5) * 2, y: 0 });
  Matter.World.add(world, ball);
}

// opts: { style, gapRatio, fx, fxAmount, restitution }
// Dashed lines create multiple physics bodies — real gaps balls can pass through.
export function drawLine(x1, y1, x2, y2, opts = {}) {
  const dx  = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 5) return;

  const style       = opts.style       ?? 'solid';
  const gapRatio    = opts.gapRatio    ?? 0.4;
  const restitution = opts.restitution ?? 0.7;
  const angle       = Math.atan2(dy, dx);
  const nx = dx / len, ny = dy / len;
  const lineId      = 'line_' + Date.now();

  const bodyOpts = { isStatic: true, angle, label: 'line', friction: 0, restitution };
  const bodyIds  = [];

  if (style === 'dashed') {
    // dashLen fixed; gap grows with gapRatio so balls can pass through
    const dashLen = 18;
    const gap     = 24 + gapRatio * 90; // 24px min → 114px max
    const step    = dashLen + gap;
    for (let d = 0; d < len; d += step) {
      const segLen = Math.min(dashLen, len - d);
      if (segLen < 4) break;
      const mx = x1 + nx * (d + segLen / 2);
      const my = y1 + ny * (d + segLen / 2);
      const seg = Matter.Bodies.rectangle(mx, my, segLen, 10, bodyOpts);
      seg._lineId = lineId;
      Matter.World.add(world, seg);
      bodyIds.push(seg.id);
    }
  } else {
    const body = Matter.Bodies.rectangle(x1 + dx / 2, y1 + dy / 2, len, 12, bodyOpts);
    body._lineId = lineId;
    Matter.World.add(world, body);
    bodyIds.push(body.id);
  }

  STATE.lines.push({
    id: lineId,
    bodyIds,                              // always an array
    startX: x1, startY: y1, endX: x2, endY: y2,
    style, gapRatio,
    fx:       opts.fx       ?? 'none',
    fxAmount: opts.fxAmount ?? 0.5,
    restitution
  });
}

// Returns STATE.lines entry for a given body id
export function getLineByBodyId(bodyId) {
  return STATE.lines.find(l => l.bodyIds.includes(bodyId));
}

// Rebuild physics bodies for a line after style/gapRatio/restitution changes
export function rebuildLine(lineId) {
  const ld = STATE.lines.find(l => l.id === lineId);
  if (!ld) return;

  const allBodies = Matter.Composite.allBodies(world);
  ld.bodyIds.forEach(bid => {
    const b = allBodies.find(b2 => b2.id === bid);
    if (b) Matter.World.remove(world, b);
  });

  const { startX: x1, startY: y1, endX: x2, endY: y2, style, gapRatio, restitution } = ld;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 5) { STATE.lines = STATE.lines.filter(l => l.id !== lineId); return; }

  const angle   = Math.atan2(dy, dx);
  const nx = dx / len, ny = dy / len;
  const bOpts   = { isStatic: true, angle, label: 'line', friction: 0, restitution };
  const newIds  = [];

  if (style === 'dashed') {
    const dashLen = 18, gap = 24 + gapRatio * 90, step = dashLen + gap;
    for (let d = 0; d < len; d += step) {
      const segLen = Math.min(dashLen, len - d);
      if (segLen < 4) break;
      const mx = x1 + nx * (d + segLen / 2), my = y1 + ny * (d + segLen / 2);
      const seg = Matter.Bodies.rectangle(mx, my, segLen, 10, bOpts);
      seg._lineId = lineId;
      Matter.World.add(world, seg);
      newIds.push(seg.id);
    }
  } else {
    const b = Matter.Bodies.rectangle(x1 + dx / 2, y1 + dy / 2, len, 12, bOpts);
    b._lineId = lineId;
    Matter.World.add(world, b);
    newIds.push(b.id);
  }

  ld.bodyIds = newIds;
}

import Matter from 'matter-js';
import { STATE } from './state.js';

export const physicsEvents = new EventTarget();
export let engine;
export let world;

let _ground, _leftWall, _rightWall;
let _lastMovingUpdate = performance.now();

const LINE_THICKNESS = 12;
const DASH_THICKNESS = 10;
const MOVING_PLATFORM_THICKNESS = 14;
const DEFAULT_PLATFORM_SPEED = 90;
const DEFAULT_PLATFORM_LENGTH = 120;
const LINE_RESTITUTION = 0.8;

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

    const dt = Math.min(Math.max((now - _lastMovingUpdate) / 1000, 0), 1 / 30);
    _lastMovingUpdate = now;
    updateMovingLines(dt);

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
        const ballRadius = body.circleRadius || 0;
        const surfaceDist = Math.max(0, dist - ballRadius);
        if (surfaceDist < vac.radius) {
          // Wake sleeping bodies so force is applied
          if (body.isSleeping) Matter.Sleeping.set(body, false);
          const safeDist = dist || 1;
          const massScale = Math.max(1, body.mass || 1);
          const mag = ((vac.power * 0.00012) * massScale) / (surfaceDist * 0.01 + 1);
          Matter.Body.applyForce(body, body.position, {
            x: (dx / safeDist) * mag,
            y: (dy / safeDist) * mag
          });
          if (dist < ballRadius + 20 && !body.isDying) {
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

// opts: { style, gapRatio, fx, fxAmount, fxVolume, platformSpeed, platformLength }
// Dashed lines create multiple physics bodies — real gaps balls can pass through.
export function drawLine(x1, y1, x2, y2, opts = {}) {
  const dx  = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 5) return;

  const style       = opts.style       ?? 'solid';
  const gapRatio    = opts.gapRatio    ?? 0.4;
  const lineId      = 'line_' + Date.now();

  const lineData = {
    id: lineId,
    bodyIds: [],                          // always an array
    startX: x1, startY: y1, endX: x2, endY: y2,
    style, gapRatio,
    fx:       opts.fx       ?? 'none',
    fxAmount: opts.fxAmount ?? 0.5,
    fxVolume: opts.fxVolume ?? 1,
    platformSpeed:  opts.platformSpeed  ?? DEFAULT_PLATFORM_SPEED,
    platformLength: opts.platformLength ?? Math.min(DEFAULT_PLATFORM_LENGTH, len),
    platformOffset: opts.platformOffset ?? 0,
    platformDirection: opts.platformDirection ?? 1,
  };

  lineData.bodyIds = createLineBodies(lineData);
  STATE.lines.push(lineData);
}

// Returns STATE.lines entry for a given body id
export function getLineByBodyId(bodyId) {
  return STATE.lines.find(l => l.bodyIds.includes(bodyId));
}

// Rebuild physics bodies for a line after style/gapRatio/platform changes
export function rebuildLine(lineId) {
  const ld = STATE.lines.find(l => l.id === lineId);
  if (!ld) return;

  removeLineBodies(ld);

  const { startX: x1, startY: y1, endX: x2, endY: y2 } = ld;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 5) { STATE.lines = STATE.lines.filter(l => l.id !== lineId); return; }

  ld.bodyIds = createLineBodies(ld);
}

function removeLineBodies(lineData) {
  const allBodies = Matter.Composite.allBodies(world);
  lineData.bodyIds.forEach(bid => {
    const body = allBodies.find(b => b.id === bid);
    if (body) Matter.World.remove(world, body);
  });
}

function getLineMetrics(lineData) {
  const x1 = lineData.startX, y1 = lineData.startY;
  const x2 = lineData.endX,   y2 = lineData.endY;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  return {
    x1, y1, x2, y2, dx, dy, len,
    angle: Math.atan2(dy, dx),
    nx: len ? dx / len : 1,
    ny: len ? dy / len : 0,
  };
}

function getPlatformLength(lineData, lineLength) {
  const requested = Number(lineData.platformLength ?? DEFAULT_PLATFORM_LENGTH);
  return Math.max(4, Math.min(Math.max(20, requested), lineLength));
}

function createLineBodies(lineData) {
  const { x1, y1, dx, dy, len, angle, nx, ny } = getLineMetrics(lineData);
  const style = lineData.style ?? 'solid';
  const bodyOpts = { isStatic: true, angle, label: 'line', friction: 0, restitution: LINE_RESTITUTION };
  const bodyIds = [];

  if (style === 'dashed') {
    // dashLen fixed; gap grows with gapRatio so balls can pass through
    const dashLen = 18;
    const gap     = 24 + (lineData.gapRatio ?? 0.4) * 90; // 24px min -> 114px max
    const step    = dashLen + gap;
    for (let d = 0; d < len; d += step) {
      const segLen = Math.min(dashLen, len - d);
      if (segLen < 4) break;
      const mx = x1 + nx * (d + segLen / 2);
      const my = y1 + ny * (d + segLen / 2);
      const seg = Matter.Bodies.rectangle(mx, my, segLen, DASH_THICKNESS, bodyOpts);
      seg._lineId = lineData.id;
      Matter.World.add(world, seg);
      bodyIds.push(seg.id);
    }
    return bodyIds;
  }

  if (style === 'moving') {
    const platformLen = getPlatformLength(lineData, len);
    const travel = Math.max(0, len - platformLen);
    lineData.platformOffset = Math.max(0, Math.min(lineData.platformOffset ?? 0, travel));
    lineData.platformDirection = lineData.platformDirection === -1 ? -1 : 1;
    const centerD = lineData.platformOffset + platformLen / 2;
    const body = Matter.Bodies.rectangle(
      x1 + nx * centerD,
      y1 + ny * centerD,
      platformLen,
      MOVING_PLATFORM_THICKNESS,
      bodyOpts
    );
    body._lineId = lineData.id;
    body._movingPlatform = true;
    Matter.World.add(world, body);
    bodyIds.push(body.id);
    return bodyIds;
  }

  const body = Matter.Bodies.rectangle(x1 + dx / 2, y1 + dy / 2, len, LINE_THICKNESS, bodyOpts);
  body._lineId = lineData.id;
  Matter.World.add(world, body);
  bodyIds.push(body.id);
  return bodyIds;
}

function updateMovingLines(dt) {
  if (dt <= 0) return;
  const allBodies = Matter.Composite.allBodies(world);

  STATE.lines.forEach(lineData => {
    if (lineData.style !== 'moving') return;
    const body = allBodies.find(b => lineData.bodyIds.includes(b.id));
    if (!body) return;

    const { x1, y1, len, angle, nx, ny } = getLineMetrics(lineData);
    if (len < 5) return;

    const platformLen = getPlatformLength(lineData, len);
    const travel = Math.max(0, len - platformLen);
    const speed = Math.max(0, Number(lineData.platformSpeed ?? DEFAULT_PLATFORM_SPEED));
    let offset = Math.max(0, Math.min(lineData.platformOffset ?? 0, travel));
    let direction = lineData.platformDirection === -1 ? -1 : 1;

    if (travel > 0 && speed > 0) {
      offset += direction * speed * dt;
      while (offset < 0 || offset > travel) {
        if (offset > travel) {
          offset = travel - (offset - travel);
          direction = -1;
        } else {
          offset = -offset;
          direction = 1;
        }
      }
    }

    lineData.platformOffset = Math.max(0, Math.min(offset, travel));
    lineData.platformDirection = direction;

    const centerD = lineData.platformOffset + platformLen / 2;
    const nextPosition = { x: x1 + nx * centerD, y: y1 + ny * centerD };
    Matter.Body.setAngle(body, angle);
    Matter.Body.setPosition(body, nextPosition, true);
    if (speed === 0 || travel === 0) Matter.Body.setVelocity(body, { x: 0, y: 0 });
  });
}

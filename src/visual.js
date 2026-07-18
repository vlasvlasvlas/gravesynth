import p5 from 'p5';
import Matter from 'matter-js';
import { STATE } from './state.js';
import { engine, world, drawLine, updatePhysics, updateWalls } from './physics.js';

let sketchInstance;

export function initVisuals() {
  const container = document.getElementById('canvas-container');

  const sketch = (p) => {
    let isDrawing = false;
    let isDraggingObject = false;
    let startX = 0;
    let startY = 0;

    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.frameRate(60);
      p.colorMode(p.HSL, 360, 100, 100, 1);
    };

    p.draw = () => {
      if (!engine) return;

      updatePhysics();

      // Always BLEND — ADD is applied only locally for ball glow halos
      p.blendMode(p.BLEND);
      p.background(STATE.darkMode ? p.color(0, 0, 4) : p.color(0, 0, 96));

      const bodies = Matter.Composite.allBodies(world);

      bodies.forEach(body => {
        if (body.label === 'wall') return;
        if (body.label === 'line') return; // lines rendered from STATE below

        if (body.label === 'ball') {
          const hue   = (body.scaleNoteIndex * (360 / 7)) % 360;
          const sat   = body.isSleeping ? 15 : 85;
          const light = body.isSleeping ? (STATE.darkMode ? 25 : 75) : 55;
          const r     = body.circleRadius;

          // Glow halo — ADD blend locally, then back to BLEND immediately
          if (STATE.darkMode && body.render && body.render.glow > 0) {
            p.push();
            p.blendMode(p.ADD);
            p.noStroke();
            p.fill(hue, 100, 60, body.render.glow * 0.35);
            p.circle(body.position.x, body.position.y, r * 7);
            p.blendMode(p.BLEND);
            p.pop();
          }

          p.push();
          const deathProgress = body.isDying ? getDeathProgress(body) : 0;
          const alpha = body.isDying ? 1 - deathProgress : 1;
          const scale = body.isDying ? 1 - deathProgress * 0.85 : 1;
          p.fill(hue, sat, light, alpha);
          p.noStroke();
          p.circle(body.position.x, body.position.y, r * 2 * scale);
          p.pop();
        }
      });

      // Render lines from STATE — independent of physics body count/segments
      STATE.lines.forEach(lineData => {
        const isSelected = lineData.id === STATE.selectedObjectId;
        const hasFx      = lineData.fx && lineData.fx !== 'none';
        const style      = lineData.style    ?? 'solid';
        const gapRatio   = lineData.gapRatio ?? 0.4;
        const platformLength = lineData.platformLength ?? 120;
        const platformOffset = lineData.platformOffset ?? 0;
        const x1 = lineData.startX, y1 = lineData.startY;
        const x2 = lineData.endX,   y2 = lineData.endY;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;
        const nx = dx / len, ny = dy / len;
        const angle = Math.atan2(dy, dx);

        const baseColor = STATE.darkMode ? p.color(0, 0, 85) : p.color(0, 0, 15);
        const selColor  = p.color(210, 100, 55);
        const fxColor   = p.color(45, 90, 55);
        const strokeCol = isSelected ? selColor : hasFx ? fxColor : baseColor;

        p.push();
        p.stroke(strokeCol);
        p.strokeWeight(isSelected ? 2.5 : 2);
        p.strokeCap(p.ROUND);
        p.noFill();

        if (style === 'dashed') {
          const dashLen = 18;
          const gap     = 24 + gapRatio * 90; // matches physics gap formula
          const step    = dashLen + gap;
          for (let d = 0; d < len; d += step) {
            const t1 = Math.min(d + dashLen, len);
            p.line(x1 + nx * d, y1 + ny * d, x1 + nx * t1, y1 + ny * t1);
          }
        } else if (style === 'moving') {
          const railColor = STATE.darkMode ? p.color(0, 0, 70, 0.28) : p.color(0, 0, 20, 0.2);
          const pLen = Math.max(4, Math.min(Math.max(20, platformLength), len));
          const travel = Math.max(0, len - pLen);
          const centerD = Math.max(0, Math.min(platformOffset, travel)) + pLen / 2;
          const px = x1 + nx * centerD;
          const py = y1 + ny * centerD;

          p.stroke(railColor);
          p.strokeWeight(1);
          p.line(x1, y1, x2, y2);

          p.push();
          p.translate(px, py);
          p.rotate(angle);
          p.stroke(strokeCol);
          p.strokeWeight(isSelected ? 2.5 : 2);
          p.fill(STATE.darkMode ? p.color(0, 0, 12) : p.color(0, 0, 92));
          p.rectMode(p.CENTER);
          p.rect(0, 0, pLen, 14, 3);
          p.pop();
        } else {
          p.line(x1, y1, x2, y2);
        }

        if (hasFx) {
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          p.noStroke();
          p.fill(fxColor);
          p.circle(mx, my, isSelected ? 8 : 6);
        }
        p.pop();
      });

      STATE.portals.forEach(portal => {
        p.push();
        const isSelected = STATE.selectedObjectId === portal.id;
        p.noFill();
        p.strokeWeight(isSelected ? 2 : 1.5);
        p.stroke(isSelected ? p.color(210, 100, 55) : (STATE.darkMode ? p.color(0, 0, 80) : p.color(0, 0, 20)));
        p.rectMode(p.CENTER);
        p.square(portal.x, portal.y, 40);
        p.fill(STATE.darkMode ? p.color(0, 0, 80) : p.color(0, 0, 20));
        p.noStroke();
        p.circle(portal.x, portal.y, 6);
        p.pop();
      });

      STATE.vacuums.forEach(vac => {
        p.push();
        const isSelected = STATE.selectedObjectId === vac.id;
        p.noFill();
        p.strokeWeight(isSelected ? 2 : 1);
        p.stroke(0, 100, isSelected ? 60 : 50, 0.6);
        p.circle(vac.x, vac.y, vac.radius * 2);
        // Inner rings
        p.strokeWeight(1);
        p.stroke(0, 100, 50, 0.35);
        p.circle(vac.x, vac.y, vac.radius);
        p.fill(0, 100, 50);
        p.noStroke();
        p.circle(vac.x, vac.y, Math.max(4, vac.power / 10));
        p.pop();
      });

      // Preview line while drawing
      if (isDrawing && STATE.activeTool === 'line') {
        p.push();
        p.stroke(STATE.darkMode ? p.color(0, 0, 75) : p.color(0, 0, 20));
        p.strokeWeight(2);
        p.strokeCap(p.ROUND);
        p.line(startX, startY, p.mouseX, p.mouseY);
        p.pop();
      }
    };

    function eraseAt(x, y) {
      const allBodies    = Matter.Composite.allBodies(world);
      const hit          = Matter.Query.point(allBodies, { x, y });
      const removedLineIds = new Set();

      // Remove lines hit directly (solid) or by segment (dashed)
      hit.forEach(b => {
        if (b.label === 'line' && b._lineId && !removedLineIds.has(b._lineId)) {
          removedLineIds.add(b._lineId);
          const lineIdx = STATE.lines.findIndex(l => l.id === b._lineId);
          if (lineIdx !== -1) {
            const line = STATE.lines[lineIdx];
            line.bodyIds.forEach(bid => {
              const lb = Matter.Composite.allBodies(world).find(b2 => b2.id === bid);
              if (lb) Matter.World.remove(world, lb);
            });
            if (STATE.selectedObjectId === line.id) import('./ui.js').then(m => m.closeSidebar());
            STATE.lines.splice(lineIdx, 1);
          }
        }
      });

      // Also erase by proximity — catches clicks in dashed gaps
      [...STATE.lines].forEach(l => {
        if (removedLineIds.has(l.id)) return;
        if (distToSegment(x, y, l.startX, l.startY, l.endX, l.endY) < 10) {
          removedLineIds.add(l.id);
          l.bodyIds.forEach(bid => {
            const lb = Matter.Composite.allBodies(world).find(b2 => b2.id === bid);
            if (lb) Matter.World.remove(world, lb);
          });
          if (STATE.selectedObjectId === l.id) import('./ui.js').then(m => m.closeSidebar());
          const idx = STATE.lines.findIndex(ln => ln.id === l.id);
          if (idx !== -1) STATE.lines.splice(idx, 1);
        }
      });

      const CLICK_RADIUS = 20;

      const portalIdx = STATE.portals.findIndex(pt => Math.dist(x, y, pt.x, pt.y) < CLICK_RADIUS);
      if (portalIdx !== -1) {
        const portal = STATE.portals[portalIdx];
        if (window.notifyAudioRemoval) window.notifyAudioRemoval(portal.id);
        STATE.portals.splice(portalIdx, 1);
        if (STATE.selectedObjectId === portal.id) import('./ui.js').then(m => m.closeSidebar());
      }

      const vacIdx = STATE.vacuums.findIndex(v => Math.dist(x, y, v.x, v.y) < CLICK_RADIUS);
      if (vacIdx !== -1) {
        const vac = STATE.vacuums[vacIdx];
        STATE.vacuums.splice(vacIdx, 1);
        if (STATE.selectedObjectId === vac.id) import('./ui.js').then(m => m.closeSidebar());
      }
    }

    p.mousePressed = () => {
      // Ignore clicks on navbar or open sidebar
      const sidebarOpen = !document.getElementById('sidebar').classList.contains('hidden');
      if (p.mouseY < 50) return;
      if (sidebarOpen && p.mouseX > p.windowWidth - 320) return;

      startX = p.mouseX;
      startY = p.mouseY;

      if (STATE.activeTool === 'line') {
        isDrawing = true;
      } else if (STATE.activeTool === 'portal') {
        import('./ui.js').then(m => { m.createPortal(p.mouseX, p.mouseY); m.resetToolToSelect(); });
      } else if (STATE.activeTool === 'vacuum') {
        import('./ui.js').then(m => { m.createVacuum(p.mouseX, p.mouseY); m.resetToolToSelect(); });
      } else if (STATE.activeTool === 'eraser') {
        eraseAt(p.mouseX, p.mouseY);
      } else {
        // select tool
        isDraggingObject = checkSelection(p.mouseX, p.mouseY);
      }
    };

    p.mouseDragged = () => {
      if (STATE.activeTool === 'eraser') {
        eraseAt(p.mouseX, p.mouseY);
      } else if (STATE.activeTool === 'select' && isDraggingObject && STATE.selectedObjectId) {
        let obj = STATE.portals.find(pt => pt.id === STATE.selectedObjectId);
        if (!obj) obj = STATE.vacuums.find(v => v.id === STATE.selectedObjectId);
        if (obj) { obj.x = p.mouseX; obj.y = p.mouseY; }
      }
    };

    p.mouseReleased = () => {
      isDraggingObject = false;
      if (isDrawing) {
        if (STATE.activeTool === 'line') {
          drawLine(startX, startY, p.mouseX, p.mouseY, { style: STATE.pendingLineStyle ?? 'solid' });
        }
        isDrawing = false;
        import('./ui.js').then(m => m.resetToolToSelect());
      } else if (STATE.activeTool === 'eraser') {
        import('./ui.js').then(m => m.resetToolToSelect());
      }
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
      updateWalls();
    };
  };

  sketchInstance = new p5(sketch, container);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.dist(px, py, x1, y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.dist(px, py, x1 + t * dx, y1 + t * dy);
}

function getDeathProgress(body) {
  const now = performance.now();
  const start = body.deathStart ?? now;
  const end = body.deathTime ?? now;
  return Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
}

function checkSelection(x, y) {
  const CLICK_RADIUS = 20;

  let found = STATE.portals.find(pt => Math.dist(x, y, pt.x, pt.y) < CLICK_RADIUS);
  if (found) {
    STATE.selectedObjectId = found.id;
    import('./ui.js').then(m => m.openSidebar());
    return true;
  }

  found = STATE.vacuums.find(v => Math.dist(x, y, v.x, v.y) < CLICK_RADIUS);
  if (found) {
    STATE.selectedObjectId = found.id;
    import('./ui.js').then(m => m.openSidebar());
    return true;
  }

  // Lines — click within 8px of segment
  const foundLine = STATE.lines.find(l =>
    distToSegment(x, y, l.startX, l.startY, l.endX, l.endY) < 8
  );
  if (foundLine) {
    STATE.selectedObjectId = foundLine.id;
    import('./ui.js').then(m => m.openSidebar());
    return true;
  }

  STATE.selectedObjectId = null;
  import('./ui.js').then(m => m.closeSidebar());
  return false;
}

Math.dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

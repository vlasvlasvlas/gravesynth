import { initUI } from './ui.js';
import { initPhysics, physicsEvents, clearAllBalls, rebuildLine } from './physics.js';
import { initAudio, createPortalAudio, updatePortalAudio, removePortalAudio, handleImpact, handleAbsorptionFade, updateBpm, setMasterVolume, setPortalVolume, setPaused } from './audio.js';
import { initVisuals } from './visual.js';
import { STATE } from './state.js';

initUI();
initPhysics();

// Canvas visible immediately — no audio needed for visuals
initVisuals();

// Audio activates on first user interaction (browser requirement)
document.body.addEventListener('click', async () => {
  if (!window.audioStarted) {
    window.audioStarted = true;

    try {
      await initAudio();

      physicsEvents.addEventListener('impact', (e) => {
        handleImpact(e.detail.bodyA, e.detail.bodyB, e.detail.velocity);
      });
      physicsEvents.addEventListener('absorbed', (e) => {
        handleAbsorptionFade(e.detail.body);
      });
    } catch (err) {
      console.error('Audio init failed:', err);
    }
  }
}, { once: true });

const originalPush = STATE.portals.push.bind(STATE.portals);
STATE.portals.push = function(...items) {
  const result = originalPush(...items);
  if (window.audioStarted) {
    items.forEach(portal => createPortalAudio(portal));
  }
  return result;
};

window.panicClear               = clearAllBalls;
window.notifyLineRebuild        = rebuildLine;
window.notifyBpmUpdate          = updateBpm;
window.notifyMasterVolumeUpdate = setMasterVolume;
window.notifyVolumeUpdate       = setPortalVolume;
window.notifyPauseUpdate        = setPaused;
window.notifyAudioUpdate        = (portalId, config) => updatePortalAudio(portalId, config);
window.notifyAudioRemoval       = (portalId) => removePortalAudio(portalId);

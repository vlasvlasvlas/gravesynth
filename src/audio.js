import * as Tone from 'tone';
import { STATE } from './state.js';
import { spawnBall } from './physics.js';

const audioContexts = new Map(); // portalId -> { channel, synth, loop }

let MASTER_REVERB = null;
let MASTER_DELAY  = null;

// Dedicated FX buses — isolated from dry signal path
let FX_REVERB_NODE  = null;
let FX_REVERB_SYNTH = null;
let FX_ECHO_NODE    = null;
let FX_ECHO_SYNTH   = null;
let FX_PORTA_SYNTH  = null;

// Minimum safe offset for reactive scheduling (bypasses Tone.now() lookAhead wrapper).
// Tone.now() = audioCtx.currentTime + lookAhead — we DON'T want that for collisions.
// We use rawContext.currentTime directly + this tiny buffer to avoid "time in past" drops.
const REACTIVE_OFFSET = 0.005; // 5ms — imperceptible, enough to clear the audio thread

const SYNTH_MAP = {
  MonoSynth: Tone.MonoSynth,
  FMSynth:   Tone.FMSynth,
  AMSynth:   Tone.AMSynth,
  Synth:     Tone.Synth,
};

function makeSynth(synthDef, channel) {
  const typeName = synthDef?.type || 'MonoSynth';
  const SynthClass = SYNTH_MAP[typeName] || Tone.MonoSynth;
  const { type: _ignored, ...options } = synthDef || {};
  try {
    return new Tone.PolySynth(SynthClass, options).connect(channel);
  } catch (e) {
    console.error('Synth creation failed, falling back to MonoSynth', e);
    return new Tone.PolySynth(Tone.MonoSynth).connect(channel);
  }
}

export async function initAudio() {
  await Tone.start();

  // Ambient master reverb (subtle, always on)
  MASTER_REVERB = new Tone.Reverb({ decay: 1.5, wet: 0.12 }).toDestination();
  MASTER_DELAY  = new Tone.FeedbackDelay('8n', 0.1).connect(MASTER_REVERB);
  await MASTER_REVERB.ready;

  // Dedicated reverb FX bus — high quality, separate from master chain
  FX_REVERB_NODE = new Tone.Reverb({ decay: 4, preDelay: 0.02, wet: 1 }).toDestination();
  await FX_REVERB_NODE.ready;
  FX_REVERB_SYNTH = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.8, sustain: 0.08, release: 2.5 },
    volume: -16
  }).connect(FX_REVERB_NODE);

  // Dedicated echo FX bus — real FeedbackDelay with controlled feedback
  FX_ECHO_NODE = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.35, wet: 0.85 }).toDestination();
  FX_ECHO_SYNTH = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.25, sustain: 0.04, release: 0.6 },
    volume: -12
  }).connect(FX_ECHO_NODE);

  // Dedicated MonoSynth for portamento — frequency.rampTo gives true continuous slide
  FX_PORTA_SYNTH = new Tone.MonoSynth({
    oscillator: { type: 'triangle' },
    filter: { frequency: 2800, type: 'lowpass' },
    envelope: { attack: 0.008, decay: 0.6, sustain: 0.12, release: 0.8 },
    volume: -9
  }).toDestination();

  // lookAhead controls the Transport scheduler (ball-spawning loops).
  // Higher = more stable under CPU load. Does NOT affect collision sounds below.
  Tone.getContext().lookAhead = 0.05;

  Tone.Transport.bpm.value = STATE.bpm;
  Tone.Transport.start();

  STATE.portals.forEach(p => {
    if (!audioContexts.has(p.id)) createPortalAudio(p);
  });

  console.log('Audio ready');
}

export function updateBpm(bpm) {
  STATE.bpm = bpm;
  Tone.Transport.bpm.value = bpm;
}

export function createPortalAudio(portal) {
  if (!MASTER_DELAY) return; // audio not yet initialized
  // Crear canal independiente y rutear directamente al output (latencia CERO)
  const channel = new Tone.Channel({ volume: portal.volume ?? -6, pan: 0 }).toDestination();
  // Enviar señal al reverb en paralelo
  channel.connect(MASTER_REVERB);
  const synth = makeSynth(portal.parsedSynthDef, channel);

  // rpm = balls per minute; convert to seconds-per-ball
  const interval = () => 60 / (portal.rpm || 60);

  const loop = new Tone.Loop(() => {
    spawnBall(portal); // direct call — no Tone.Draw, no extra rAF jitter
  }, interval()).start(0);

  audioContexts.set(portal.id, { channel, synth, loop });
}

export function updatePortalAudio(portalId, config) {
  const ctx = audioContexts.get(portalId);
  if (!ctx) return;

  if (config.rpm != null) {
    ctx.loop.interval = 60 / config.rpm;
  }

  if (config.parsedSynthDef) {
    const oldSynth = ctx.synth;
    try { oldSynth.releaseAll(); } catch (_) {}
    // Small delay lets release envelopes finish before disposal
    setTimeout(() => { try { oldSynth.dispose(); } catch (_) {} }, 200);
    ctx.synth = makeSynth(config.parsedSynthDef, ctx.channel);
  }
}

export function removePortalAudio(portalId) {
  const ctx = audioContexts.get(portalId);
  if (!ctx) return;
  try { ctx.loop.stop(); ctx.loop.dispose(); } catch (_) {}
  try { ctx.synth.releaseAll(); setTimeout(() => ctx.synth.dispose(), 200); } catch (_) {}
  try { ctx.channel.dispose(); } catch (_) {}
  audioContexts.delete(portalId);
}

export function handleImpact(bodyA, bodyB, velocity) {
  const ball   = bodyA.label === 'ball' ? bodyA : bodyB;
  const target = bodyA.label === 'ball' ? bodyB : bodyA;

  if (!ball || ball.label !== 'ball') return;
  if (target.label === 'ball') return; // ball-vs-ball: TODO granular hit

  const ctx = audioContexts.get(ball.portalId);
  if (!ctx) return;

  const portal = STATE.portals.find(p => p.id === ball.portalId);
  if (!portal) return;

  // Velocity → perceptual volume (power curve feels more even than linear)
  const vol = Math.pow(Math.min(velocity / 15, 1), 0.4);

  // Note from scale
  const rootIndex = STATE.NOTES.indexOf(portal.note);
  const scale     = STATE.SCALES[portal.scale] || STATE.SCALES.major;
  const interval  = scale[ball.scaleNoteIndex % scale.length];
  const baseOctave = 3 + (ball.octaveOffset || 0); // octaves 3 or 4

  const totalSemitones = rootIndex + interval;
  const finalNote  = STATE.NOTES[totalSemitones % 12];
  const finalOctave = baseOctave + Math.floor(totalSemitones / 12);
  const freq = finalNote + finalOctave; // e.g. "C#4"

  // Pan from ball X position
  const pan = Math.max(-1, Math.min(1, (ball.position.x / window.innerWidth) * 2 - 1));
  ctx.channel.pan.rampTo(pan, 0.1);

  // Look up line FX by body id (bodyIds is an array)
  const lineData = STATE.lines.find(l => l.bodyIds && l.bodyIds.includes(target.id));
  const fx       = lineData?.fx       ?? 'none';
  const fxAmount = lineData?.fxAmount ?? 0.5;

  // Pitch shift via octave offset
  let noteOctave = finalOctave;
  if (fx === 'pitch-up')   noteOctave = Math.min(finalOctave + 1, 7);
  if (fx === 'pitch-down') noteOctave = Math.max(finalOctave - 1, 1);
  const finalFreq = finalNote + noteOctave;

  const t = Tone.getContext().rawContext.currentTime + REACTIVE_OFFSET;

  // Reverb FX — dedicated bus with long tail, no global wet pollution
  if (fx === 'reverb' && FX_REVERB_SYNTH) {
    FX_REVERB_SYNTH.volume.value = -22 + fxAmount * 14; // -22 → -8 dB
    FX_REVERB_SYNTH.triggerAttackRelease(finalFreq, '4n', t, vol * 0.75);
    ctx.synth.triggerAttackRelease(finalFreq, '8n', t, vol * 0.8);
    return;
  }

  // Echo FX — real FeedbackDelay, amount controls time and feedback
  if (fx === 'echo' && FX_ECHO_SYNTH) {
    FX_ECHO_NODE.delayTime.rampTo(0.08 + fxAmount * 0.42, 0.01);
    FX_ECHO_NODE.feedback.rampTo(0.12 + fxAmount * 0.38, 0.01);
    FX_ECHO_SYNTH.triggerAttackRelease(finalFreq, '16n', t, vol * 0.65);
    ctx.synth.triggerAttackRelease(finalFreq, '8n', t, vol * 0.85);
    return;
  }

  // Portamento FX — continuous frequency ramp via MonoSynth (no staircase)
  if (fx.startsWith('portamento') && FX_PORTA_SYNTH) {
    const dir = fx === 'portamento-random' ? (Math.random() > 0.5 ? 1 : -1)
              : fx === 'portamento-up' ? 1 : -1;
    const semiRange = 3 + Math.round(fxAmount * 9);     // 3–12 semitones
    const glideTime = 0.08 + fxAmount * 0.32;           // 80–400ms
    const endHz     = Tone.Frequency(finalFreq).transpose(dir * semiRange).toFrequency();
    FX_PORTA_SYNTH.triggerAttack(finalFreq, t, vol * 0.6);
    FX_PORTA_SYNTH.frequency.rampTo(endHz, glideTime, t + 0.006);
    FX_PORTA_SYNTH.triggerRelease(t + glideTime + 0.14);
    ctx.synth.triggerAttackRelease(finalFreq, '16n', t, vol * 0.45);
    return;
  }

  ctx.synth.triggerAttackRelease(finalFreq, '8n', t, vol);
}

export function handleAbsorptionFade(body) {
  // percussive notes self-release via envelope; nothing needed here
}

export function setMasterVolume(db) {
  Tone.Destination.volume.rampTo(db, 0.1);
}

export function setPortalVolume(portalId, db) {
  const ctx = audioContexts.get(portalId);
  if (!ctx) return;
  ctx.channel.volume.rampTo(db, 0.1);
}

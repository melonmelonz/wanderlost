// src/game/audio.ts
// Ambient bed synthesized at runtime in Web Audio — no audio file is shipped. A slow drone
// (two detuned oscillators) plus a gently filtered noise "wind" layer, with a master gain we
// can mute and duck at night. Browsers block autoplay until a gesture, so startAudio() must be
// called from the first keydown/pointerdown.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let started = false;
let muted = false;
let targetGain = 0.4;

function makeNoiseBuffer(c: AudioContext): AudioBuffer {
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function startAudio(): void {
  if (started) return;
  const C = ctx ?? (ctx = new (window.AudioContext || (window as any).webkitAudioContext)());
  if (C.state === 'suspended') void C.resume();
  started = true;

  master = C.createGain();
  master.gain.value = muted ? 0 : targetGain;
  master.connect(C.destination);

  // Drone: two detuned saws through a soft lowpass.
  const droneGain = C.createGain(); droneGain.gain.value = 0.18; droneGain.connect(master);
  const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(droneGain);
  for (const [freq, detune] of [[55, -6], [82.41, 7]] as const) {
    const osc = C.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = freq; osc.detune.value = detune;
    osc.connect(lp); osc.start();
  }
  // Slow LFO breathing on the filter cutoff.
  const lfo = C.createOscillator(); lfo.frequency.value = 0.05;
  const lfoGain = C.createGain(); lfoGain.gain.value = 180;
  lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start();

  // Wind: looped white noise through a bandpass.
  const noise = C.createBufferSource(); noise.buffer = makeNoiseBuffer(C); noise.loop = true;
  const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.7;
  const windGain = C.createGain(); windGain.gain.value = 0.06;
  noise.connect(bp); bp.connect(windGain); windGain.connect(master); noise.start();
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(muted ? 0 : targetGain, ctx.currentTime + 0.3);
  }
  return muted;
}

export function isMuted(): boolean { return muted; }

// duck: 0..1 multiplier on target gain (hushed at night).
export function setDuck(mult: number): void {
  targetGain = 0.4 * mult;
  if (master && ctx && !muted) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 1.5);
  }
}

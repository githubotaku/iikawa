// 효과음: 파일 없이 WebAudio로 합성
let ac = null;
function ctx() { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; }

function noise(a, dur, filterHz, gain) {
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterHz; f.Q.value = 0.8;
  const g = a.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination); src.start();
}
function tone(a, type, f0, f1, dur, gain) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, a.currentTime); o.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur);
  g.gain.setValueAtTime(gain, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.02);
}
export const sfx = {
  shot() { try { const a = ctx(); noise(a, 0.07, 3200, 0.5); tone(a, 'square', 2400, 900, 0.03, 0.12); tone(a, 'sine', 190, 45, 0.16, 0.7); noise(a, 0.18, 500, 0.25); } catch {} },
  pop()  { try { const a = ctx(); tone(a, 'sine', 700, 180, 0.07, 0.35); noise(a, 0.12, 900, 0.3); } catch {} },
};

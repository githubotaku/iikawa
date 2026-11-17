import { rand, clamp } from './pet.js';

// 연두색 피, 파티클, 떠오르는 글자. 피 얼룩은 캐릭터 "뒤"에 그려진다.
export class FX {
  constructor(world) { this.w = world; this.stains = []; this.parts = []; this.texts = []; this.flashes = []; }

  burst(x, y, n = 34, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(80, 480) * power;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(0, 160), r: rand(1.6, 5.2), age: 0, life: rand(0.7, 1.6), h: rand(88, 104), l: rand(38, 55) });
    }
  }
  // 캐릭터 뒤에 번지는 얼룩 + 흘러내리는 줄기
  splat(x, y, owner, k = 1) {
    const R = rand(26, 36) * k;
    const blobs = [{ x: 0, y: 0, r: R }];
    for (let i = 0; i < 6; i++) { const a = rand(0, 6.28), d = rand(0.5, 1.1) * R; blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rand(0.3, 0.6) * R }); }
    for (let i = 0; i < 12; i++) { const a = rand(0, 6.28), d = rand(1.2, 2.6) * R; blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rand(1.5, 5) }); }
    const drips = [];
    const nd = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nd; i++) drips.push({ x: rand(-0.7, 0.7) * R, w: rand(3.5, 6.5), len: 0, max: rand(35, 150) * k, v: rand(14, 40), delay: rand(0.1, 0.8) });
    this.stains.push({ x, y, owner, blobs, drips, t: 0, fade: 0 });
  }
  release(owner) { for (const s of this.stains) if (s.owner === owner) s.owner = null; }
  text(x, y, str) { this.texts.push({ x, y, str, age: 0 }); }
  flash(x, y) { this.flashes.push({ x, y, age: 0 }); }

  update(dt) {
    const ground = this.w.ground;
    for (const p of this.parts) {
      p.age += dt; p.vy += 1500 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > ground) { p.y = ground; p.vy *= -0.2; p.vx *= 0.6; }
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const s of this.stains) {
      s.t += dt;
      if (!s.owner) s.fade += dt;
      for (const d of s.drips) if (s.t > d.delay && d.len < d.max && s.y + d.len < ground) d.len += d.v * dt * (1 - d.len / (d.max * 1.15));
    }
    this.stains = this.stains.filter((s) => s.fade < 22);
    for (const t of this.texts) t.age += dt; this.texts = this.texts.filter((t) => t.age < 0.9);
    for (const f of this.flashes) f.age += dt; this.flashes = this.flashes.filter((f) => f.age < 0.16);
  }

  drawBack(ctx) {
    for (const s of this.stains) {
      const a = clamp(1 - (s.fade - 14) / 8, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.92 * a; ctx.translate(s.x, s.y);
      for (const d of s.drips) {
        if (d.len < 1) continue;
        ctx.strokeStyle = '#6fbf24'; ctx.lineWidth = d.w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(d.x, 0); ctx.lineTo(d.x, d.len); ctx.stroke();
        ctx.fillStyle = '#8be033'; ctx.beginPath(); ctx.arc(d.x, d.len, d.w * 0.75, 0, 6.3); ctx.fill();
        ctx.strokeStyle = 'rgba(220,255,160,0.55)'; ctx.lineWidth = d.w * 0.25;
        ctx.beginPath(); ctx.moveTo(d.x - d.w * 0.2, 0); ctx.lineTo(d.x - d.w * 0.2, d.len); ctx.stroke();
      }
      for (const b of s.blobs) {
        const g = ctx.createRadialGradient(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.1, b.x, b.y, b.r);
        g.addColorStop(0, '#a6ee48'); g.addColorStop(0.7, '#78c628'); g.addColorStop(1, '#559a1a');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.3); ctx.fill();
      }
      ctx.restore();
    }
    for (const p of this.parts) {
      ctx.globalAlpha = clamp(1 - p.age / p.life, 0, 1);
      ctx.fillStyle = `hsl(${p.h},70%,${p.l}%)`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawFront(ctx) {
    for (const f of this.flashes) {
      const k = 1 - f.age / 0.16;
      ctx.fillStyle = `rgba(255,250,200,${0.85 * k})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, 10 + 22 * (1 - k), 0, 6.3); ctx.fill();
    }
    for (const t of this.texts) {
      const k = t.age / 0.9;
      ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.font = '800 20px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
      ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#1d3a08'; ctx.fillStyle = '#c8ff6a';
      const y = t.y - 18 - k * 26, sc = 1 + Math.max(0, 0.25 - k) * 2;
      ctx.translate(t.x, y); ctx.scale(sc, sc); ctx.strokeText(t.str, 0, 0); ctx.fillText(t.str, 0, 0); ctx.restore();
    }
  }
}

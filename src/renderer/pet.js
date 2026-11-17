import { CHARACTERS, FOODS } from './data.js';
import MASKS from '../../assets/characters/masks.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const HUNGER_RATE = 100 / (3 * 3600);   // 가득 찬 상태에서 3시간이면 0
const SRC_H = 360;                       // 스프라이트 원본 높이(px)

function drawRivet(ctx, x, y, k) {
  const r = 4.2 * Math.max(0.8, k);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(40,10,0,0.5)';             // 박힌 자리 어두운 구멍
  ctx.beginPath(); ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.5, '#9aa3ad'); g.addColorStop(1, '#4b525b');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2c3138'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

export class Pet {
  constructor(id, world, saved = {}) {
    this.id = id;
    this.def = CHARACTERS[id];
    this.world = world;
    this.x = saved.x ?? rand(120, Math.max(200, world.W - 120));
    this.y = world.ground;
    this.vx = 0; this.vy = 0;
    this.hunger = saved.hunger ?? rand(65, 90);
    this.mood = saved.mood ?? 70;
    this.dir = Math.random() < 0.5 ? -1 : 1;     // 바라보는 방향 (1=오른쪽)
    this.view = 'front'; this.shownView = 'front'; this.shownDir = this.dir;
    this.turn = null;
    this.state = 'idle'; this.timer = rand(2, 6);
    this.phase = 0; this.age = rand(0, 10);
    this.sq = 0; this.sqv = 0;                   // 눌림/늘어남 스프링
    this.rot = 0; this.rotv = 0; this.rotTarget = 0;
    this.bubble = null;
    this.hops = 0;
    this.target = null;
    this.fleeCd = 0;
    this.chatCd = rand(20, 45);
    this.grab = null;
    this.eating = null;
    this.rivets = [];
    this.pinT = rand(3, 6);
  }

  // ---- 말풍선
  say(kind, force = false, dur = 2.8) {
    if (this.bubble && !force) return;
    const lines = this.def.lines[kind];
    if (!lines) return;
    this.bubble = { text: pick(lines), t: 0, dur };
  }

  // ---- 시선(뷰) 전환: 옆으로 찌그러졌다 펴지며 스프라이트 교체
  look(view, dir = this.dir) {
    if (this.turn) { this.turn.view = view; this.turn.dir = dir; this.dir = dir; this.view = view; return; }
    if (view === this.shownView && (view !== 'side' || dir === this.shownDir)) { this.view = view; this.dir = dir; return; }
    this.view = view; this.dir = dir;
    this.turn = { t: 0, dur: 0.24, view, dir, swapped: false };
  }

  size() {
    const s = this.def.height / SRC_H;
    const m = MASKS[`${this.id}_${this.shownView}`];
    return { s, w: m.w * s, h: m.h * s };
  }

  // 현재 변형값 (그리기/판정 공용)
  pose() {
    const moving = this.state === 'walk' || this.state === 'seek' || this.state === 'flee';
    let bob = 0, wob = 0, sqe = this.sq + Math.sin(this.age * 2.2) * 0.012;
    if (moving) {
      const k = Math.abs(Math.sin(this.phase));
      bob = k * this.def.height * 0.045;
      wob = Math.sin(this.phase) * 0.045;
      sqe += Math.sin(this.phase * 2) * 0.03;
    }
    if (this.state === 'eat') {
      const c = Math.abs(Math.sin(this.age * 11));
      sqe -= c * 0.07;
      wob += (this.eating ? Math.sign(this.eating.x - this.x) : 0) * 0.07;
    }
    if (this.state === 'sad') sqe -= 0.04;
    let tx = 1;
    if (this.turn) tx = Math.max(0.04, Math.abs(Math.cos((this.turn.t / this.turn.dur) * Math.PI)));
    const flip = this.shownView === 'side' ? (this.shownDir > 0 ? -1 : 1) : 1;
    return { bob, rot: this.rot + wob, sx: (1 - sqe * 0.6) * tx * flip, sy: 1 + sqe };
  }

  hit(mx, my) {
    if (this.state === 'drag') return true;
    const { s, w, h } = this.size();
    const p = this.pose();
    let dx = mx - this.x, dy = my - (this.y - p.bob);
    const c = Math.cos(-p.rot), sn = Math.sin(-p.rot);
    const rx = dx * c - dy * sn, ry = dx * sn + dy * c;
    const u = rx / (s * p.sx) + w / s / 2, v = ry / (s * p.sy) + h / s;
    const m = MASKS[`${this.id}_${this.shownView}`];
    if (u < 0 || v < 0 || u >= m.w || v >= m.h) return false;
    const cx = Math.floor((u / m.w) * m.cols), cy = Math.floor((v / m.h) * m.rows);
    return m.data[cy][cx] === '1';
  }

  // ---- 드래그/클릭
  // 화면 좌표 -> 스프라이트 로컬 좌표 (그릴 때의 변형과 동일하게 역변환)
  toLocal(mx, my) {
    const p = this.pose();
    const dx = mx - this.x, dy = my - (this.y - p.bob);
    const c = Math.cos(-p.rot), sn = Math.sin(-p.rot);
    return { lx: (dx * c - dy * sn) / p.sx, ly: (dx * sn + dy * c) / p.sy };
  }
  // 리벳 박기: 그 자리(공중이어도)에 그대로 고정
  pinAt(mx, my) {
    if (this.state === 'drag') { this.rot = 0; this.rotv = 0; this.rotTarget = 0; this.grab = null; }
    this.releaseFood();
    this.state = 'pinned';
    this.vx = this.vy = 0; this.hops = 0;
    this.rotTarget = 0;
    const { lx, ly } = this.toLocal(mx, my);
    this.rivets.push({ lx, ly });
    this.sqv = -4; this.rotv = (Math.random() < 0.5 ? -1 : 1) * 3;
    this.pinT = rand(3, 6);
    this.say('pinned', true, 3);
  }
  unpin() {
    this.rivets = [];
    this.pinT = 0;
  }

  startDrag(mx, my) {
    if (this.state === 'pinned') this.world.onUnpin?.(this, mx, my);
    this.state = 'drag';
    this.grab = { ox: this.x - mx, oy: this.y - my };
    this.look('front');
    this.vx = this.vy = 0;
    this.releaseFood();
    this.say('drag', true, 3);
    this.sqv = 2.5;
  }
  dragTo(mx, my, mvx) {
    this.x = mx + this.grab.ox;
    this.y = my + this.grab.oy;
    this.rotTarget = clamp(mvx * 0.0007, -0.6, 0.6);
  }
  endDrag(vx, vy) {
    this.state = 'fall';
    this.vx = clamp(vx, -900, 900); this.vy = clamp(vy, -900, 900);
    this.rotTarget = 0;
    this.grab = null;
  }
  poke() {
    this.mood = clamp(this.mood + 6, 0, 100);
    this.say('petted', true);
    this.hop(1);
    if (this.def.skittish) this.sqv = 3;
  }
  hop(n = 1) {
    if (this.state === 'drag') return;
    this.state = 'happy'; this.hops = n; this.vy = -430; this.sqv = -2;
    this.look('front');
  }

  releaseFood() {
    if (this.eating) { this.eating.claimedBy = null; this.eating = null; }
  }

  // ---- 메인 업데이트
  update(dt) {
    const w = this.world;
    this.age += dt;
    this.fleeCd = Math.max(0, this.fleeCd - dt);

    // 상태 수치
    if (this.state !== 'pinned') {
      this.hunger = Math.max(0, this.hunger - dt * HUNGER_RATE);
      const target = this.hunger < 25 ? 15 : this.hunger < 50 ? 45 : 75;
      this.mood = clamp(this.mood + (target - this.mood) * dt * 0.012, 0, 100);
    }

    // 말풍선
    if (this.bubble) { this.bubble.t += dt; if (this.bubble.t > this.bubble.dur) this.bubble = null; }
    this.chatCd -= dt;
    if (this.chatCd <= 0 && this.state !== 'drag') {
      this.chatCd = rand(14, 32);
      this.say(this.state === 'pinned' ? 'pinned' : this.hunger < 30 ? 'hungry' : 'idle');
    }

    // 스프링 (눌림, 회전)
    this.sqv += (-170 * this.sq - 11 * this.sqv) * dt; this.sq += this.sqv * dt * 0.1;
    this.rotv += (-120 * (this.rot - this.rotTarget) - 10 * this.rotv) * dt; this.rot += this.rotv * dt;

    // 뷰 전환 진행
    if (this.turn) {
      this.turn.t += dt;
      if (!this.turn.swapped && this.turn.t >= this.turn.dur / 2) {
        this.turn.swapped = true; this.shownView = this.turn.view; this.shownDir = this.turn.dir;
      }
      if (this.turn.t >= this.turn.dur) {
        this.shownView = this.turn.view; this.shownDir = this.turn.dir; this.turn = null;
      }
    }

    const half = this.size().w * 0.5;
    const minX = Math.max(half, 40), maxX = Math.max(minX, w.W - half);

    switch (this.state) {
      case 'idle': {
        this.rotTarget = 0;
        this.timer -= dt;
        if (this.hunger < 22 && this.age % 7 < dt) this.state = 'sad';
        if (this.timer <= 0) this.decide(minX, maxX);
        this.checkScared();
        break;
      }
      case 'sad': {
        // 배가 많이 고프면 쪼그려 앉아 있다가 먹이가 보이면 일어난다
        this.look('front');
        if (this.hunger >= 30) this.state = 'idle';
        if (w.foodFor(this)) { this.state = 'idle'; this.timer = 0; }
        break;
      }
      case 'walk':
      case 'seek':
      case 'flee': {
        const flee = this.state === 'flee';
        let spd = this.def.speed * (this.hunger < 25 ? 0.65 : 1) * (flee ? 2.5 : 1);
        if (this.state === 'seek') {
          const f = this.eating || w.foodFor(this);
          if (!f || !f.landed) { this.state = 'idle'; this.timer = 0.3; break; }
          this.target = f.x; this.eating = f; f.claimedBy = this;
        }
        const dx = this.target - this.x;
        this.dir = dx >= 0 ? 1 : -1;
        this.look('side', this.dir);
        const step = Math.min(Math.abs(dx), spd * dt);
        this.x += Math.sign(dx) * step;
        this.phase += dt * (spd / 10);
        if (flee) { this.timer -= dt; }
        if (Math.abs(dx) < 3 || (flee && this.timer <= 0) || this.x <= minX && dx < 0 || this.x >= maxX && dx > 0) {
          if (this.state === 'seek' && Math.abs(this.target - this.x) < 24) {
            this.state = 'eat'; this.timer = 2.6; this.look('front');
            this.say('eat', true);
          } else { this.state = 'idle'; this.timer = rand(5, 12); this.look('front'); }
        }
        if (this.state !== 'seek' && !flee) this.checkScared();
        break;
      }
      case 'eat': {
        const f = this.eating;
        if (!f || f.removed) { this.state = 'idle'; this.timer = 1; this.eating = null; break; }
        this.timer -= dt;
        f.eaten = clamp(1 - this.timer / 2.6, 0, 1);
        if (this.timer <= 0) this.finishEat(f);
        break;
      }
      case 'fall':
      case 'happy': {
        this.vy += 1800 * dt;
        this.y += this.vy * dt;
        this.x += this.vx * dt;
        this.vx *= Math.pow(0.5, dt * 2);
        if (this.x < minX) { this.x = minX; this.vx = Math.abs(this.vx) * 0.5; }
        if (this.x > maxX) { this.x = maxX; this.vx = -Math.abs(this.vx) * 0.5; }
        if (this.y >= w.ground) {
          const impact = this.vy;
          this.y = w.ground;
          this.sqv = -clamp(impact / 350, 1, 5);
          if (this.hops > 0) { this.hops--; this.vy = -400; }
          else {
            this.vy = 0;
            this.state = 'idle'; this.timer = rand(1, 2.5);
            this.look('front');
            if (impact > 900) { this.mood = clamp(this.mood - 2, 0, 100); this.say('land', true); }
          }
        }
        break;
      }
      case 'pinned': {
        // 박힌 채로 가끔 움찔
        this.pinT -= dt;
        if (this.pinT <= 0) { this.pinT = rand(3, 7); this.sqv = -1.5; this.rotv = (Math.random() < 0.5 ? -1 : 1) * 1.5; }
        break;
      }
      case 'drag':
        break;
    }
  }

  checkScared() {
    if (!this.def.skittish || this.fleeCd > 0) return;
    const m = this.world.mouse;
    const dist = Math.hypot(m.x - this.x, m.y - (this.y - this.def.height * 0.5));
    if (m.speed > 1100 && dist < 220) {
      this.fleeCd = 5;
      this.state = 'flee'; this.timer = 1.1;
      const away = this.x >= m.x ? 1 : -1;
      this.target = clamp(this.x + away * 400, 60, this.world.W - 60);
      this.say('scared', true);
      this.sqv = 3;
    }
  }

  decide(minX, maxX) {
    const w = this.world;
    if (this.hunger < 90 && w.foodFor(this)) { this.state = 'seek'; this.eating = w.foodFor(this); return; }
    const r = Math.random();
    if (r < 0.32) {
      const dist = rand(60, 260) * (Math.random() < 0.5 ? -1 : 1);
      this.target = clamp(this.x + dist, minX, maxX);
      this.state = 'walk';
    } else if (r < 0.5) {
      // 두리번: 뒤돌아보거나 옆을 본다
      if (Math.random() < 0.5) this.look('back'); else this.look('side', Math.random() < 0.5 ? -1 : 1);
      this.timer = rand(2.5, 4.5);
      setTimeout(() => { if (this.state === 'idle') this.look('front'); }, this.timer * 1000);
      return;
    } else if (r < 0.58 && this.mood > 50) {
      this.hop(1);
    } else {
      this.look('front');
      this.timer = rand(6, 16);
      return;
    }
    this.timer = rand(4, 10);
  }

  finishEat(f) {
    const food = FOODS[f.kind];
    const liked = this.def.likes.includes(f.kind);
    this.hunger = clamp(this.hunger + food.nutri, 0, 100);
    this.mood = clamp(this.mood + (liked ? 14 : 4), 0, 100);
    f.removed = true;
    this.eating = null;
    this.say(liked ? 'like' : (f.kind === 'fish' && this.def.lines.fish ? 'fish' : 'eat'), true);
    this.hop(liked ? 2 : 1);
  }

  // ---- 그리기
  draw(ctx) {
    const info = this.world.sprites[this.id][this.shownView];
    const { s, w, h } = this.size();
    const p = this.pose();
    const dw = w * 1, dh = h * 1;

    ctx.save();
    if (this.state === 'drag') {
      ctx.translate(this.x - this.grab.ox, this.y - this.grab.oy);
      ctx.rotate(p.rot);
      ctx.translate(this.grab.ox, this.grab.oy);
    } else {
      ctx.translate(this.x, this.y - p.bob);
      ctx.rotate(p.rot);
    }
    ctx.scale(p.sx, p.sy);
    if (this.hunger < 25 || this.mood < 25) ctx.filter = 'saturate(0.7) brightness(0.92)';
    ctx.drawImage(info.bmp || info.img, -dw / 2, -dh, dw, dh);
    ctx.filter = 'none';
    for (const r of this.rivets) drawRivet(ctx, r.lx, r.ly, this.def.height / 170);
    ctx.restore();
  }

  drawShadow(ctx) {
    const alt = Math.max(0, this.world.ground - this.y);
    const k = clamp(1 - alt / 500, 0.15, 1);
    const rw = this.def.height * 0.36 * k, rh = rw * 0.18;
    const g = ctx.createRadialGradient(this.x, this.world.ground, 1, this.x, this.world.ground, rw);
    g.addColorStop(0, `rgba(0,0,0,${0.32 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(0, this.world.ground);
    ctx.scale(1, rh / rw);
    ctx.translate(0, -this.world.ground);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.x, this.world.ground, rw, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawBubble(ctx) {
    if (!this.bubble) return;
    const b = this.bubble;
    const a = clamp(Math.min(b.t / 0.15, (b.dur - b.t) / 0.3), 0, 1);
    const top = (this.state === 'drag' ? this.y : this.y) - this.def.height * 1.0 - 14;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '600 12px "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
    const tw = ctx.measureText(b.text).width;
    const bw = tw + 20, bh = 25;
    const bx = clamp(this.x - bw / 2, 6, this.world.W - bw - 6);
    const by = Math.max(6, top - bh);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = 'rgba(30,30,40,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10);
    ctx.fill(); ctx.stroke();
    const tx = clamp(this.x, bx + 14, bx + bw - 14);
    ctx.beginPath();
    ctx.moveTo(tx - 6, by + bh - 1); ctx.lineTo(tx, by + bh + 9); ctx.lineTo(tx + 6, by + bh - 1);
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx - 6, by + bh); ctx.lineTo(tx, by + bh + 9); ctx.lineTo(tx + 6, by + bh); ctx.stroke();
    ctx.fillStyle = '#1b1b24';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(b.text, bx + bw / 2, by + bh / 2 + 1);
    ctx.restore();
  }
}

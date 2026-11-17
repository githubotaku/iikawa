import { CHARACTERS, FOODS, IDS, VIEWS } from './data.js';
import { Pet, rand, clamp } from './pet.js';
import { FX } from './fx.js';
import { sfx } from './sfx.js';

// ---- 저장소 API (Electron preload 없으면 localStorage 대체 → 브라우저 테스트용)
const api = window.api ?? {
  loadState: async () => JSON.parse(localStorage.getItem('iikawa') || '{}'),
  saveState: (s) => localStorage.setItem('iikawa', JSON.stringify(s)),
  setInteractive: () => {},
  onCommand: () => {},
  onCursor: () => {},
  onResync: () => {},
};

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');

const world = {
  W: innerWidth, H: innerHeight, ground: innerHeight - 6,
  sprites: {}, foods: [], pets: [],
  mouse: { x: -999, y: -999, vx: 0, vy: 0, speed: 0, t: 0 },
  foodFor(pet) {
    if (pet.hunger >= 92) return null;
    let best = null;
    for (const f of this.foods) {
      if (!f.landed || f.removed || (f.claimedBy && f.claimedBy !== pet)) continue;
      if (!best || Math.abs(f.x - pet.x) < Math.abs(best.x - pet.x)) best = f;
    }
    return best;
  },
};
world.fx = new FX(world);
world.onUnpin = (pet, mx, my) => {
  for (const r of pet.rivets) {
    const p = pet.pose(), px = pet.x + r.lx * p.sx, py = pet.y - p.bob + r.ly * p.sy;
    world.fx.burst(px, py, 22, 0.8);
  }
  world.fx.release(pet);
  world.fx.text(mx, my, '뽑!');
  sfx.pop();
  pet.unpin();
  pet.say('unpin', true);
};
window.__world = world;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  world.W = innerWidth; world.H = innerHeight; world.ground = innerHeight - 6;
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const p of world.pets) if (p.state !== 'drag' && p.state !== 'fall') p.y = world.ground;
}
addEventListener('resize', resize);

function loadSprites() {
  const jobs = [];
  for (const id of IDS) {
    world.sprites[id] = {};
    for (const v of VIEWS) {
      const img = new Image();
      img.src = `../../assets/characters/${id}_${v}.png`;
      const info = { img, bmp: null };
      world.sprites[id][v] = info;
      jobs.push(img.decode().then(async () => {
        const dpr = window.devicePixelRatio || 1, k = (CHARACTERS[id].height * dpr) / 360;
        try { info.bmp = await createImageBitmap(img, { resizeWidth: Math.round(img.naturalWidth * k), resizeHeight: Math.round(img.naturalHeight * k), resizeQuality: 'high' }); } catch { /* 원본 사용 */ }
      }));
    }
  }
  return Promise.all(jobs);
}

// ---- 먹이
function spawnFood(kind, x) {
  if (world.foods.length >= 6) world.foods.shift().removed = true;
  const f = { kind, x: x ?? rand(120, world.W - 120), y: -30, vy: 0, landed: false, age: 0, eaten: 0, claimedBy: null, removed: false };
  world.foods.push(f);
  const p = world.pets[Math.floor(Math.random() * world.pets.length)];
  if (p) p.say('drop');
  return f;
}
function updateFoods(dt) {
  for (const f of world.foods) {
    f.age += dt;
    if (!f.landed) {
      f.vy += 1500 * dt; f.y += f.vy * dt;
      if (f.y >= world.ground - 8) {
        f.y = world.ground - 8; f.landed = true;
        for (const p of world.pets) {
          if (p.hunger >= 92 && Math.random() < 0.7 && !p.bubble) p.say('full');
        }
      }
    } else if (f.age > 120 && !f.claimedBy) f.removed = true;
  }
  world.foods = world.foods.filter((f) => !f.removed);
}
function drawFoods() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of world.foods) {
    const fade = f.age > 100 && f.landed ? clamp((120 - f.age) / 20, 0, 1) : 1;
    ctx.globalAlpha = fade;
    if (f.landed) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(f.x, world.ground - 1, 9 * (1 - f.eaten * 0.7), 2.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = `${Math.round(22 * (1 - f.eaten * 0.75))}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillStyle = '#000';
    ctx.fillText(FOODS[f.kind].emoji, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ---- 펫 관리
let parked = {};
function addPet(id, saved) {
  if (world.pets.some((p) => p.id === id)) return null;
  const p = new Pet(id, world, saved ?? parked[id]);
  delete parked[id];
  world.pets.push(p);
  p.hop(1);
  return p;
}
function removePet(id) {
  const p = world.pets.find((q) => q.id === id);
  if (!p) return;
  p.releaseFood();
  world.fx.release(p);
  parked[id] = { hunger: p.hunger, mood: p.mood, x: p.x };
  world.pets = world.pets.filter((q) => q !== p);
}
function togglePet(id) { world.pets.some((p) => p.id === id) ? removePet(id) : addPet(id); renderHud(true); save(); }

// ---- 저장
function snapshot() {
  const pets = {};
  for (const p of world.pets) pets[p.id] = { hunger: p.hunger, mood: p.mood, x: p.x };
  return { savedAt: Date.now(), pets, hudOpen: !hud.classList.contains('collapsed'), parked };
}
function save() { api.saveState(snapshot()); }

// ---- 입력
let interactive = false;
function setInteractive(v) { if (v !== interactive) { interactive = v; api.setInteractive(v); } }
let press = null;       // 펫 눌림 {pet, sx, sy, moved}
let foodDrag = null;    // HUD에서 끌고 나온 먹이 {kind, x, y, sx, sy, moved}

function topPetAt(x, y) {
  for (let i = world.pets.length - 1; i >= 0; i--) if (world.pets[i].hit(x, y)) return world.pets[i];
  return null;
}
function updateMouse(x, y) {
  const m = world.mouse, now = performance.now();
  if (x === m.x && y === m.y) return false;
  const dtm = Math.max(1, now - m.t) / 1000;
  const nvx = (x - m.x) / dtm, nvy = (y - m.y) / dtm;
  if (m.t && now - m.t < 200) { m.vx = m.vx * 0.5 + nvx * 0.5; m.vy = m.vy * 0.5 + nvy * 0.5; } else { m.vx = m.vy = 0; }
  m.speed = Math.hypot(m.vx, m.vy); m.x = x; m.y = y; m.t = now;
  return true;
}
// 클릭 통과 여부 판정: 캐릭터/상태창 위일 때만 마우스를 받는다 (포워딩이 끊겨도 main의 커서 폴링으로 보정)
function hover(x, y) {
  if (foodDrag || press) return;
  const el = document.elementFromPoint(x, y);
  const overHud = !!el?.closest?.('#hud-panel, #hud-toggle');
  const pet = overHud ? null : topPetAt(x, y);
  document.body.style.cursor = pet ? (rivetMode ? 'crosshair' : 'grab') : '';
  setInteractive(overHud || !!pet);
}
addEventListener('mousemove', (e) => {
  const m = world.mouse;
  updateMouse(e.clientX, e.clientY);
  if (foodDrag) {
    foodDrag.x = e.clientX; foodDrag.y = e.clientY;
    if (Math.hypot(e.clientX - foodDrag.sx, e.clientY - foodDrag.sy) > 6) foodDrag.moved = true;
    return;
  }
  if (press) {
    if (!press.moved && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > 5) { press.moved = true; press.pet.startDrag(e.clientX, e.clientY); }
    if (press.moved) press.pet.dragTo(e.clientX, e.clientY, m.vx);
    return;
  }
  hover(e.clientX, e.clientY);
});
api.onCursor(({ x, y }) => { if (updateMouse(x, y)) hover(x, y); });
api.onResync(() => {
  // 절전/잠금 복귀 후: 꼬인 입력 상태 초기화
  if (press?.moved) press.pet.endDrag(0, 0);
  press = null; foodDrag = null;
  interactive = true; setInteractive(false);   // main과 상태를 강제로 다시 맞춘다
  document.body.style.cursor = '';
  world.mouse.t = 0;
});
addEventListener('contextmenu', (e) => e.preventDefault());

// 리벳건
let rivetMode = false;
const gunBtn = () => document.getElementById('tool-rivet');
function setRivetMode(v) {
  rivetMode = v === undefined ? !rivetMode : v;
  document.body.classList.toggle('rivet', rivetMode);
  gunBtn()?.classList.toggle('on', rivetMode);
}
function shoot(pet, x, y) {
  pet.pinAt(x, y);
  const fx = world.fx;
  fx.splat(x, y, pet, pet.def.height / 86);
  fx.burst(x, y, 36, 1);
  fx.flash(x, y);
  fx.text(x, y - pet.def.height * 0.5, '퍽!');
  sfx.shot();
}
addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    // 끌어서 든 상태에서 우클릭: 공중에서 그 자리에 박는다
    if (press?.moved && press.pet.state === 'drag') { shoot(press.pet, e.clientX, e.clientY); press = null; document.body.style.cursor = ''; }
    return;
  }
  if (e.button !== 0) return;
  const pet = e.target.closest?.('#hud') ? null : topPetAt(e.clientX, e.clientY);
  if (pet && rivetMode) { shoot(pet, e.clientX, e.clientY); return; }
  if (pet) { press = { pet, sx: e.clientX, sy: e.clientY, moved: false }; document.body.style.cursor = 'grabbing'; }
});
addEventListener('mouseup', (e) => {
  if (foodDrag) {
    const d = foodDrag; foodDrag = null;
    if (d.moved && !e.target.closest?.('#hud-panel')) spawnFood(d.kind, d.x).y = Math.max(-30, d.y);
    else if (!d.moved) spawnFood(d.kind);
    return;
  }
  if (press) {
    const { pet, moved } = press; press = null;
    if (moved) pet.endDrag(world.mouse.vx, world.mouse.vy); else pet.poke();
    document.body.style.cursor = '';
  }
});

// ---- HUD
const hudPets = document.getElementById('hud-pets');
const hudFoods = document.getElementById('hud-foods');
let hudKey = '';
function renderHud(force) {
  const key = IDS.map((id) => (world.pets.some((p) => p.id === id) ? 1 : 0)).join('');
  if (force || key !== hudKey) {
    hudKey = key;
    hudPets.innerHTML = IDS.map((id) => `
      <div class="row" data-id="${id}">
        <div class="av" title="클릭: 부르기/돌려보내기"><img src="../../assets/characters/${id}_front.png" alt=""></div>
        <div class="info">
          <div class="nm">${CHARACTERS[id].name}<small data-act="toggle"></small></div>
          <div class="bar"><i class="h"></i></div><div class="bar-label">배고픔 <span class="hv"></span></div>
          <div class="bar"><i class="m"></i></div><div class="bar-label">기분 <span class="mv"></span></div>
        </div>
      </div>`).join('');
  }
  for (const row of hudPets.children) {
    const id = row.dataset.id, p = world.pets.find((q) => q.id === id);
    row.classList.toggle('off', !p);
    row.querySelector('small').textContent = p ? '돌려보내기' : '불러오기';
    const hv = p ? p.hunger : 0, mv = p ? p.mood : 0;
    const h = row.querySelector('.h'), m = row.querySelector('.m');
    h.style.width = hv + '%'; h.style.background = `hsl(${Math.round(hv * 1.1)},70%,55%)`;
    m.style.width = mv + '%'; m.style.background = 'hsl(335,70%,60%)';
    row.querySelector('.hv').textContent = p ? Math.round(hv) : '-';
    row.querySelector('.mv').textContent = p ? Math.round(mv) : '-';
  }
}
hudPets.addEventListener('click', (e) => {
  const row = e.target.closest('.row'); if (!row) return;
  if (e.target.closest('.av, [data-act]')) togglePet(row.dataset.id);
});
hudFoods.innerHTML = Object.entries(FOODS).map(([k, f]) => `<button class="food" data-kind="${k}"><b>${f.emoji}</b>${f.name}</button>`).join('');
document.getElementById('tool-rivet').addEventListener('click', () => setRivetMode());
hudFoods.addEventListener('mousedown', (e) => {
  const b = e.target.closest('.food'); if (!b || e.button !== 0) return;
  foodDrag = { kind: b.dataset.kind, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
  e.preventDefault();
});
function toggleHud(open) {
  hud.classList.toggle('collapsed', open === undefined ? !hud.classList.contains('collapsed') : !open);
  if (hud.classList.contains('collapsed')) setInteractive(false);
  save();
}
document.getElementById('hud-toggle').addEventListener('click', () => toggleHud());
document.getElementById('hud-close').addEventListener('click', () => toggleHud(false));

// ---- 트레이 명령
api.onCommand((cmd) => {
  if (cmd.type === 'toggle-hud') toggleHud();
  else if (cmd.type === 'feed') spawnFood(cmd.kind);
  else if (cmd.type === 'toggle-pet') togglePet(cmd.id);
  else if (cmd.type === 'toggle-rivet') setRivetMode();
  else if (cmd.type === 'gather') {
    world.pets.forEach((p, i) => {
      if (p.state === 'idle' || p.state === 'walk' || p.state === 'sad') { p.target = world.W / 2 + (i - 1) * 140; p.state = 'walk'; p.timer = 8; }
    });
  }
});

// ---- 메인 루프
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  ctx.clearRect(0, 0, world.W, world.H);
  updateFoods(dt);
  world.fx.update(dt);
  for (const p of world.pets) p.update(dt);
  const order = [...world.pets].sort((a, b) => (a.state === 'drag') - (b.state === 'drag'));
  world.fx.drawBack(ctx);
  for (const p of order) p.drawShadow(ctx);
  drawFoods();
  for (const p of order) p.draw(ctx);
  world.fx.drawFront(ctx);
  for (const p of order) p.drawBubble(ctx);
  if (foodDrag && foodDrag.moved) {
    ctx.font = '24px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
    ctx.fillText(FOODS[foodDrag.kind].emoji, foodDrag.x, foodDrag.y);
  }
  requestAnimationFrame(frame);
}

async function init() {
  resize();
  await loadSprites();
  const st = await api.loadState();
  const elapsed = st.savedAt ? Math.max(0, (Date.now() - st.savedAt) / 1000) : 0;
  parked = st.parked || {};
  const active = st.pets ? Object.keys(st.pets) : IDS;
  for (const id of active) {
    if (!CHARACTERS[id]) continue;
    const sv = st.pets?.[id] ?? {};
    // 앱이 꺼져 있던 시간은 40% 속도로만 굶는다. 완전히 굶어 죽지는 않는다.
    if (sv.hunger != null) sv.hunger = Math.max(12, sv.hunger - elapsed * (100 / (3 * 3600)) * 0.4);
    if (sv.mood != null) sv.mood = Math.max(20, sv.mood - elapsed * 0.003);
    addPet(id, sv);
  }
  if (st.hudOpen) hud.classList.remove('collapsed');
  renderHud(true);
  setInterval(() => renderHud(), 400);
  setInterval(save, 10000);
  addEventListener('beforeunload', save);
  requestAnimationFrame(frame);
}
init();

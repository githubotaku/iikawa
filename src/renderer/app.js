import { CHARACTERS, FOODS, IDS, VIEWS } from './data.js';
import { Pet, rand, clamp } from './pet.js';

// ---- 저장소 API (Electron preload 없으면 localStorage 대체 → 브라우저 테스트용)
const api = window.api ?? {
  loadState: async () => JSON.parse(localStorage.getItem('iikawa') || '{}'),
  saveState: (s) => localStorage.setItem('iikawa', JSON.stringify(s)),
  setInteractive: () => {},
  onCommand: () => {},
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
      world.sprites[id][v] = { img };
      jobs.push(img.decode());
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
      if (f.y >= world.ground - 12) {
        f.y = world.ground - 12; f.landed = true;
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
      ctx.beginPath(); ctx.ellipse(f.x, world.ground - 1, 15 * (1 - f.eaten * 0.7), 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = `${Math.round(34 * (1 - f.eaten * 0.75))}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
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
addEventListener('mousemove', (e) => {
  const m = world.mouse, now = performance.now(), dtm = Math.max(1, now - m.t) / 1000;
  const nvx = (e.clientX - m.x) / dtm, nvy = (e.clientY - m.y) / dtm;
  if (m.t && now - m.t < 200) { m.vx = m.vx * 0.5 + nvx * 0.5; m.vy = m.vy * 0.5 + nvy * 0.5; } else { m.vx = m.vy = 0; }
  m.speed = Math.hypot(m.vx, m.vy); m.x = e.clientX; m.y = e.clientY; m.t = now;

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
  const overHud = !!e.target.closest?.('#hud-panel, #hud-toggle');
  const pet = overHud ? null : topPetAt(e.clientX, e.clientY);
  document.body.style.cursor = pet ? 'grab' : '';
  setInteractive(overHud || !!pet);
});
addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const pet = e.target.closest?.('#hud') ? null : topPetAt(e.clientX, e.clientY);
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
  for (const p of world.pets) p.update(dt);
  const order = [...world.pets].sort((a, b) => (a.state === 'drag') - (b.state === 'drag'));
  for (const p of order) p.drawShadow(ctx);
  drawFoods();
  for (const p of order) p.draw(ctx);
  for (const p of order) p.drawBubble(ctx);
  if (foodDrag && foodDrag.moved) {
    ctx.font = '34px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
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

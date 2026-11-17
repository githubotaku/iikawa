const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');

const CHARS = [['persephone', '페르세포네'], ['sato', '사토'], ['jasmine', '자스민']];
const FOODS = [['rice', '🍚 밥'], ['fish', '🐟 생선'], ['bug', '🐛 벌레'], ['cake', '🍰 케이크']];

let win = null;
let tray = null;
let state = {};
let stateFile = null;
let interactive = false;   // 렌더러가 요청한 마우스 수신 상태 (캐릭터/상태창 위일 때 true)

function loadStateFile() {
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { state = {}; }
}

function sendCmd(cmd) {
  if (win && !win.isDestroyed()) win.webContents.send('command', cmd);
}

function fitToWorkArea() {
  if (!win || win.isDestroyed()) return;
  win.setBounds(screen.getPrimaryDisplay().workArea);
}

// 절전/화면 잠금/디스플레이 변경 후 Windows가 오버레이 상태를 풀어버리는 문제 대응:
// 창 크기, 최상위, 클릭 통과 설정을 전부 다시 적용한다.
function reassert(notify = false) {
  if (!win || win.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea, b = win.getBounds();
  if (b.x !== wa.x || b.y !== wa.y || b.width !== wa.width || b.height !== wa.height) win.setBounds(wa);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(!interactive, { forward: true });
  if (!win.isVisible()) win.showInactive();
  if (notify) { interactive = false; win.setIgnoreMouseEvents(true, { forward: true }); win.webContents.send('resync'); }
}
function reassertSoon() { for (const ms of [300, 1500, 4000]) setTimeout(() => reassert(ms === 300), ms); }

function createWindow() {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { fitToWorkArea(); win.showInactive(); });
  // 렌더러가 죽거나 멈추면 다시 불러온다
  win.webContents.on('render-process-gone', () => { if (!win.isDestroyed()) win.reload(); });
  win.on('unresponsive', () => { if (!win.isDestroyed()) win.reload(); });
}

function activeIds() {
  return Object.keys((state && state.pets) || { persephone: 1, sato: 1, jasmine: 1 });
}

function buildMenu() {
  const active = activeIds();
  return Menu.buildFromTemplate([
    { label: '상태창 열기/닫기', click: () => sendCmd({ type: 'toggle-hud' }) },
    { label: '먹이 주기', submenu: FOODS.map(([kind, label]) => ({ label, click: () => sendCmd({ type: 'feed', kind }) })) },
    {
      label: '캐릭터',
      submenu: CHARS.map(([id, name]) => ({
        label: name, type: 'checkbox', checked: active.includes(id),
        click: () => sendCmd({ type: 'toggle-pet', id }),
      })),
    },
    { label: '리벳건 켜기/끄기', click: () => sendCmd({ type: 'toggle-rivet' }) },
    { label: '모두 불러모으기', click: () => sendCmd({ type: 'gather' }) },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  tray.setToolTip('이이카와');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => sendCmd({ type: 'toggle-hud' }));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => sendCmd({ type: 'toggle-hud' }));
  app.whenReady().then(() => {
    stateFile = path.join(app.getPath('userData'), 'state.json');
    loadStateFile();

    ipcMain.handle('load-state', () => state);
    ipcMain.on('save-state', (_e, s) => {
      state = s;
      try { fs.writeFileSync(stateFile, JSON.stringify(s)); } catch { /* ignore */ }
      if (tray) tray.setContextMenu(buildMenu());
    });
    ipcMain.on('set-interactive', (_e, v) => {
      interactive = !!v;
      if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!interactive, { forward: true });
    });

    createWindow();
    createTray();
    for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, reassertSoon);
    for (const ev of ['resume', 'unlock-screen', 'user-did-become-active']) powerMonitor.on(ev, reassertSoon);
    setInterval(() => reassert(false), 4000);   // 안전장치: 주기적으로 상태 재적용

    // 마우스 이벤트 포워딩이 끊겨도 동작하도록 커서 위치를 직접 읽어 전달한다
    let lx = NaN, ly = NaN;
    setInterval(() => {
      if (!win || win.isDestroyed() || !win.isVisible()) return;
      const pt = screen.getCursorScreenPoint(), b = win.getBounds();
      const x = pt.x - b.x, y = pt.y - b.y;
      if (x === lx && y === ly) return;
      lx = x; ly = y;
      win.webContents.send('cursor', { x, y });
    }, 33);
  });
  app.on('window-all-closed', () => app.quit());
}

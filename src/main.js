const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const CHARS = [['persephone', '페르세포네'], ['sato', '사토'], ['jasmine', '자스민']];
const FOODS = [['rice', '🍚 밥'], ['fish', '🐟 생선'], ['bug', '🐛 벌레'], ['cake', '🍰 케이크']];

let win = null;
let tray = null;
let state = {};
let stateFile = null;

function loadStateFile() {
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { state = {}; }
}

function sendCmd(cmd) {
  if (win && !win.isDestroyed()) win.webContents.send('command', cmd);
}

function fitToWorkArea() {
  if (!win) return;
  win.setBounds(screen.getPrimaryDisplay().workArea);
}

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
    { label: '모두 불러모으기', click: () => sendCmd({ type: 'gather' }) },
    { type: 'separator' },
    {
      label: '윈도우 시작 시 자동 실행', type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
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
      if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!v, { forward: true });
    });

    createWindow();
    createTray();
    screen.on('display-metrics-changed', fitToWorkArea);
    screen.on('display-added', fitToWorkArea);
    screen.on('display-removed', fitToWorkArea);
  });
  app.on('window-all-closed', () => app.quit());
}

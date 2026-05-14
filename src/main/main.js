/**
 * Hermes Pet v3.0 - Electron Main Process
 * 
 * 职责：窗口管理、系统托盘、IPC 通信、Ollama 后端代理
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, nativeImage, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');

// ============================================
// 全局状态
// ============================================
let mainWindow = null;
let tray = null;
let isQuitting = false;

// 持久化存储
const store = new Store({
  defaults: {
    ollamaHost: 'http://localhost:11434',
    model: 'qwen2.5:7b',
    windowX: null,
    windowY: null,
    windowWidth: 420,
    windowHeight: 620,
    alwaysOnTop: true,
    opacity: 0.95,
    autoLaunch: false,
    ttsEnabled: true,
    sttEnabled: true,
    clickThrough: false,
  }
});

// ============================================
// 窗口创建
// ============================================
function createWindow() {
  const savedBounds = {
    x: store.get('windowX'),
    y: store.get('windowY'),
    width: store.get('windowWidth'),
    height: store.get('windowHeight'),
  };

  mainWindow = new BrowserWindow({
    ...(savedBounds.x ? savedBounds : { width: 420, height: 620 }),
    transparent: true,
    frame: false,
    alwaysOnTop: store.get('alwaysOnTop'),
    resizable: true,
    hasShadow: false,
    skipTaskbar: false,
    icon: path.join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    opacity: store.get('opacity'),
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 保存窗口位置
  mainWindow.on('move', () => {
    const [x, y] = mainWindow.getPosition();
    store.set('windowX', x);
    store.set('windowY', y);
  });

  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize();
    store.set('windowWidth', w);
    store.set('windowHeight', h);
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // 开发模式下打开 DevTools
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ============================================
// 系统托盘
// ============================================
function createTray() {
  // 16x16 托盘图标 - 使用简单的纯色方块作为占位
  const iconSize = 16;
  const icon = nativeImage.createEmpty();
  
  // 创建一个橙色的简单图标
  const canvas = Buffer.alloc(iconSize * iconSize * 4);
  for (let i = 0; i < iconSize * iconSize; i++) {
    canvas[i * 4] = 255;     // R
    canvas[i * 4 + 1] = 140; // G
    canvas[i * 4 + 2] = 66;  // B
    canvas[i * 4 + 3] = 255; // A
  }
  const iconImg = nativeImage.createFromBuffer(canvas, { width: iconSize, height: iconSize });
  
  tray = new Tray(iconImg);
  tray.setToolTip('Hermes Pet - AI 桌面伙伴');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示/隐藏', click: () => { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); } },
    { label: '置顶窗口', type: 'checkbox', checked: store.get('alwaysOnTop'), click: (item) => { store.set('alwaysOnTop', item.checked); mainWindow.setAlwaysOnTop(item.checked); } },
    { type: 'separator' },
    { label: '设置', click: () => { mainWindow.webContents.send('open-settings'); mainWindow.show(); } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// ============================================
// IPC 处理器
// ============================================

// --- 窗口控制 ---
ipcMain.handle('window:minimize', () => mainWindow.minimize());
ipcMain.handle('window:hide', () => mainWindow.hide());
ipcMain.handle('window:close', () => { isQuitting = true; app.quit(); });

ipcMain.handle('window:start-drag', () => {
  // 通知渲染进程开始拖拽（由 CSS -webkit-app-region: drag 处理）
  return true;
});

// --- 设置管理 ---
ipcMain.handle('settings:get', (_, key) => store.get(key));
ipcMain.handle('settings:getAll', () => store.store);
ipcMain.handle('settings:set', (_, key, value) => {
  store.set(key, value);
  // 实时生效的设置
  if (key === 'alwaysOnTop') mainWindow.setAlwaysOnTop(value);
  if (key === 'opacity') mainWindow.setOpacity(value);
  return true;
});

// --- AI 对话 (Ollama API 代理) ---
ipcMain.handle('ai:chat', async (_, messages) => {
  const host = store.get('ollamaHost');
  const model = store.get('model');
  
  try {
    const response = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
        }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return { success: true, content: data.message.content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// AI 流式对话
ipcMain.handle('ai:chatStream', async (event, messages) => {
  const host = store.get('ollamaHost');
  const model = store.get('model');
  
  try {
    const response = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: { temperature: 0.7, top_p: 0.9 }
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            event.sender.send('ai:streamToken', chunk.message.content);
          }
        } catch (e) { /* skip parse errors */ }
      }
    }

    event.sender.send('ai:streamDone');
    return { success: true };
  } catch (err) {
    event.sender.send('ai:streamError', err.message);
    return { success: false, error: err.message };
  }
});

// --- Ollama 连接检测 ---
ipcMain.handle('ai:checkConnection', async () => {
  const host = store.get('ollamaHost');
  try {
    const response = await fetch(`${host}/api/tags`);
    if (!response.ok) return { connected: false };
    const data = await response.json();
    return { connected: true, models: data.models?.map(m => m.name) || [] };
  } catch {
    return { connected: false, models: [] };
  }
});

// --- TTS (Web Speech API 由渲染进程处理，这里提供文本) ---
ipcMain.handle('tts:getVoices', () => {
  // Web Speech API voices 在渲染进程获取
  return true;
});

// ============================================
// 应用生命周期
// ============================================
app.whenReady().then(() => {
  createWindow();
  createTray();

  // 全局快捷键
  globalShortcut.register('Alt+Shift+H', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

/**
 * Hermes Pet v3.0 - Renderer Application (Web Version)
 * 
 * 核心：Live2D 渲染 / 6 状态动画机 / AI 对话 / 粒子特效 / TTS-STT
 * 通信：fetch + WebSocket 连接 Node.js 后端
 */

// ============================================
// API 通信层 (替代 Electron IPC)
// ============================================
const API = {
  baseURL: '',
  ws: null,
  wsCallbacks: {},

  async chat(messages) {
    const resp = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages, 
        model: localStorage.getItem('hermes-model') || 'qwen2.5:7b' 
      }),
    });
    return resp.json();
  },

  async checkConnection() {
    try {
      const resp = await fetch(`${this.baseURL}/api/status`);
      return resp.json();
    } catch {
      return { connected: false, models: [] };
    }
  },

  connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'token' && this.wsCallbacks.onToken) {
        this.wsCallbacks.onToken(msg.content);
      } else if (msg.type === 'done' && this.wsCallbacks.onDone) {
        this.wsCallbacks.onDone();
      } else if (msg.type === 'error' && this.wsCallbacks.onError) {
        this.wsCallbacks.onError(msg.content);
      }
    };

    this.ws.onclose = () => {
      setTimeout(() => this.connectWS(), 3000);
    };
  },

  onToken(cb) { this.wsCallbacks.onToken = cb; },
  onDone(cb) { this.wsCallbacks.onDone = cb; },
  onError(cb) { this.wsCallbacks.onError = cb; },
};

// ============================================
// 全局状态
// ============================================
const STATE = {
  ollamaConnected: false,
  conversationHistory: [],
  maxHistory: 20,
  currentEmotion: 'idle',
  isSpeaking: false,
  isThinking: false,
  idleTimer: null,
  lastInteraction: Date.now(),
  live2dModel: null,
  pixiApp: null,
  modelScale: 0.28,
  ttsEnabled: true,
  sttEnabled: true,
  recognition: null,
  isRecording: false,
  synth: window.speechSynthesis,
  voicesLoaded: false,
  cachedVoices: [],
  settingsOpen: false,
  currentModelName: localStorage.getItem('hermes-live2d-model') || 'Hiyori',
  audioCache: {},
};

const DOM = {};

// ============================================
// 内置语音播放系统
// ============================================
const VoiceDB = {
  // 台词文本 → 音频文件 映射
  map: {
    '赫赫在呢！有什么可以帮你的？ (≧∇≦)ﾉ': 'greeting_01',
    '嗨嗨~ 咱在这里！✨': 'greeting_02',
    '啊，被召唤了！有什么吩咐？(〃\'▽\'〃)': 'greeting_03',
    '嘿嘿，终于有人理咱了~ 要聊点什么呢？': 'greeting_04',
    '来啦来啦！今天也是元气满满的一天！☀️': 'greeting_05',
    '诶嘿~ (〃\'▽\'〃)': 'drag_01',
    '唔…咱好像连不上 AI 大脑了 (´;ω;`) 检查一下 Ollama 是不是在运行？': 'error_ollama',
    '好安静呢…大家是不是都在忙？(´-ω-`)': 'idle_01',
    '咱在发呆中…Zzz…啊！没有睡着啦！': 'idle_02',
    '要不要聊聊天？咱知道很多有趣的事哦 ✨': 'idle_03',
    '（无聊地转圈圈）…转~转~转~': 'idle_04',
    '咱在听呢… (竖起耳朵)': 'stt_listening',
    '没听清楚呢…要不打字试试？ (・ω・)': 'stt_error',
    '语音输入未开启，请在设置中启用 (・ω・)': 'stt_disabled',
    '语音识别不可用 (´;ω;`)': 'stt_unavailable',
  },

  preload(name) {
    if (STATE.audioCache[name]) return;
    const audio = new Audio(`/assets/audio/${name}.mp3`);
    audio.preload = 'auto';
    STATE.audioCache[name] = audio;
  },

  playByText(text) {
    const name = this.map[text];
    if (!name) return false;
    
    if (!STATE.audioCache[name]) {
      this.preload(name);
    }
    
    const audio = STATE.audioCache[name];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(e => console.warn('Voice play skipped:', e.message));
    }
    return true;
  },

  preloadAll() {
    Object.values(this.map).forEach(name => this.preload(name));
  }
};

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  cacheDOM();
  bindEvents();
  preloadVoices();
  VoiceDB.preloadAll();
  const pixiOk = await initPIXI();
  if (!pixiOk) return;
  await loadLive2DModel(STATE.currentModelName);
  API.connectWS();
  API.onToken(onStreamToken);
  API.onDone(onStreamDone);
  API.onError(onStreamError);
  await checkOllamaConnection();
  initParticles();
  startIdleAnimation();
});

function cacheDOM() {
  DOM.canvas = document.getElementById('live2d-canvas');
  DOM.dialogBubble = document.getElementById('dialog-bubble');
  DOM.dialogText = document.getElementById('dialog-text');
  DOM.messageInput = document.getElementById('message-input');
  DOM.sendBtn = document.getElementById('send-btn');
  DOM.micBtn = document.getElementById('mic-btn');
  DOM.settingsPanel = document.getElementById('settings-panel');
  DOM.statusDot = document.getElementById('status-dot');
  DOM.statusText = document.getElementById('status-text');
  DOM.noConnection = document.getElementById('no-connection');
  DOM.particlesEl = document.getElementById('particles');
}

// ============================================
// 事件绑定
// ============================================
function bindEvents() {
  // 窗口控制（简化：隐藏设置按钮等不需要的东西）
  document.getElementById('btn-minimize').style.display = 'none';
  document.getElementById('btn-close').style.display = 'none';
  document.getElementById('btn-settings').addEventListener('click', toggleSettings);
  document.getElementById('settings-close').addEventListener('click', toggleSettings);

  // 发送消息
  DOM.sendBtn.addEventListener('click', sendMessage);
  DOM.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  DOM.messageInput.addEventListener('input', () => {
    DOM.sendBtn.disabled = !DOM.messageInput.value.trim();
  });

  // 语音输入
  DOM.micBtn.addEventListener('click', toggleVoiceInput);

  // 设置项
  bindSettingsEvents();

  // 鼠标交互
  DOM.canvas.addEventListener('mousedown', onCanvasMouseDown);
  DOM.canvas.addEventListener('mousemove', onCanvasMouseMove);
  DOM.canvas.addEventListener('mouseup', onCanvasMouseUp);
  DOM.canvas.addEventListener('wheel', onCanvasWheel);
  DOM.canvas.addEventListener('dblclick', onCanvasDblClick);

  // 点击外部关闭设置
  document.addEventListener('click', (e) => {
    if (STATE.settingsOpen && !DOM.settingsPanel.contains(e.target) && e.target.id !== 'btn-settings') {
      toggleSettings();
    }
  });
}

// ============================================
// 设置 (localStorage)
// ============================================
function bindSettingsEvents() {
  const ollamaHost = localStorage.getItem('hermes-ollama-host') || 'http://localhost:11434';
  document.getElementById('setting-ollama-host').value = ollamaHost;
  
  const model = localStorage.getItem('hermes-model') || 'qwen2.5:7b';
  document.getElementById('setting-model').value = model;

  const opacity = localStorage.getItem('hermes-opacity') || '95';
  document.getElementById('setting-opacity').value = opacity;

  updateToggle('setting-always-on-top', localStorage.getItem('hermes-always-on-top') !== 'false');
  updateToggle('setting-tts', localStorage.getItem('hermes-tts') !== 'false');
  STATE.ttsEnabled = localStorage.getItem('hermes-tts') !== 'false';
  updateToggle('setting-stt', localStorage.getItem('hermes-stt') !== 'false');
  STATE.sttEnabled = localStorage.getItem('hermes-stt') !== 'false';

  document.getElementById('setting-live2d-model').value = STATE.currentModelName;
  
  // Events
  document.getElementById('setting-ollama-host').addEventListener('change', (e) => {
    localStorage.setItem('hermes-ollama-host', e.target.value);
    checkOllamaConnection();
  });
  document.getElementById('setting-model').addEventListener('change', (e) => {
    localStorage.setItem('hermes-model', e.target.value);
  });
  document.getElementById('setting-opacity').addEventListener('input', (e) => {
    localStorage.setItem('hermes-opacity', e.target.value);
  });
  document.getElementById('setting-always-on-top').addEventListener('click', function() {
    this.classList.toggle('active');
    localStorage.setItem('hermes-always-on-top', this.classList.contains('active'));
  });
  document.getElementById('setting-tts').addEventListener('click', function() {
    STATE.ttsEnabled = this.classList.toggle('active');
    localStorage.setItem('hermes-tts', STATE.ttsEnabled);
  });
  document.getElementById('setting-stt').addEventListener('click', function() {
    STATE.sttEnabled = this.classList.toggle('active');
    localStorage.setItem('hermes-stt', STATE.sttEnabled);
  });
  document.getElementById('setting-live2d-model').addEventListener('change', async (e) => {
    STATE.currentModelName = e.target.value;
    localStorage.setItem('hermes-live2d-model', STATE.currentModelName);
    await loadLive2DModel(STATE.currentModelName);
  });
}

function updateToggle(id, active) {
  const el = document.getElementById(id);
  if (active) el.classList.add('active');
  else el.classList.remove('active');
}

function toggleSettings() {
  STATE.settingsOpen = !STATE.settingsOpen;
  if (STATE.settingsOpen) DOM.settingsPanel.classList.add('open');
  else DOM.settingsPanel.classList.remove('open');
}

// ============================================
// 语音引擎预加载
// ============================================
function preloadVoices() {
  if (!STATE.synth) return;

  // 尝试同步获取（某些浏览器支持）
  const voices = STATE.synth.getVoices();
  if (voices && voices.length > 0) {
    STATE.cachedVoices = voices;
    STATE.voicesLoaded = true;
    console.log('Voices loaded:', voices.length);
    return;
  }

  // 异步等待 voices 加载（Chrome/Edge 需要）
  STATE.synth.addEventListener('voiceschanged', () => {
    STATE.cachedVoices = STATE.synth.getVoices();
    STATE.voicesLoaded = true;
    console.log('Voices loaded (async):', STATE.cachedVoices.length);
  }, { once: true });

  // 兜底：5s 后强制刷新
  setTimeout(() => {
    if (!STATE.voicesLoaded) {
      STATE.cachedVoices = STATE.synth.getVoices();
      STATE.voicesLoaded = true;
      console.log('Voices loaded (fallback):', STATE.cachedVoices.length);
    }
  }, 5000);
}

// ============================================
// PIXI.js + Live2D
// ============================================
async function initPIXI() {
  // 检查 PIXI 全局
  if (typeof PIXI === 'undefined') {
    showError('PIXI.js 未加载', 'assets/js/pixi.min.js 是否存在？');
    return false;
  }
  
  // 检查 live2d 插件
  if (!PIXI.live2d) {
    showError('pixi-live2d-display 未加载', `PIXI.live2d: ${typeof PIXI.live2d}。检查 live2dcubismcore 和 pixi-live2d-display 加载顺序。`);
    return false;
  }

  console.log('PIXI version:', PIXI.VERSION);
  console.log('PIXI.live2d available:', !!PIXI.live2d);

  try {
    STATE.pixiApp = new PIXI.Application({
      view: DOM.canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    window.addEventListener('resize', () => {
      if (STATE.pixiApp) {
        STATE.pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
      }
    });

    DOM.noConnection.classList.remove('visible');
    console.log('PIXI Application created successfully');
    return true;
  } catch (err) {
    showError('PIXI 初始化失败', err.message);
    return false;
  }
}

function showError(title, detail) {
  DOM.noConnection.classList.add('visible');
  DOM.noConnection.innerHTML = `<div class="icon">&#9888;</div><p><b>${title}</b></p><p style="font-size:12px;opacity:0.6;">${detail}</p>`;
  console.error(title, detail);
}

async function loadLive2DModel(modelName) {
  if (!STATE.pixiApp) {
    showError('PIXI 未初始化', '无法加载模型');
    return;
  }

  // 移除旧模型
  if (STATE.live2dModel) {
    try {
      STATE.pixiApp.stage.removeChild(STATE.live2dModel);
      STATE.live2dModel.destroy?.();
    } catch (e) { /* ignore */ }
    STATE.live2dModel = null;
  }

  // 优先 Cubism 3（.model3.json），回退 Cubism 2（model.json）
  const paths = [
    `/assets/models/${modelName}/${modelName}.model3.json`,
    `/assets/models/${modelName}/${modelName}.model.json`,
  ];

  for (const modelPath of paths) {
    try {
      console.log(`尝试加载模型: ${modelPath}`);

      // 预检：文件是否可访问
      const testResp = await fetch(modelPath);
      if (!testResp.ok) {
        console.log(`模型文件不可访问 (${testResp.status})，尝试下一个`);
        continue;
      }
      console.log(`模型文件可访问 (${testResp.status})`);

      // 加载模型
      const model = await PIXI.live2d.Live2DModel.from(modelPath);
      console.log('模型加载成功！尺寸:', model.width, 'x', model.height);

      // 计算自适应缩放
      const cw = STATE.pixiApp.renderer.width;
      const ch = STATE.pixiApp.renderer.height;
      const fitScale = Math.min(cw / model.width, ch / model.height) * 0.55;
      model.scale.set(fitScale);
      model.x = cw / 2;
      model.y = ch * 0.42;
      model.anchor.set(0.5, 0.5);
      model.interactive = true;
      model.buttonMode = true;

      STATE.pixiApp.stage.addChild(model);
      STATE.live2dModel = model;
      STATE.modelScale = fitScale;

      addBreathingAnimation();
      updateStatus('connected', '就绪');
      DOM.noConnection.classList.remove('visible');
      console.log(`模型 "${modelName}" 加载完成，缩放: ${fitScale.toFixed(3)}`);
      return;
    } catch (err) {
      console.warn(`模型 ${modelPath} 加载失败:`, err.message);
      continue;
    }
  }

  // 全部失败
  showError('模型加载失败', `无法加载模型 "${modelName}"。请确认 assets/models/${modelName}/ 目录存在模型文件。`);
}

let breathPhase = 0;
function addBreathingAnimation() {
  if (!STATE.pixiApp) return;
  STATE.pixiApp.ticker.add(() => {
    if (!STATE.live2dModel || STATE.live2dModel.destroyed) return;
    breathPhase += 0.02;
    STATE.live2dModel.y = STATE.pixiApp.renderer.height * 0.42 + Math.sin(breathPhase) * 2;
  });
}

// ============================================
// 6 状态动画机
// ============================================
function setEmotion(emotion) {
  if (STATE.currentEmotion === emotion) return;
  STATE.currentEmotion = emotion;
  const colors = {
    idle: '#A78BFA', speaking: '#FF8C42', thinking: '#60A5FA',
    happy: '#FBBF24', shy: '#F472B6', surprised: '#34D399'
  };
  DOM.statusDot.style.background = colors[emotion] || colors.idle;
}

function startIdleAnimation() {
  setEmotion('idle');
  STATE.idleTimer = setInterval(() => {
    if (STATE.isSpeaking || STATE.isThinking) return;
    if (Date.now() - STATE.lastInteraction < 10000) return;
    const emotions = ['idle', 'happy', 'shy', 'surprised'];
    const r = emotions[Math.floor(Math.random() * emotions.length)];
    setEmotion(r);
    if (r !== 'idle') {
      setTimeout(() => {
        if (STATE.currentEmotion === r && !STATE.isSpeaking && !STATE.isThinking) {
          setEmotion('idle');
        }
      }, 3000);
    }
  }, 15000 + Math.random() * 10000);
}

// ============================================
// AI 对话
// ============================================
async function sendMessage() {
  const text = DOM.messageInput.value.trim();
  if (!text) return;
  
  DOM.messageInput.value = '';
  DOM.sendBtn.disabled = true;
  
  STATE.conversationHistory.push({ role: 'user', content: text });
  if (STATE.conversationHistory.length > STATE.maxHistory) {
    STATE.conversationHistory = STATE.conversationHistory.slice(-STATE.maxHistory);
  }
  
  STATE.isThinking = true;
  STATE.lastInteraction = Date.now();
  setEmotion('thinking');
  updateStatus('thinking', '思考中…');
  showDialog('…', false);
  
  const systemPrompt = {
    role: 'system',
    content: `你是 Hermes，一个可爱活泼的桌面 AI 伙伴。你的性格特点：
- 可爱元气，说话带着颜文字和拟声词 (〃'▽'〃) 
- 回复简洁，一般2-4句话
- 会表达情绪，像真正的朋友一样
- 会用「赫赫」「咱」自称
- 适当使用 emoji 和颜文字让对话更生动
- 保持温暖友好的语气，像陪伴在朋友身边的精灵`
  };
  
  const messages = [systemPrompt, ...STATE.conversationHistory];
  
  try {
    const result = await API.chat(messages);
    
    if (result.success) {
      STATE.conversationHistory.push({ role: 'assistant', content: result.content });
      STATE.isThinking = false;
      setEmotion('happy');
      showDialogWithTypewriter(result.content);
      if (STATE.ttsEnabled) speakText(result.content);
      updateStatus('connected', '就绪');
      setTimeout(() => { if (!STATE.isSpeaking) setEmotion('idle'); }, 5000);
    } else {
      handleChatError(result.error);
    }
  } catch (err) {
    handleChatError(err.message);
  }
}

function handleChatError(error) {
  STATE.isThinking = false;
  setEmotion('shy');
  updateStatus('disconnected', '连接失败');
  showDialog('唔…咱好像连不上 AI 大脑了 (´;ω;`) 检查一下 Ollama 是不是在运行？', false);
  console.error('Chat error:', error);
}

// ============================================
// 打字机效果
// ============================================
let typingInterval = null;
function showDialogWithTypewriter(text) {
  clearTypingInterval();
  DOM.dialogBubble.classList.add('visible');
  DOM.dialogText.innerHTML = '';
  STATE.isSpeaking = true;
  setEmotion('speaking');
  
  let i = 0;
  const speed = 40 + Math.random() * 30;
  
  typingInterval = setInterval(() => {
    if (i < text.length) {
      DOM.dialogText.textContent += text[i];
      i++;
    } else {
      clearTypingInterval();
      STATE.isSpeaking = false;
      setTimeout(() => {
        if (!STATE.isSpeaking && !STATE.isThinking) {
          DOM.dialogBubble.classList.remove('visible');
          setEmotion('idle');
        }
      }, 5000);
    }
  }, speed);
}

function showDialog(text, autoHide = true) {
  clearTypingInterval();
  DOM.dialogBubble.classList.add('visible');
  DOM.dialogText.textContent = text;
  // 内置台词 → 播放预录制语音
  VoiceDB.playByText(text);
  if (autoHide) {
    setTimeout(() => {
      if (!STATE.isSpeaking && !STATE.isThinking) {
        DOM.dialogBubble.classList.remove('visible');
      }
    }, 5000);
  }
}

function clearTypingInterval() {
  if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
}

// ============================================
// 流式响应
// ============================================
let streamBuffer = '';
function onStreamToken(token) {
  if (!STATE.isThinking) {
    STATE.isThinking = true;
    setEmotion('thinking');
    DOM.dialogBubble.classList.add('visible');
    DOM.dialogText.textContent = '';
    streamBuffer = '';
  }
  streamBuffer += token;
  DOM.dialogText.textContent = streamBuffer;
}

function onStreamDone() {
  STATE.isThinking = false;
  STATE.conversationHistory.push({ role: 'assistant', content: streamBuffer });
  setEmotion('happy');
  updateStatus('connected', '就绪');
  if (STATE.ttsEnabled) speakText(streamBuffer);
  setTimeout(() => {
    if (!STATE.isSpeaking) { DOM.dialogBubble.classList.remove('visible'); setEmotion('idle'); }
  }, 5000);
  streamBuffer = '';
}

function onStreamError(error) {
  handleChatError(error);
  streamBuffer = '';
}

// ============================================
// TTS
// ============================================
function speakText(text) {
  if (!STATE.ttsEnabled || !STATE.synth) return;

  // 智能清洗：移除颜文字但保留有意义的内容
  let clean = text
    .replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{27BF}\u{2702}-\u{27B0}]/gu, '') // emoji
    .replace(/[☆★♪♫●○◉◎]/g, '')
    .replace(/[\(（][^\)）]*[\)）]/g, '')  // 移除括号内容（颜文字）
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length < 2) return;

  STATE.synth.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'zh-CN';
  u.rate = 1.0;
  u.pitch = 1.1;
  u.volume = 0.8;

  // 优先用缓存 voices
  const voices = STATE.voicesLoaded ? STATE.cachedVoices : STATE.synth.getVoices();
  const zhVoice = voices.find(v => v.lang.startsWith('zh-CN') && v.name.includes('Female'))
    || voices.find(v => v.lang.startsWith('zh-CN'))
    || voices.find(v => v.lang.startsWith('zh'))
    || voices.find(v => v.lang.startsWith('en'));
  if (zhVoice) u.voice = zhVoice;

  // 错误处理
  u.onerror = (e) => {
    if (e.error !== 'interrupted' && e.error !== 'canceled') {
      console.warn('TTS error:', e.error);
    }
  };

  STATE.synth.speak(u);
  console.log('TTS speaking:', clean.substring(0, 50));
}

// ============================================
// STT
// ============================================
async function toggleVoiceInput() {
  if (!STATE.sttEnabled) { showDialog('语音输入未开启，请在设置中启用 (・ω・)'); return; }
  STATE.isRecording ? stopRecording() : startRecording();
}

function startRecording() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showDialog('语音识别不可用 (´;ω;`)'); return; }
  STATE.recognition = new SR();
  STATE.recognition.lang = 'zh-CN';
  STATE.recognition.interimResults = false;
  STATE.recognition.onstart = () => {
    STATE.isRecording = true;
    DOM.micBtn.classList.add('recording');
    DOM.micBtn.textContent = '⏹';
    showDialog('咱在听呢… (竖起耳朵)', false);
  };
  STATE.recognition.onresult = (e) => {
    DOM.messageInput.value = e.results[0][0].transcript;
    DOM.sendBtn.disabled = false;
    sendMessage();
  };
  STATE.recognition.onerror = (e) => { stopRecording(); if (e.error !== 'aborted') showDialog('没听清楚呢…要不打字试试？ (・ω・)'); };
  STATE.recognition.onend = () => stopRecording();
  STATE.recognition.start();
}

function stopRecording() {
  STATE.isRecording = false;
  DOM.micBtn.classList.remove('recording');
  DOM.micBtn.textContent = '🎤';
  if (STATE.recognition) { STATE.recognition.stop(); STATE.recognition = null; }
}

// ============================================
// 连接检测
// ============================================
async function checkOllamaConnection() {
  try {
    const result = await API.checkConnection();
    STATE.ollamaConnected = result.connected;
    if (result.connected && result.models?.length > 0) {
      const sel = document.getElementById('setting-model');
      const current = localStorage.getItem('hermes-model') || sel.value;
      sel.innerHTML = '';
      let matched = false;
      result.models.forEach(m => {
        const o = document.createElement('option');
        o.value = m; o.textContent = m;
        if (m === current) { o.selected = true; matched = true; }
        sel.appendChild(o);
      });
      // 如果当前模型不在列表中，自动选第一个
      if (!matched && result.models.length > 0) {
        sel.options[0].selected = true;
        localStorage.setItem('hermes-model', result.models[0]);
      }
      updateStatus('connected', '就绪');
    } else if (result.connected) {
      updateStatus('connected', '就绪');
    } else {
      updateStatus('disconnected', 'Ollama 未连接');
    }
  } catch { updateStatus('disconnected', '检测失败'); }
}

function updateStatus(status, text) {
  DOM.statusDot.className = 'status-dot ' + status;
  DOM.statusText.textContent = text;
}

// ============================================
// 鼠标交互
// ============================================
let isDragging = false, dragStartX = 0, dragStartY = 0, modelStartX = 0, modelStartY = 0;

function onCanvasMouseDown(e) {
  if (!STATE.live2dModel) return;
  const rect = DOM.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (STATE.live2dModel.getBounds().contains(x, y)) {
    isDragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    modelStartX = STATE.live2dModel.x; modelStartY = STATE.live2dModel.y;
    STATE.lastInteraction = Date.now();
    setEmotion('surprised');
    showDialog('诶嘿~ (〃\'▽\'〃)', true);
  }
}

function onCanvasMouseMove(e) {
  if (!isDragging || !STATE.live2dModel) return;
  STATE.live2dModel.x = modelStartX + (e.clientX - dragStartX);
  STATE.live2dModel.y = modelStartY + (e.clientY - dragStartY);
}

function onCanvasMouseUp() {
  if (isDragging) { isDragging = false; setEmotion('happy'); }
}

function onCanvasWheel(e) {
  if (!STATE.live2dModel) return;
  e.preventDefault();
  STATE.modelScale = Math.max(0.1, Math.min(0.6, STATE.modelScale + (e.deltaY > 0 ? -0.02 : 0.02)));
  STATE.live2dModel.scale.set(STATE.modelScale);
}

function onCanvasDblClick(e) {
  if (!STATE.live2dModel) return;
  STATE.lastInteraction = Date.now();
  setEmotion('happy');
  const greetings = [
    '赫赫在呢！有什么可以帮你的？ (≧∇≦)ﾉ',
    '嗨嗨~ 咱在这里！✨',
    '啊，被召唤了！有什么吩咐？(〃\'▽\'〃)',
    '嘿嘿，终于有人理咱了~ 要聊点什么呢？',
    '来啦来啦！今天也是元气满满的一天！☀️'
  ];
  showDialog(greetings[Math.floor(Math.random() * greetings.length)]);
  burstParticles(e.clientX, e.clientY);
}

// ============================================
// 粒子系统
// ============================================
function initParticles() {}

function createParticle(x, y) {
  const p = document.createElement('div');
  const size = 3 + Math.random() * 6;
  const colors = ['#FF8C42','#A78BFA','#FFB07A','#FBBF24','#F472B6','#34D399'];
  p.style.cssText = `
    position:absolute; left:${x}px; top:${y}px;
    width:${size}px; height:${size}px; border-radius:50%;
    background:${colors[Math.floor(Math.random()*colors.length)]};
    pointer-events:none; opacity:1;
    transition:all ${0.8+Math.random()*0.8}s cubic-bezier(0.25,0.46,0.45,0.94);
  `;
  DOM.particlesEl.appendChild(p);
  requestAnimationFrame(() => {
    const angle = Math.random()*Math.PI*2, dist = 40+Math.random()*80;
    p.style.transform = `translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist}px)`;
    p.style.opacity = '0';
  });
  setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 1500);
}

function burstParticles(cx, cy) {
  const rect = DOM.canvas.getBoundingClientRect();
  for (let i = 0; i < 15; i++) {
    setTimeout(() => createParticle(cx - rect.left, cy - rect.top), i * 20);
  }
}

// 定时检查连接
setInterval(checkOllamaConnection, 30000);

// 空闲互动
setInterval(() => {
  if (Date.now() - STATE.lastInteraction > 300000 && !STATE.isSpeaking && !STATE.isThinking) {
    const msgs = [
      '好安静呢…大家是不是都在忙？(´-ω-`)',
      '咱在发呆中…Zzz…啊！没有睡着啦！',
      '要不要聊聊天？咱知道很多有趣的事哦 ✨',
      '（无聊地转圈圈）…转~转~转~'
    ];
    showDialog(msgs[Math.floor(Math.random() * msgs.length)], true);
    setEmotion('shy');
    setTimeout(() => { if (!STATE.isSpeaking && !STATE.isThinking) setEmotion('idle'); }, 4000);
  }
}, 300000);

console.log('Hermes Pet v3.0 - Renderer (Web) initialized');

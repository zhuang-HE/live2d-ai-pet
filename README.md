# 🧚 Live2D AI Pet

> AI 桌面伙伴 — PIXI.js + Live2D + Ollama 大模型驱动

一个运行在桌面上的 Live2D 角色，接入了 Ollama 本地大模型，能和你聊天、听你说话、用语音回复。支持 Cubism 2/3 模型格式，可拖拽、缩放，带有 6 种情绪状态的动画机。

---

## ✨ 特性

| 功能 | 说明 |
|------|------|
| 🎭 **Live2D 渲染** | PIXI.js + pixi-live2d-display，支持 Cubism 2/3 模型 |
| 🧠 **AI 对话** | Ollama 本地大模型驱动（自动匹配可用模型） |
| 🎙️ **语音交互** | TTS 语音合成 + STT 语音输入 (Web Speech API) |
| 😊 **6 情绪状态机** | idle / speaking / thinking / happy / shy / surprised |
| 🖱️ **拖拽缩放** | 鼠标拖拽移动角色，滚轮缩放 |
| ✨ **粒子特效** | 双击触发彩色粒子爆发 |
| ⏰ **空闲互动** | 5 分钟无操作自动搭话 |
| 🌐 **WebSocket 流式** | AI 回复实时打字机效果 |
| 🎨 **暖阳橙设计** | #FF8C42 主色 + #A78BFA 辅色 |

---

## 🚀 快速开始

### 前置条件

- Node.js ≥ 18
- [Ollama](https://ollama.com/) 已安装并运行
- 至少下载一个模型：`ollama pull qwen2.5:7b`

### 安装运行

```bash
# 1. 克隆仓库
git clone https://github.com/zhuang-HE/live2d-ai-pet.git
cd live2d-ai-pet

# 2. 安装依赖
npm install

# 3. 启动
npm start
```

浏览器自动打开 `http://localhost:3456`，Live2D 角色出现在页面中央。

---

## 🎮 操作指南

| 操作 | 效果 |
|------|------|
| 底部输入框 + Enter | 发送消息给 AI |
| 🎤 麦克风按钮 | 语音输入（需浏览器授权） |
| 拖拽角色 | 移动位置 |
| 滚轮 | 缩放大小 |
| 双击角色 | 粒子爆发 + 随机问候 |
| 右上角 ⚙️ | 打开设置面板 |

---

## ⚙️ 设置

| 设置项 | 说明 |
|--------|------|
| Ollama 地址 | 默认 `http://localhost:11434` |
| 模型 | 自动检测已安装模型，默认选第一个 |
| 透明度 | 滑块调节（暂仅影响视觉） |
| TTS 语音 | 开启/关闭 AI 语音朗读 |
| STT 语音输入 | 开启/关闭麦克风输入 |
| Live2D 模型 | 切换角色（Hiyori / 006 / 007 / Senko） |

---

## 📁 项目结构

```
live2d-ai-pet/
├── server.js              # Node.js 后端 (Express + WebSocket)
├── package.json
├── start.bat              # Windows 一键启动
├── assets/
│   ├── js/                # PIXI.js + Live2D Cubism Core + pixi-live2d-display
│   └── models/            # 4 个 Live2D 模型
│       ├── Hiyori/        # Cubism 3 格式（默认）
│       ├── 006/           # Cubism 2 格式
│       ├── 007/           # Cubism 2 格式
│       └── Senko/         # Cubism 3 格式
└── src/
    ├── renderer/
    │   ├── index.html     # 主页面 UI
    │   └── app.js         # 渲染逻辑（~750 行）
    ├── main/              # Electron 备用（暂未启用）
    └── preload/
```

---

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js + Express + ws |
| 渲染 | PIXI.js 6 + pixi-live2d-display 0.4.0 |
| Live2D | Cubism Core (Cubism 2/3/4 兼容) |
| AI | Ollama API (Chat + Stream) |
| 语音 | Web Speech API (TTS + STT) |
| 通信 | REST + WebSocket |

---

## 🔧 常见问题

### 网页空白 / JS 未加载
检查浏览器控制台。如使用 `<meta>` Content-Security-Policy，确保允许 `script-src` 加载同源脚本。**当前版本已删除 CSP 标签**。

### 显示"Ollama 未连接"
确保 Ollama 正在运行：
```bash
ollama serve
```
检查地址是否为 `http://localhost:11434`（可在设置面板修改）。

### 模型加载失败
确认 `assets/models/` 目录下存在模型文件。默认加载 Hiyori，可在设置面板切换。

### 没有语音
Chrome/Edge 需要 HTTPS 或 localhost 才能使用 Web Speech API。`localhost:3456` 符合要求。首次加载 voices 可能延迟 3-5 秒。

---

## 📄 License

MIT

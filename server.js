/**
 * Hermes Pet v3.0 - Node.js Backend Server
 * 
 * 功能：静态文件托管 + Ollama API 代理 + WebSocket 实时推送
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3456;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

const app = express();

// ============================================
// 静态文件
// ============================================
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use(express.json());

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
});

// ============================================
// Ollama API 代理
// ============================================
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model = 'qwen2.5:7b' } = req.body;
    
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: 0.7, top_p: 0.9 }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    res.json({ success: true, content: data.message.content });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// 检查连接
app.get('/api/status', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) return res.json({ connected: false });
    const data = await response.json();
    res.json({ 
      connected: true, 
      models: data.models?.map(m => m.name) || [] 
    });
  } catch {
    res.json({ connected: false, models: [] });
  }
});

// ============================================
// HTTP + WebSocket Server
// ============================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.type === 'chat') {
        // 流式 AI 对话
        const { messages, model = 'qwen2.5:7b' } = msg;
        
        const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
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
          ws.send(JSON.stringify({ type: 'error', content: `Ollama error: ${response.status}` }));
          return;
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
                ws.send(JSON.stringify({ type: 'token', content: chunk.message.content }));
              }
            } catch (e) { /* skip */ }
          }
        }

        ws.send(JSON.stringify({ type: 'done' }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', content: err.message }));
    }
  });

  ws.on('close', () => console.log('WebSocket client disconnected'));
});

// ============================================
// 启动
// ============================================
server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🧚 Hermes Pet v3.0 - AI 桌面伙伴      ║
  ║   暖阳橙 #FF8C42  |  柔和紫 #A78BFA     ║
  ╠══════════════════════════════════════════╣
  ║   本地地址: ${url}            ║
  ║   Ollama:   ${OLLAMA_HOST}                ║
  ╚══════════════════════════════════════════╝
  `);
  
  // 自动打开浏览器
  const cmd = process.platform === 'win32' 
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log('请手动打开:', url);
  });
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\nHermes Pet 正在关闭...');
  server.close();
  process.exit(0);
});

// 防崩溃
process.on('uncaughtException', (err) => {
  console.error('未捕获异常:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('未处理 Promise 拒绝:', reason);
});

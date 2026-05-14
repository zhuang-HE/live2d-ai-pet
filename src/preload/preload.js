/**
 * Hermes Pet v3.0 - Preload Script
 * 
 * 通过 contextBridge 暴露安全的 API 给渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hermesAPI', {
  // === 窗口控制 ===
  minimize: () => ipcRenderer.invoke('window:minimize'),
  hide: () => ipcRenderer.invoke('window:hide'),
  close: () => ipcRenderer.invoke('window:close'),

  // === 设置管理 ===
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // === AI 对话 ===
  chat: (messages) => ipcRenderer.invoke('ai:chat', messages),
  chatStream: (messages) => ipcRenderer.invoke('ai:chatStream', messages),
  checkConnection: () => ipcRenderer.invoke('ai:checkConnection'),

  // === 流式事件监听 ===
  onStreamToken: (callback) => {
    ipcRenderer.on('ai:streamToken', (_, token) => callback(token));
  },
  onStreamDone: (callback) => {
    ipcRenderer.on('ai:streamDone', () => callback());
  },
  onStreamError: (callback) => {
    ipcRenderer.on('ai:streamError', (_, error) => callback(error));
  },

  // === 主进程事件 ===
  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', () => callback());
  },

  // === 移除监听 ===
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

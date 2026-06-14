<h1 align="center">
  🦉 LENS — AI 视觉对话助手
</h1>

<p align="center">
  <strong>解放双手，用声音和摄像头与世界互动</strong>
</p>

<p align="center">
  <a href="https://49.233.93.220"><strong>🔗 在线体验：https://49.233.93.220</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-blue" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-0.115+-green" alt="FastAPI">
  <img src="https://img.shields.io/badge/Qwen-Omni%20Flash-orange" alt="Qwen">
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o%20Realtime-412991" alt="OpenAI">
  <img src="https://img.shields.io/badge/PWA-ready-purple" alt="PWA">
</p>

---

## 🎯 这是什么？

**LENS** 是一款 AI 视觉对话应用。打开摄像头和麦克风，AI 能实时看到你的画面、听到你的声音，并以文字+语音做出回应。

### 六大使用场景

| 🍳 辅助烹饪 | 🔍 物品寻找 | 📖 学习助手 |
|:---:|:---:|:---:|
| 满手是油不动手机 | 找不到钥匙钱包 | 白板笔记代码报错 |
| 张嘴就问下一步 | AI 帮你四处找 | 摄像头对准直接问 |

| 🔧 DIY 维修 | 👶 儿童教育 | ♿ 视觉辅助 |
|:---:|:---:|:---:|
| 边修边问解放双手 | 孩子指着问这是什么 | 用声音感知环境 |

---

## ✨ 功能特性

- 🎥 **实时视觉理解** — AI 看到摄像头画面，理解场景、物体、文字
- 🎤 **自然语音对话** — 边说边听边回应，像和真人聊天
- 📝 **流式文字回复** — 逐字显示，阅读体验流畅
- 🔊 **语音播报** — TTS 语音读出回复（可关闭省费）
- 🎭 **场景化主题** — 6 大场景，每个有独立配色和 AI 角色
- 🔄 **多模型支持** — Qwen Omni / OpenAI GPT-4o / 自定义端点
- 💰 **成本可控** — 自适应帧率、VAD 静音过滤、用户自有 Key
- 📱 **PWA 安装** — 可添加到手机桌面，像原生 App
- 🖥️📱 **双设备模式** — 电脑端浮动窗 + 手机端全屏

---

## 🚀 快速开始

### 本地运行

```bash
# 1. 克隆
git clone https://github.com/ddf-gif/Xenginner-6.12.git
cd Xenginner-6.12/backend

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置 API Key
echo "QWEN_API_KEY=你的Key" > .env

# 4. 启动
python3 main.py
# → http://localhost:8000
```

### Docker 部署

```bash
docker-compose up -d
# → http://localhost:3000
```

### 一键部署到服务器

```bash
bash deploy.sh <你的API_Key>
```

---

## 🛠 技术栈

| 层 | 技术 |
|---|------|
| 前端 | HTML5 + CSS3 + Vanilla JS (Web Audio / Canvas / MediaDevices) |
| 后端 | Python 3.11+ / FastAPI / websockets |
| AI 模型 | Qwen3-Omni-Flash-Realtime / OpenAI GPT-4o Realtime |
| 部署 | Docker + Nginx + Systemd / PWA |

---

## 📁 项目结构

```
Xenginner-6.12/
├── backend/
│   ├── main.py          # FastAPI + WebSocket 端点
│   ├── qwen_relay.py    # 多模型中继客户端
│   ├── protocol.py      # 消息协议定义
│   ├── config.py        # 配置管理
│   └── requirements.txt
├── frontend/
│   ├── index.html       # 三页 SPA（首页/设置/对话）
│   ├── css/style.css    # 完整样式系统
│   ├── js/
│   │   ├── app.js           # 主逻辑 + 场景系统
│   │   ├── ui.js            # UI 工具函数
│   │   ├── audio-capture.js # 音频采集 (PCM16)
│   │   ├── audio-playback.js# 音频播放
│   │   ├── video-capture.js # 视频采集 (自适应帧率)
│   │   └── ws-client.js     # WebSocket 客户端
│   ├── manifest.json    # PWA 配置
│   └── sw.js            # Service Worker
├── docs/DESIGN.md       # 设计文档
├── Dockerfile
├── docker-compose.yml
└── deploy.sh            # 一键部署脚本
```

---

## 📄 设计文档

完整设计文档：[docs/DESIGN.md](docs/DESIGN.md)

包含：24 个用户故事、10 项成本控制策略、系统架构、协议设计、音视频技术细节。

---

## 📜 License

MIT

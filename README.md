# 🤖 AI 视觉对话助手

基于 **Qwen3-Omni-Flash-Realtime** 多模态大模型的实时 AI 视觉对话应用。

打开摄像头与麦克风，AI 能看见你、听见你，并实时做出回应。

## 功能特性

- 🎥 **实时摄像头画面** — AI 能理解你摄像头中的视觉内容
- 🎤 **实时语音对话** — 说话即可与 AI 自然交流
- 📝 **流式文字回复** — AI 回复逐字显示
- 🔊 **语音播报** — AI 以语音方式读回复（可关闭省费）
- 💰 **成本控制** — VAD 静音过滤、480p 低帧率、纯文本模式

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | HTML5 + CSS3 + Vanilla JS (Web Audio API / Canvas / MediaDevices) |
| 后端 | Python 3.11+ / FastAPI / websockets |
| AI | Qwen3-Omni-Flash-Realtime (DashScope WebSocket API) |

## 快速开始

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置 API Key

```bash
cp .env.example .env
# 编辑 .env 填入你的 Qwen API Key
```

### 3. 启动服务

```bash
python main.py
```

### 4. 打开浏览器

访问 http://localhost:8000，点击「开始对话」并授权摄像头与麦克风。

## 项目结构

```
Xenginner-6.12/
├── backend/
│   ├── main.py          # FastAPI 服务 + WebSocket 端点
│   ├── qwen_relay.py    # Qwen 实时 API 中继客户端
│   ├── protocol.py      # 消息协议定义
│   ├── config.py        # 配置管理
│   └── requirements.txt # Python 依赖
├── frontend/
│   ├── index.html       # 应用入口
│   ├── css/style.css    # 暗色主题样式
│   └── js/
│       ├── app.js           # 应用编排
│       ├── ui.js            # UI 工具函数
│       ├── audio-capture.js # 音频采集 (PCM16 16kHz)
│       ├── audio-playback.js# 音频播放 (PCM24 24kHz)
│       ├── video-capture.js # 视频帧采集 (480p JPEG)
│       └── ws-client.js     # WebSocket 客户端
├── docs/DESIGN.md       # 设计文档
└── README.md
```

## 依赖说明

### Python (backend/requirements.txt)
- `fastapi>=0.115.0` — Web 框架
- `uvicorn[standard]>=0.30.0` — ASGI 服务器
- `websockets>=13.0` — WebSocket 客户端

### 第三方 API
- [Qwen3-Omni-Flash-Realtime](https://dashscope.console.aliyun.com/) — 阿里云 DashScope 多模态实时模型

### 浏览器要求
- Chrome 90+ / Edge 90+ / Firefox 90+ (需支持 WebSocket, Web Audio API, MediaDevices)
- HTTPS 或 localhost（浏览器安全策略要求）

## 成本提示

默认开启语音播报（费用较高）。关闭语音播报可降低约 **9 倍** 费用：
- 文字输出: ~8.3 元/百万 Token
- 语音输出: ~75.1 元/百万 Token

建议日常使用纯文字模式，需要时再开启语音。

## License

MIT

# AI 视觉对话助手 — 设计文档

## 一、项目概述

基于 Qwen3-Omni-Flash-Realtime 多模态实时模型的 AI 视觉对话应用。用户通过浏览器打开摄像头和麦克风，AI 能实时感知视频画面和用户语音，以文字+语音方式做出自然回应。

**核心目标**：视觉理解准确、语音交互流畅、成本可控。

---

## 二、系统架构

```
┌─ 浏览器 (Frontend) ─────────────────────────────────────────┐
│                                                              │
│  getUserMedia ──→ <video> ──→ Canvas(480p) ──→ JPEG base64  │
│       │                                                      │
│       └──→ AudioContext(16kHz) ──→ PCM16 ──→ 100ms chunk    │
│                                                              │
│  ws://localhost:8000/ws (自定义 JSON 协议)                   │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────┐
│  FastAPI Backend                                              │
│                                                              │
│  /ws endpoint ──→ QwenRelayClient ──→ wss://dashscope...     │
│                    (双向消息中继)       (Bearer 认证)         │
└──────────────────────────────────────────────────────────────┘
```

### 数据流

1. 浏览器采集摄像头(1fps JPEG 480p) + 麦克风(PCM16 16kHz 100ms chunks)
2. 通过 WebSocket 发送 `{type: "audio"|"video", data: "<base64>"}` 到后端
3. 后端转发到 Qwen DashScope WebSocket API
4. Qwen 通过 server VAD 检测语音结束，生成文字+语音回复
5. 回复流式传回浏览器，文字逐字显示，语音缓冲播放

---

## 三、用户故事

| # | 用户故事 | 计划 | 实现 | 说明 |
|---|---------|:----:|:----:|------|
| US1 | 打开浏览器，授权摄像头和麦克风 | ✅ | ✅ | getUserMedia + 权限 UI |
| US2 | 看到自己的摄像头实时画面 | ✅ | ✅ | `<video>` 元素直接播放 |
| US3 | 说话后 AI 以文字回答 | ✅ | ✅ | Qwen text delta → 流式显示 |
| US4 | 说话后 AI 以语音回答 | ✅ | ✅ | PCM24 解码 → AudioContext 播放 |
| US5 | 看到 AI 的实时状态（聆听/思考/说话） | ✅ | ✅ | 状态灯 + 文字 + 视频框发光 |
| US6 | AI 能看到摄像头内容并描述 | ✅ | ✅ | 视频帧每1秒发送至 Qwen |
| US7 | 连续多轮对话 | ✅ | ✅ | 8轮自动重启 session |
| US8 | 断线后自动重连 | ✅ | ✅ | 指数退避 1s→30s |
| US9 | 切换纯文本/语音回复模式 | ✅ | ✅ | 开关控件，关闭省9倍费 |

**汇总**：计划 9 个用户故事，全部实现 ✅

---

## 四、端云协同成本控制策略

| # | 策略 | 方案 | 采用 | 说明 |
|---|------|------|:---:|------|
| 1 | **服务端 VAD** | 开启 `server_vad`，静音时段不计费 | ✅ | 节省 50-70% 音频输入费用 |
| 2 | **降低视频分辨率** | Canvas 缩放至 854×480 (480p) | ✅ | 比 720p 节省约 60% token |
| 3 | **JPEG 压缩** | 质量 0.6，自动降质回退 | ✅ | 比质量 0.9 节省约 40% |
| 4 | **限制帧率** | 严格 1fps | ✅ | 避免不必要的视频帧上传 |
| 5 | **默认纯文本输出** | `modalities: ["text"]` 为默认，语音可选 | ✅ | 语音输出费用是文本的 9 倍 |
| 6 | **Token 上限** | `max_tokens: 1024` | ✅ | 防止长篇回复失控 |
| 7 | **空闲超时** | 120 秒无活动自动断开 | ✅ | 避免空闲会话持续计费 |
| 8 | **8 轮自动重启** | Flash 模型 8 轮限制，自动重建 session | ✅ | API 强制要求，同时控制单 session 费用 |

**其他曾考虑但未采用的策略**：

| 策略 | 未采用原因 |
|------|-----------|
| 客户端 VAD | 增加复杂度，服务端 VAD 已满足需求 |
| 视频帧内容变化检测 | 实现复杂，1fps 已足够控制成本 |
| 本地缓存常见回复 | 视觉对话内容多样，缓存命中率低 |
| WebRTC P2P 传输 | 需要额外的信令服务器，增加部署复杂度 |

---

## 五、WebSocket 协议设计

### 5.1 浏览器 ↔ 后端（自定义 JSON）

```
→ { type: "start_session" }
→ { type: "audio",       data: "<base64 PCM16>" }
→ { type: "video",       data: "<base64 JPEG>" }
→ { type: "end_session" }

← { type: "status",      state: "listening|thinking|speaking|error" }
← { type: "text_delta",  text: "..." }
← { type: "text_done",   text: "..." }
← { type: "audio_delta", data: "<base64 PCM24>" }
← { type: "audio_done" }
← { type: "error",       code: "...", message: "..." }
```

### 5.2 后端 ↔ Qwen DashScope（原生协议）

```
→ session.update                (配置 modalities, VAD, voice)
→ input_audio_buffer.append     (PCM16 16kHz, 100ms chunk)
→ input_image_buffer.append     (JPEG base64, ≤256KB, 1fps)
→ response.cancel               (中断回复)

← session.created / updated
← input_audio_buffer.speech_started / stopped
← response.text.delta / done
← response.audio.delta / done
← response.done
← error
```

---

## 六、音频处理技术细节

### 采集链（浏览器 → Qwen）
```
麦克风 (48kHz Float32) 
  → AudioContext({sampleRate: 16000}) 下采样
  → ScriptProcessorNode 提取 Float32Array
  → Float32 → Int16 PCM 转换 (满量程映射)
  → 100ms 缓冲 (1600 采样 = 3200 字节)
  → Int16Array → base64 编码
  → WebSocket 发送
```

### 播放链（Qwen → 浏览器）
```
WebSocket 接收 base64
  → atob 解码 → Uint8Array
  → PCM24 (3字节/采样, 小端有符号) → Int16
  → 线性插值重采样 24kHz → AudioContext.sampleRate
  → Float32Array → AudioBuffer
  → AudioBufferSourceNode → 扬声器
```

### 自动播放缓冲
- 当缓冲区累积 ≥ 12000 采样点 (~0.5s) 时自动触发播放
- 播放期间新音频持续缓冲，播放结束后自动衔接

---

## 七、视频处理技术细节

```
<video> (原始分辨率, 如 1280×720)
  → Canvas drawImage(0, 0, 854, 480) 缩放
  → toBlob('image/jpeg', 0.6) JPEG 编码
  → FileReader → 提取 base64
  → 大小检查: 若 >256KB 则降低质量重试 (最低 0.3)
  → WebSocket 发送 (1fps setInterval)
```

---

## 八、已知限制

1. **8 轮限制**: Qwen3-Omni-Flash-Realtime 每次 session 最多 8 轮对话，第 7 轮自动重建
2. **120 分钟上限**: 单个 session 最长 120 分钟
3. **不支持工具调用**: Flash 模型不支持 function calling
4. **视频上下文窗口**: 240 秒滑动窗口，旧帧自动丢弃
5. **浏览器兼容性**: 需要 HTTPS 或 localhost，支持 Chrome/Edge/Firefox 90+
6. **ScriptProcessorNode**: 虽已标记废弃但广泛支持，未来可迁移至 AudioWorklet

---

## 九、未来增强方向

1. **AudioWorklet 迁移**: 替换 ScriptProcessorNode 以降低延迟
2. **移动端适配**: PWA + 响应式布局优化
3. **多语言支持**: 动态切换 Qwen 指令语言
4. **屏幕共享**: 让 AI 看到用户的屏幕内容
5. **对话历史**: 持久化对话记录
6. **WebRTC 传输**: 降低音频/视频延迟

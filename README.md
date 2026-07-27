# Tracking Mirror

追踪特效镜 — MediaPipe 实时识别双手指尖和人脸，在指间生成 3D 多面体应用滤镜特效，支持人脸 emoji 替换，一键录制导出视频。

## 功能

- ✅ 双手实时指尖追踪（MediaPipe Hands）
- ✅ 人脸检测 + emoji 替换（MediaPipe Face Detection）
- ✅ 3D 多面体（2~5 指动态生成）
- ✅ 6 种特效：黑白、反色、CRT扫描线、ASCII、像素、波点
- ✅ 混合模式：每个面不同特效
- ✅ 一键录制导出（MP4 优先，WebM 兜底）
- ✅ 两种分辨率模式：原生 / 自适应

## 运行

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173 → 点击启动摄像头 → 伸出双手 → 特效自动跟随。

## 构建

```bash
npm run build
npm run preview
```

## 操作

| 操作 | 说明 |
|------|------|
| 特效 | 选择框内滤镜效果（混合模式每面不同） |
| 手指数 | 2~5 指，动态生成对应面数的多面体 |
| 😀 | 切换人脸 emoji 替换（开启后特效窗内也带 emoji） |
| 原画面/自适应 | 切换摄像头原始分辨率或适应窗口 |
| 开始录制 | 录制当前画面，停止后自动下载 |

## 技术栈

- **Vite** + ES modules
- **MediaPipe Hands** — 手部关键点识别
- **MediaPipe Face Detection** — 人脸检测与 emoji 替换
- **Canvas 2D** — 画面合成与像素特效
- **MediaRecorder** — 视频录制导出

// main.js — 编排入口（ES module）

import { initHands, pumpHands, stopPumpHands, resumePumpHands } from './hands-tracker.js';
import { initFace, pumpFace, stopPumpFace, resumePumpFace } from './face-tracker.js';
import { initComposer, composeFrame, toggleResMode, toggleFaceReplace, updateFaceCache } from './fx-composer.js';
import { startRecording, stopRecording, isRecording } from './recorder.js';
import './style.css';

const overlayStartBtn = document.getElementById('overlayStartBtn');
const startOverlay = document.getElementById('startOverlay');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingStage = document.getElementById('loadingStage');
const loadingDetail = document.getElementById('loadingDetail');
const progressFill = document.getElementById('progressFill');
const loadingPercent = document.getElementById('loadingPercent');
const camIndicator = document.getElementById('camIndicator');
const recBtn = document.getElementById('recBtn');
const resBtn = document.getElementById('resBtn');
const faceBtn = document.getElementById('faceBtn');
const camVideo = document.getElementById('cam');
const fxCanvas = document.getElementById('fx');

let handsInstance = null;
let faceInstance = null;
let cameraStream = null;
let bootstrapped = false;

let _pendingHands = null;
let _rafId = null;
let _rafActive = false;

// ── 资源下载监控：用 locateFile 回调获取真实文件名 ──
let _handsFileCount = 0;
let _faceFileCount = 0;

function onHandsFile(file) {
  _handsFileCount++;
  // hands 阶段：15% → 45%，按 locateFile 调用次数递增
  const percent = Math.min(45, 15 + _handsFileCount * 6);
  setProgress(percent, '正在下载手势识别资源文件...', file);
}

function onFaceFile(file) {
  _faceFileCount++;
  // face 阶段：50% → 80%，按 locateFile 调用次数递增
  const percent = Math.min(80, 50 + _faceFileCount * 6);
  setProgress(percent, '正在下载人脸识别资源文件...', file);
}

function setCamState(state) {
  if (camIndicator) {
    camIndicator.dataset.state = state;
    const titleMap = {
      idle: '相机未启动',
      loading: '正在启动相机…',
      running: '相机运行中',
      error: '相机启动失败',
    };
    camIndicator.title = titleMap[state] || '';
  }
}

function hideOverlay() {
  if (startOverlay) {
    startOverlay.classList.add('hidden');
  }
}

function showLoading() {
  if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
    loadingOverlay.classList.remove('hidden');
  }
  setProgress(0, '正在初始化...', '准备中');
}

let _currentProgress = 0;

function setProgress(percent, stage, detail) {
  _currentProgress = Math.min(100, Math.max(0, percent));
  if (stage && loadingStage) {
    loadingStage.textContent = stage;
  }
  if (detail && loadingDetail) {
    loadingDetail.textContent = detail;
  }
  if (progressFill) {
    progressFill.style.width = _currentProgress + '%';
  }
  if (loadingPercent) {
    loadingPercent.textContent = Math.round(_currentProgress) + '%';
  }
}

function hideLoading() {
  setProgress(100);
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
    setTimeout(() => {
      loadingOverlay.style.display = 'none';
    }, 350);
  }
}

function rafLoop() {
  if (!_rafActive) return;
  if (camVideo && camVideo.paused && camVideo.readyState >= 2) {
    camVideo.play().catch(() => {});
  }
  composeFrame(_pendingHands);
  _pendingHands = null;
  _rafId = requestAnimationFrame(rafLoop);
}

function startRafLoop() {
  if (_rafActive) return;
  _rafActive = true;
  _rafId = requestAnimationFrame(rafLoop);
}

function stopRafLoop() {
  _rafActive = false;
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  _pendingHands = null;
}

async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;

  showLoading();

  if (overlayStartBtn) {
    overlayStartBtn.disabled = true;
    overlayStartBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  }
  setCamState('loading');

  try {
    setProgress(3, '正在请求摄像头权限...', '等待用户授权');
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    setProgress(10, '正在启动摄像头...', '初始化视频流');
    camVideo.srcObject = cameraStream;
    await camVideo.play();

    await new Promise(resolve => {
      if (camVideo.readyState >= 2 && camVideo.videoWidth) {
        resolve();
      } else {
        camVideo.onloadedmetadata = () => resolve();
      }
    });

    // —— 手势识别 ——
    setProgress(15, '正在初始化手势识别...', '等待下载请求');
    handsInstance = await initHands(onHandFrame, () => {}, onHandsFile);

    setProgress(15, '正在下载手势识别资源文件...', '首次推理');
    try {
      if (camVideo.readyState >= 2 && camVideo.videoWidth) {
        await handsInstance.send({ image: camVideo });
      }
    } catch (e) {}

    // —— 人脸检测 ——
    setProgress(50, '正在初始化人脸检测...', '等待下载请求');
    faceInstance = await initFace(onFaceFrame, () => {}, onFaceFile);

    setProgress(50, '正在下载人脸识别资源文件...', '首次推理');
    try {
      if (camVideo.readyState >= 2 && camVideo.videoWidth) {
        await faceInstance.send({ image: camVideo });
      }
    } catch (e) {}

    // —— 初始化渲染引擎 ——
    setProgress(90, '正在初始化渲染引擎...', 'Canvas 渲染器');
    initComposer(fxCanvas, camVideo);
    startRafLoop();

    setProgress(100, '启动完成', '即将显示画面');

    pumpHands(camVideo, handsInstance);
    if (faceInstance) pumpFace(camVideo, faceInstance);

    await new Promise(resolve => setTimeout(resolve, 200));

    hideOverlay();
    hideLoading();
    setCamState('running');

    if (recBtn) {
      recBtn.disabled = false;
      recBtn.textContent = '开始录制';
    }
    if (resBtn) {
      resBtn.disabled = false;
      resBtn.textContent = '原画面';
      resBtn.classList.add('primary');
    }
    if (faceBtn) {
      faceBtn.disabled = false;
      faceBtn.textContent = '😀';
    }
  } catch (e) {
    bootstrapped = false;
    cleanupFailedBootstrap();
    setCamState('error');
    setProgress(0, '启动失败', e.message || '未知错误');
    if (overlayStartBtn) {
      overlayStartBtn.disabled = false;
      overlayStartBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    }
    console.error('启动失败：', e);
    return;
  }
}

// 失败后清理已启动的资源：pump / raf / mediapipe 实例 / 摄像头流
function cleanupFailedBootstrap() {
  stopRafLoop();
  if (handsInstance) {
    try { stopPumpHands(); } catch (_) {}
    try { handsInstance.close && handsInstance.close(); } catch (_) {}
    handsInstance = null;
  }
  if (faceInstance) {
    try { stopPumpFace(); } catch (_) {}
    try { faceInstance.close && faceInstance.close(); } catch (_) {}
    faceInstance = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  if (camVideo) camVideo.srcObject = null;
}

function onHandFrame(allHands) {
  _pendingHands = allHands;
}

function onFaceFrame(faces) {
  updateFaceCache(faces);
}

function toggleRec() {
  if (isRecording()) {
    stopRecording();
    recBtn.textContent = '开始录制';
    recBtn.classList.remove('primary');
  } else {
    if (startRecording(fxCanvas)) {
      recBtn.textContent = '停止录制';
      recBtn.classList.add('primary');
    }
  }
}

function onResToggle() {
  const mode = toggleResMode();
  if (resBtn) {
    resBtn.textContent = mode === 'native' ? '原画面' : '适应';
    resBtn.classList.toggle('primary', mode === 'native');
  }
}

function onFaceToggle() {
  const on = toggleFaceReplace();
  if (faceBtn) {
    faceBtn.classList.toggle('primary', on);
  }
}

function onVisibilityChange() {
  if (!bootstrapped) return;
  // bootstrap 进行中（handsInstance/faceInstance 尚未就绪）：仅维护 video 播放状态
  if (!handsInstance) {
    if (!document.hidden && camVideo && camVideo.paused && camVideo.readyState >= 2) {
      camVideo.play().catch(() => {});
    }
    return;
  }
  if (document.hidden) {
    stopPumpHands();
    stopPumpFace();
    stopRafLoop();
    if (isRecording()) stopRecording();
  } else {
    if (camVideo && camVideo.readyState >= 2) {
      if (camVideo.paused) camVideo.play().catch(() => {});
      startRafLoop();
      resumePumpHands(camVideo, handsInstance);
      if (faceInstance) resumePumpFace(camVideo, faceInstance);
    }
  }
}

if (overlayStartBtn) overlayStartBtn.addEventListener('click', bootstrap);
if (recBtn) recBtn.addEventListener('click', toggleRec);
if (resBtn) resBtn.addEventListener('click', onResToggle);
if (faceBtn) faceBtn.addEventListener('click', onFaceToggle);
document.addEventListener('visibilitychange', onVisibilityChange);

setCamState('idle');

window.addEventListener('beforeunload', () => {
  stopRafLoop();
  stopPumpHands();
  stopPumpFace();
  if (isRecording()) stopRecording();
  if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
});

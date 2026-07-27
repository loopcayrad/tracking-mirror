// recorder.js — MediaRecorder 录制 Canvas 流（ES module）

let mediaRecorder = null;
let recordedChunks = [];
let recStartTime = 0;
let recTimerInterval = null;
let _prevBlobUrl = null;
let _recStream = null;

function resetRecState() {
  if (recTimerInterval) { clearInterval(recTimerInterval); recTimerInterval = null; }
  const timer = document.getElementById('recTimer');
  if (timer) timer.classList.add('hidden');
}

function stopRecStream() {
  if (_recStream) {
    _recStream.getTracks().forEach(t => t.stop());
    _recStream = null;
  }
}

/**
 * 开始录制 Canvas 流
 */
export function startRecording(canvas) {
  if (!canvas) return false;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') return false;

  const stream = canvas.captureStream(30);
  _recStream = stream;
  recordedChunks = [];

  const candidates = [
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  let mimeType = '';
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
  }
  if (!mimeType) {
    alert('当前浏览器不支持 MediaRecorder');
    stopRecStream();
    return false;
  }

  try {
    mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  } catch (e) {
    alert('MediaRecorder 创建失败：' + e.message);
    stopRecStream();
    return false;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onerror = (e) => {
    console.error('MediaRecorder error:', e.error || e);
    resetRecState();
    const btn = document.getElementById('recBtn');
    if (btn) {
      btn.textContent = '开始录制';
      btn.classList.remove('primary');
    }
    stopRecStream();
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mimeType });
    if (_prevBlobUrl) URL.revokeObjectURL(_prevBlobUrl);
    const url = URL.createObjectURL(blob);
    _prevBlobUrl = url;
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const filename = `tracking_${Date.now()}.${ext}`;
    const link = document.getElementById('downloadLink');
    if (link) {
      link.href = url;
      link.download = filename;
      link.classList.remove('hidden');
      link.textContent = `下载 ${ext.toUpperCase()} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`;
    }
    resetRecState();
    stopRecStream();
  };

  mediaRecorder.start();
  recStartTime = Date.now();

  const timer = document.getElementById('recTimer');
  if (timer) {
    timer.classList.remove('hidden');
    timer.textContent = '00:00';
    recTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      timer.textContent = `${m}:${s}`;
    }, 200);
  }

  return true;
}

export function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  mediaRecorder.stop();
  resetRecState();
}

export function isRecording() {
  return mediaRecorder && mediaRecorder.state === 'recording';
}

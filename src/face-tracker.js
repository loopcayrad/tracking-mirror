// face-tracker.js — MediaPipe Face Detection 加载 + 人脸关键点（ES module）

let _pumpingActive = false;

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229';

// ── One Euro Filter：自适应低通滤波，慢动作高平滑、快动作低延迟 ──
// 论文: Casiez et al., 2012. 对人脸追踪这种慢速场景效果理想。
class OneEuroFilter {
  constructor(freq = 30, mincutoff = 1.0, beta = 0.007, dcutoff = 1.0) {
    this.freq = freq;
    this.mincutoff = mincutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this._xPrev = null;
    this._dxPrev = 0;
    this._tPrev = 0;
    this._alpha = (cutoff) => {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / Math.max(1e-6, 1 / this.freq));
    };
  }
  filter(x, t) {
    if (this._xPrev === null) {
      this._xPrev = x;
      this._tPrev = t;
      return x;
    }
    const dt = Math.max(1e-3, t - this._tPrev);
    this.freq = 1 / dt;
    const dx = (x - this._xPrev) / dt;
    const dCutoff = this.dcutoff;
    const dxHat = this._alpha(dCutoff) * dx + (1 - this._alpha(dCutoff)) * this._dxPrev;
    const cutoff = this.mincutoff + this.beta * Math.abs(dxHat);
    const xHat = this._alpha(cutoff) * x + (1 - this._alpha(cutoff)) * this._xPrev;
    this._xPrev = xHat;
    this._dxPrev = dxHat;
    this._tPrev = t;
    return xHat;
  }
}

// 每个人脸一组 filter（x/y/w/h 各一个），用最近邻匹配上一帧实现关联
let _faceTrackers = [];

function _matchAndSmooth(newFaces, t) {
  if (newFaces.length === 0) {
    _faceTrackers = [];
    return newFaces;
  }
  const result = newFaces.map((face) => {
    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2;
    let bestIdx = -1;
    let bestDist = Infinity;
    _faceTrackers.forEach((tr, i) => {
      if (!tr) return;
      const d = (tr.cx - cx) ** 2 + (tr.cy - cy) ** 2;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    let filters;
    if (bestIdx >= 0 && bestDist < 0.15) {
      filters = _faceTrackers[bestIdx];
      _faceTrackers[bestIdx] = null;
    } else {
      filters = {
        fx: new OneEuroFilter(30, 1.0, 0.007, 1.0),
        fy: new OneEuroFilter(30, 1.0, 0.007, 1.0),
        fw: new OneEuroFilter(30, 1.5, 0.003, 1.0),
        fh: new OneEuroFilter(30, 1.5, 0.003, 1.0),
        cx, cy,
      };
    }
    const sx = filters.fx.filter(face.x, t);
    const sy = filters.fy.filter(face.y, t);
    const sw = filters.fw.filter(face.width, t);
    const sh = filters.fh.filter(face.height, t);
    filters.cx = sx + sw / 2;
    filters.cy = sy + sh / 2;
    return { ...face, x: sx, y: sy, width: sw, height: sh };
  });
  _faceTrackers = _faceTrackers.filter(Boolean);
  return result;
}

export async function initFace(onFrame, onStatus, onLocateFile) {
  const FaceDetection = window.FaceDetection;
  if (!FaceDetection) {
    throw new Error('FaceDetection 未加载');
  }

  const face = new FaceDetection({
    locateFile: (file) => {
      const url = import.meta.env.DEV
        ? new URL(`/node_modules/@mediapipe/face_detection/${file}`, import.meta.url).href
        : `${CDN_BASE}/${file}`;
      onLocateFile && onLocateFile(file);
      return url;
    },
  });

  face.setOptions({
    model: 'short',
    minDetectionConfidence: 0.5,
    selfieMode: true,
  });

  face.onResults((results) => {
    const detections = results.detections || [];
    if (detections.length === 0) {
      _faceTrackers = [];
      onFrame(null);
      return;
    }

    const faces = detections.map((d) => {
      const bbox = d.boundingBox;
      const lm = d.landmarks || [];
      const keypoints = {};
      const labelMap = {
        0: 'rightEye',
        1: 'leftEye',
        2: 'noseTip',
        3: 'mouth',
        4: 'rightEar',
        5: 'leftEar',
      };
      lm.forEach((k, i) => {
        if (labelMap[i]) keypoints[labelMap[i]] = { x: k.x, y: k.y };
      });

      return {
        x: bbox.xCenter - bbox.width / 2,
        y: bbox.yCenter - bbox.height / 2,
        width: bbox.width,
        height: bbox.height,
        keypoints,
      };
    });

    const smoothed = _matchAndSmooth(faces, performance.now() / 1000);
    onFrame(smoothed);
  });

  onStatus && onStatus('FaceDetection 已就绪', 'ok');
  return face;
}

export async function pumpFace(video, face) {
  if (_pumpingActive) return;
  _pumpingActive = true;
  _pumpLoop(video, face);
}

async function _pumpLoop(video, face) {
  if (!_pumpingActive) return;
  if (video.readyState < 2 || !video.videoWidth) {
    requestAnimationFrame(() => _pumpLoop(video, face));
    return;
  }
  try {
    await face.send({ image: video });
  } catch (e) {
    console.warn('[FaceTracker] send error:', e);
  }
  if (!_pumpingActive) return;
  requestAnimationFrame(() => _pumpLoop(video, face));
}

export function stopPumpFace() {
  _pumpingActive = false;
}

export function resumePumpFace(video, face) {
  if (!_pumpingActive) pumpFace(video, face);
}

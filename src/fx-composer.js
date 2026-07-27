// fx-composer.js — Canvas 双层合成（ES module）

import { computeBox, boxBBox } from './box-tracker.js';
import { applyCurrentFilter, getCurrentFilterKey, getFilterColor, getMixedFilterKey } from './filters.js';

let fxCanvas = null;
let fxCtx = null;
let camVideo = null;
let _mirrorCanvas = null;
let _mirrorCtx = null;
let _mirrorW = 0;
let _mirrorH = 0;

let _shapeSel = null;

let _faceReplace = false;
let _faceCache = { faces: null };
let _lastEmojiSize = 0;
const EMOJI_SIZE_MAX_DELTA = 0.03;

// emoji 改用 Twemoji SVG（jsDelivr CDN），跨浏览器像素级一致，不再依赖字体 em-box baseline
let _emojiImage = null;
let _emojiReady = false;
const EMOJI_SVG_URL = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f600.svg';

function loadEmoji() {
  if (_emojiImage) return;
  _emojiImage = new Image();
  _emojiImage.crossOrigin = 'anonymous';
  _emojiImage.onload = () => { _emojiReady = true; };
  _emojiImage.onerror = () => { console.warn('Twemoji SVG 加载失败'); };
  _emojiImage.src = EMOJI_SVG_URL;
}

// 模块加载即启动 emoji 图片预加载
loadEmoji();

let _cover = { dx: 0, dy: 0, dw: 0, dh: 0, scale: 1, vw: 0, vh: 0, W: 0, H: 0 };

let _resMode = 'native';

export function initComposer(canvas, video) {
  fxCanvas = canvas;
  fxCtx = canvas.getContext('2d');
  camVideo = video;

  _mirrorCanvas = document.createElement('canvas');
  _mirrorCtx = _mirrorCanvas.getContext('2d');

  _shapeSel = document.getElementById('shapeSelect');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  clearCanvas();
}

function resizeCanvas() {
  if (!fxCanvas) return;
  const wrap = fxCanvas.parentElement;
  if (!wrap) return;

  if (_resMode === 'native' && camVideo && camVideo.videoWidth && camVideo.videoHeight) {
    const vw = camVideo.videoWidth;
    const vh = camVideo.videoHeight;
    fxCanvas.width = vw;
    fxCanvas.height = vh;
    fxCanvas.style.width = vw + 'px';
    fxCanvas.style.height = vh + 'px';
  } else {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    fxCanvas.width = w;
    fxCanvas.height = h;
    fxCanvas.style.width = w + 'px';
    fxCanvas.style.height = h + 'px';
  }
  clearCanvas();
}

function clearCanvas() {
  if (!fxCtx || !fxCanvas) return;
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
}

function updateCover() {
  const W = fxCanvas.width, H = fxCanvas.height;
  const vw = camVideo.videoWidth, vh = camVideo.videoHeight;
  _cover.W = W;
  _cover.H = H;
  _cover.vw = vw || 0;
  _cover.vh = vh || 0;
  if (!vw || !vh) return;

  if (_resMode === 'native') {
    _cover.scale = 1;
    _cover.dw = vw;
    _cover.dh = vh;
    _cover.dx = 0;
    _cover.dy = 0;
  } else {
    const scale = Math.min(W / vw, H / vh);
    _cover.scale = scale;
    _cover.dw = vw * scale;
    _cover.dh = vh * scale;
    _cover.dx = (W - _cover.dw) / 2;
    _cover.dy = (H - _cover.dh) / 2;
  }
}

function updateMirrorCanvas() {
  if (!camVideo || !_mirrorCtx) return;
  const vw = camVideo.videoWidth, vh = camVideo.videoHeight;
  if (!vw || !vh) return;
  if (_mirrorW !== vw || _mirrorH !== vh) {
    _mirrorCanvas.width = vw;
    _mirrorCanvas.height = vh;
    _mirrorW = vw;
    _mirrorH = vh;
  }
  _mirrorCtx.save();
  _mirrorCtx.translate(vw, 0);
  _mirrorCtx.scale(-1, 1);
  _mirrorCtx.drawImage(camVideo, 0, 0, vw, vh);
  _mirrorCtx.restore();
}

export function toggleResMode() {
  _resMode = _resMode === 'native' ? 'fit' : 'native';
  resizeCanvas();
  return _resMode;
}

export function composeFrame(allHands) {
  if (!fxCtx || !camVideo) return;

  const W = fxCanvas.width;
  const H = fxCanvas.height;
  if (!W || !H) return;

  const vw = camVideo.videoWidth, vh = camVideo.videoHeight;
  if (!vw || !vh || camVideo.readyState < 2) {
    fxCtx.fillStyle = '#000';
    fxCtx.fillRect(0, 0, W, H);
    return;
  }

  const time = performance.now();

  updateCover();
  updateMirrorCanvas();
  if (_faceReplace && _faceCache.faces) {
    drawFaceEmojisOnMirror(_faceCache.faces);
  }

  // —— 1. 原画层（从 _mirrorCanvas 采样，已镜像 + 已含 emoji）——
  fxCtx.drawImage(_mirrorCanvas, _cover.dx, _cover.dy, _cover.dw, _cover.dh);

  // —— 2. 双手框（必须2只手）——
  if (!allHands || allHands.length < 2) return;

  const shape = _shapeSel ? _shapeSel.value : '2fingers';
  const box = computeBox(allHands, _cover, shape);
  if (!box) return;

  const bbox = boxBBox(box);
  if (!bbox || bbox.w < 4 || bbox.h < 4) return;

  // —— 3a. 框内特效（所有面都应用特效裁剪，包括底面）——
  const currentFilter = getCurrentFilterKey();
  box.faces.forEach((face, idx) => {
    const faceFilterKey = currentFilter === 'mixed' ? getMixedFilterKey(idx) : currentFilter;
    face.color = getFilterColor(faceFilterKey);

    fxCtx.save();
    fxCtx.beginPath();
    fxCtx.moveTo(face.pts[0][0], face.pts[0][1]);
    for (let i = 1; i < face.pts.length; i++) fxCtx.lineTo(face.pts[i][0], face.pts[i][1]);
    fxCtx.closePath();
    fxCtx.clip();
    applyCurrentFilter(fxCtx, _mirrorCanvas, bbox, _cover, time, faceFilterKey);
    fxCtx.restore();
  });

  // —— 3b. 框描边 ——
  drawBox(box);
}

function drawBox(box) {
  if (box.type !== 'polyhedron' || !box.faces) return;

  const sortedFaces = [...box.faces].sort((a, b) => a.z - b.z);
  const minZ = sortedFaces[0]?.z || 0;
  const maxZ = sortedFaces[sortedFaces.length - 1]?.z || 0;
  const zRange = maxZ - minZ || 1;

  fxCtx.save();
  sortedFaces.forEach((face) => {
    const zRatio = (face.z - minZ) / zRange;
    const color = face.color || [255, 255, 255];
    const alpha = 0.15 + zRatio * 0.1;

    fxCtx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
    fxCtx.beginPath();
    fxCtx.moveTo(face.pts[0][0], face.pts[0][1]);
    for (let i = 1; i < face.pts.length; i++) fxCtx.lineTo(face.pts[i][0], face.pts[i][1]);
    fxCtx.closePath();
    fxCtx.fill();
  });
  fxCtx.restore();
}

function drawFaceEmojisOnMirror(faces) {
  if (!_emojiReady || !_emojiImage) return;
  const vw = _mirrorW;
  const vh = _mirrorH;
  if (!vw || !vh || !_mirrorCtx) return;

  if (!faces || faces.length === 0) {
    _lastEmojiSize = 0;
    return;
  }

  faces.forEach((face) => {
    const fx = face.x * vw;
    const fy = face.y * vh;
    const fw = face.width * vw;
    const fh = face.height * vh;

    const rawSize = Math.max(fw, fh) * 1.3;
    let size = rawSize;
    if (_lastEmojiSize > 0) {
      const maxSizeDelta = _lastEmojiSize * EMOJI_SIZE_MAX_DELTA;
      const diff = rawSize - _lastEmojiSize;
      size = _lastEmojiSize + Math.max(-maxSizeDelta, Math.min(maxSizeDelta, diff));
    }
    _lastEmojiSize = size;

    const cx = fx + fw / 2;
    const cy = fy + fh * 0.22;

    _mirrorCtx.drawImage(
      _emojiImage,
      cx - size / 2, cy - size / 2, size, size
    );
  });
}

export function toggleFaceReplace() {
  _faceReplace = !_faceReplace;
  return _faceReplace;
}

export function updateFaceCache(faces) {
  _faceCache.faces = faces;
}

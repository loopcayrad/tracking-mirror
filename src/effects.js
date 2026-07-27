// effects.js — 创意特效实现（框内区域应用）
//
// 每个特效签名：apply(ctx, src, x, y, w, h, time, cover) → void
// - ctx: 目标 Canvas 2D context（已经在原画层上）
// - src: 源图像（camVideo 或 mirrorCanvas）
// - x,y,w,h: 框区域（目标 Canvas 坐标系）
// - time: 当前时间戳 ms
// - cover: video→canvas cover 映射 {dx,dy,dw,dh,scale,vw,vh,W,H}

// ============= 1. CRT 扫描线 =============
export function applyCrt(ctx, src, x, y, w, h, time, cover) {
  const t = time / 1000;
  ctx.save();
  ctx.filter = 'contrast(1.15) saturate(1.2)';
  drawRegion(ctx, src, x, y, w, h, cover);
  ctx.filter = 'none';
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  const lineH = 3;
  for (let py = y; py < y + h; py += lineH * 2) {
    ctx.fillRect(x, py, w, lineH);
  }
  const bandY = y + ((t * 80) % h);
  const grad = ctx.createLinearGradient(0, bandY - 30, 0, bandY + 30);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, bandY - 30, w, 60);

  const vGrad = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.7);
  vGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// ============= 4. ASCII =============
const ASCII_CHARS = ' .,:;irsXA253hMHGS#9B&@';
export function applyAscii(ctx, src, x, y, w, h, time, cover) {
  const tmp = getRegion(src, x, y, w, h, cover);
  if (!tmp) return;
  const cellW = 10;
  const cellH = 12;
  const cols = Math.max(1, Math.floor(tmp.width / cellW));
  const rows = Math.max(1, Math.floor(tmp.height / cellH));

  const small = document.createElement('canvas');
  small.width = cols; small.height = rows;
  const sCtx = small.getContext('2d');
  sCtx.drawImage(tmp.canvas, 0, 0, cols, rows);
  const data = sCtx.getImageData(0, 0, cols, rows).data;

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#34d399';
  ctx.font = `${Math.max(10, Math.floor(cellH * 1.2))}px Consolas, monospace`;
  ctx.textBaseline = 'top';
  const sx = w / cols;
  const sy = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      const ch = ASCII_CHARS[Math.floor(lum * (ASCII_CHARS.length - 1))];
      ctx.fillText(ch, x + c * sx, y + r * sy);
    }
  }
  ctx.restore();
}

// ============= 5. 像素 Pixelate =============
export function applyPixelate(ctx, src, x, y, w, h, time, cover) {
  const t = time / 1000;
  const blockSize = 12 + Math.round(Math.sin(t * 1.5) * 4);
  const cols = Math.max(1, Math.floor(w / blockSize));
  const rows = Math.max(1, Math.floor(h / blockSize));

  const small = document.createElement('canvas');
  small.width = cols; small.height = rows;
  const sCtx = small.getContext('2d');

  const tmp = getRegion(src, x, y, w, h, cover);
  if (!tmp) return;
  sCtx.drawImage(tmp.canvas, 0, 0, cols, rows);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, x, y, w, h);
  ctx.restore();
}

// ============= 6. 波点 Halftone =============
export function applyHalftone(ctx, src, x, y, w, h, time, cover) {
  const tmp = getRegion(src, x, y, w, h, cover);
  if (!tmp) return;
  const cell = 8;
  const cols = Math.max(1, Math.floor(tmp.width / cell));
  const rows = Math.max(1, Math.floor(tmp.height / cell));

  const small = document.createElement('canvas');
  small.width = cols; small.height = rows;
  const sCtx = small.getContext('2d');
  sCtx.drawImage(tmp.canvas, 0, 0, cols, rows);
  const data = sCtx.getImageData(0, 0, cols, rows).data;

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#000';
  const sx = w / cols;
  const sy = h / rows;
  const maxR = Math.min(sx, sy) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      const rad = (1 - lum) * maxR;
      if (rad > 0.2) {
        ctx.beginPath();
        ctx.arc(x + c * sx + sx / 2, y + r * sy + sy / 2, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ============= 工具函数 =============

/**
 * 从源（video 或 mirrorCanvas）裁切 bbox 区域到临时 canvas
 *     _mirrorCanvas 尺寸 = video 原始尺寸，cover 对两者通用
 */
const _regionCache = { canvas: null, ctx: null };
function getRegion(src, x, y, w, h, cover) {
  if (!src || !w || !h || !cover || !cover.scale) return null;
  const sw = src.videoWidth || src.width;
  const sh = src.videoHeight || src.height;
  if (!sw || !sh) return null;

  // canvas 坐标 → 源坐标（cover 反向映射，video 和 mirrorCanvas 通用）
  const sx = (x - cover.dx) / cover.scale;
  const sy = (y - cover.dy) / cover.scale;
  const sW = w / cover.scale;
  const sH = h / cover.scale;
  // 容错：裁切超出源边界时夹紧
  const clampedSx = Math.max(0, Math.min(sw - 1, sx));
  const clampedSy = Math.max(0, Math.min(sh - 1, sy));
  const clampedSW = Math.max(1, Math.min(sw - clampedSx, sW));
  const clampedSH = Math.max(1, Math.min(sh - clampedSy, sH));

  if (!_regionCache.canvas) {
    _regionCache.canvas = document.createElement('canvas');
    _regionCache.ctx = _regionCache.canvas.getContext('2d');
  }
  _regionCache.canvas.width = w;
  _regionCache.canvas.height = h;
  _regionCache.ctx.clearRect(0, 0, w, h);
  _regionCache.ctx.drawImage(src, clampedSx, clampedSy, clampedSW, clampedSH, 0, 0, w, h);
  return { canvas: _regionCache.canvas, ctx: _regionCache.ctx, width: w, height: h };
}

/**
 * 在目标 ctx 的 bbox 区域重绘源
 */
function drawRegion(ctx, src, x, y, w, h, cover) {
  if (!cover || !cover.scale) return;
  const sw = src.videoWidth || src.width;
  const sh = src.videoHeight || src.height;
  if (!sw || !sh) return;
  const sx = (x - cover.dx) / cover.scale;
  const sy = (y - cover.dy) / cover.scale;
  const sW = w / cover.scale;
  const sH = h / cover.scale;
  if (sx < 0 || sy < 0 || sx + sW > sw || sy + sH > sh) return;
  ctx.drawImage(src, sx, sy, sW, sH, x, y, w, h);
}

// 特效注册表
export const EFFECTS = {
  crt:       applyCrt,
  ascii:     applyAscii,
  pixelate:  applyPixelate,
  halftone:  applyHalftone,
};

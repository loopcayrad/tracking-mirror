// filters.js — 滤镜总表（基础 CSS + 创意像素 + 混合模式）
// 与 effects.js 协作：CSS filter 直接用 ctx.filter，像素 effect 调度到 effects.js

import { EFFECTS } from './effects.js';

/**
 * 滤镜定义表
 */
export const FILTERS = {
  // —— 基础（CSS filter）——
  grayscale: { type: 'css',    css: 'grayscale(1) contrast(1.2)',        label: '黑白' },
  invert:    { type: 'css',    css: 'invert(1)',                         label: '反色' },

  // —— 创意（像素 effect）——
  crt:       { type: 'effect', effect: 'crt',       label: 'CRT扫描线' },
  ascii:     { type: 'effect', effect: 'ascii',     label: 'ASCII' },
  pixelate:  { type: 'effect', effect: 'pixelate',  label: '像素' },
  halftone:  { type: 'effect', effect: 'halftone',  label: '波点' },

  // —— 混合（每个面不同特效）——
  mixed:     { type: 'mixed',                        label: '混合' },
};

const MIXED_FILTER_KEYS = ['grayscale', 'invert', 'crt', 'ascii', 'pixelate', 'halftone'];

const FILTER_COLORS = {
  grayscale: [229, 229, 229],
  invert: [168, 85, 247],
  crt: [57, 255, 20],
  ascii: [255, 170, 0],
  pixelate: [0, 255, 255],
  halftone: [255, 255, 255],
};

export function getFilterColor(filterKey) {
  if (filterKey === 'mixed') return [255, 255, 255];
  return FILTER_COLORS[filterKey] || [255, 255, 255];
}

export function getMixedFilterKey(faceIndex) {
  return MIXED_FILTER_KEYS[faceIndex % MIXED_FILTER_KEYS.length];
}

let _filterSel = null;

export function getCurrentFilterKey() {
  if (!_filterSel) _filterSel = document.getElementById('filterSelect');
  return _filterSel ? _filterSel.value : 'grayscale';
}

export function getCurrentFilter() {
  return FILTERS[getCurrentFilterKey()] || FILTERS.grayscale;
}

export function getCurrentFilterLabel() {
  return getCurrentFilter().label;
}

/**
 * 应用当前滤镜到 bbox 区域
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement|HTMLVideoElement} src
 * @param {{x,y,w,h}} bbox
 * @param {*} cover
 * @param {number} time
 * @param {string} [filterKey] 直接指定滤镜 key（来自 composeFrame，避免重复查 DOM）
 */
export function applyCurrentFilter(ctx, src, bbox, cover, time, filterKey) {
  const key = filterKey || getCurrentFilterKey();
  const f = FILTERS[key];
  if (!f) return;
  applyFilter(ctx, src, bbox, cover, time, f);
}

function applyFilter(ctx, src, bbox, cover, time, f) {
  if (f.type === 'css') {
    ctx.save();
    ctx.filter = f.css;
    drawRegion(ctx, src, bbox.x, bbox.y, bbox.w, bbox.h, cover);
    ctx.filter = 'none';
    ctx.restore();
  } else if (f.type === 'effect') {
    const fn = EFFECTS[f.effect];
    if (fn) fn(ctx, src, bbox.x, bbox.y, bbox.w, bbox.h, time, cover);
  }
}

/**
 * video/canvas cover 模式映射：canvas 坐标 → 源坐标反向映射
 */
export function drawRegion(ctx, src, x, y, w, h, cover) {
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


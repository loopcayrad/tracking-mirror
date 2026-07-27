// hands-tracker.js — MediaPipe Hands 加载 + 21 关节识别（ES module）

let _pumpingActive = false;

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';

export async function initHands(onFrame, onStatus, onLocateFile) {
  const Hands = window.Hands;
  if (!Hands) {
    throw new Error('Hands 未加载');
  }

  const hands = new Hands({
    locateFile: (file) => {
      const url = import.meta.env.DEV
        ? new URL(`/node_modules/@mediapipe/hands/${file}`, import.meta.url).href
        : `${CDN_BASE}/${file}`;
      onLocateFile && onLocateFile(file);
      return url;
    },
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.6,
    selfieMode: true,
  });

  hands.onResults((results) => {
    const lms = results.multiHandLandmarks || [];
    const handedness = results.multiHandedness || [];

    if (lms.length === 0) {
      onFrame(null);
      return;
    }

    const allHands = [];
    for (let i = 0; i < lms.length; i++) {
      const handed = handedness[i] && handedness[i].label || 'Unknown';
      allHands.push({ landmarks: lms[i], handed });
    }
    onFrame(allHands);
  });

  onStatus && onStatus('MediaPipe 已就绪', 'ok');
  return hands;
}

/**
 * 持续把 video 帧送进 hands 检测
 */
export async function pumpHands(video, hands) {
  if (_pumpingActive) return;
  _pumpingActive = true;
  _pumpLoop(video, hands);
}

async function _pumpLoop(video, hands) {
  if (!_pumpingActive) return;
  if (video.readyState < 2) {
    requestAnimationFrame(() => _pumpLoop(video, hands));
    return;
  }
  try {
    await hands.send({ image: video });
  } catch (e) {
    console.warn('[HandsTracker] send error:', e);
  }
  if (!_pumpingActive) return;
  requestAnimationFrame(() => _pumpLoop(video, hands));
}

/**
 * 停止 pump 循环（切窗时调用）
 */
export function stopPumpHands() {
  _pumpingActive = false;
}

/**
 * 恢复 pump 循环（切回时调用）
 */
export function resumePumpHands(video, hands) {
  if (!_pumpingActive) {
    pumpHands(video, hands);
  }
}

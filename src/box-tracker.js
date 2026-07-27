// box-tracker.js — 双手指尖组成的封闭3D多面体（ES module）
//
// MediaPipe Hands 指尖索引：
//   拇指(4)、食指(8)、中指(12)、无名指(16)、小指(20)
//   按 fingerCount 取前 count 个：2/3/4/5 指

const DEPTH_SCALE = 8;

/**
 * 计算双手指尖组成的封闭3D多面体
 * @param {Array<{landmarks, handed}>|null} allHands
 * @param {{dx,dy,dw,dh,scale,vw,vh,W,H}} cover  video→canvas cover 映射
 * @param {'2fingers'|'3fingers'|'4fingers'|'5fingers'} fingerCount
 */
export function computeBox(allHands, cover, fingerCount) {
  if (!allHands || allHands.length < 2) return null;
  if (!cover || !cover.dw || !cover.dh) return null;

  const sorted = [...allHands].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
  const leftHand = sorted[0];
  const rightHand = sorted[1];

  const TIP_INDICES = [4, 8, 12, 16, 20];

  let count = 2;
  if (fingerCount === '3fingers') count = 3;
  else if (fingerCount === '4fingers') count = 4;
  else if (fingerCount === '5fingers') count = 5;

  const project = (lm) => {
    const x = cover.dx + lm.x * cover.dw;
    const y = cover.dy + lm.y * cover.dh;
    const z = (lm.z || 0) * DEPTH_SCALE;
    return [x, y, z];
  };

  const leftTips = [];
  const rightTips = [];
  for (let i = 0; i < count; i++) {
    const idx = TIP_INDICES[i];
    const lt = leftHand.landmarks[idx];
    const rt = rightHand.landmarks[idx];
    if (!lt || !rt) return null;
    leftTips.push(project(lt));
    rightTips.push(project(rt));
  }

  const to2D = (p) => [p[0], p[1]];

  const edges = [];
  for (let i = 0; i < count; i++) {
    edges.push([to2D(leftTips[i]), to2D(rightTips[i])]);
  }

  const faces = [];

  for (let i = 0; i < count - 1; i++) {
    const pts = [
      to2D(leftTips[i]),
      to2D(rightTips[i]),
      to2D(rightTips[i + 1]),
      to2D(leftTips[i + 1]),
    ];
    const avgZ = (leftTips[i][2] + rightTips[i][2] + rightTips[i + 1][2] + leftTips[i + 1][2]) / 4;
    faces.push({ pts, z: avgZ, kind: 'side' });
  }

  const leftCapPts = leftTips.map(to2D);
  const leftCapZ = leftTips.reduce((s, p) => s + p[2], 0) / count;
  faces.push({ pts: leftCapPts, z: leftCapZ, kind: 'cap-left' });

  const rightCapPts = rightTips.map(to2D);
  const rightCapZ = rightTips.reduce((s, p) => s + p[2], 0) / count;
  faces.push({ pts: rightCapPts, z: rightCapZ, kind: 'cap-right' });

  const allPts = [...leftTips, ...rightTips];
  const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;

  return { type: 'polyhedron', fingerCount, edges, faces, bbox: { x, y, w, h } };
}

export function boxBBox(box) {
  return box && box.bbox ? box.bbox : null;
}

/** 浏览器端把图片缩到长边 ≤ maxEdge 的 JPEG（给视觉模型用），并给出 dataURL 供预览。 */
export interface DownscaledImage {
  base64: string;
  mime: "image/jpeg";
  dataUrl: string;
  width: number;
  height: number;
}

export async function downscaleImage(file: File, maxEdge = 1568, quality = 0.85): Promise<DownscaledImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mime: "image/jpeg", dataUrl, width: w, height: h };
}

/**
 * Sobel 边缘能量图（用于磁性描摹）：返回 ≤ maxEdge 的灰度边缘强度数组。
 */
export interface EdgeMap {
  width: number;
  height: number;
  /** 0..255 */
  data: Uint8ClampedArray;
}

export async function computeEdgeMap(dataUrl: string, maxEdge = 640): Promise<EdgeMap> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(2, Math.round(img.width * scale));
  const h = Math.max(2, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  const out = new Uint8ClampedArray(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -gray[i - w - 1] + gray[i - w + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + w - 1] + gray[i + w + 1];
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      out[i] = Math.min(255, Math.hypot(gx, gy) / 4);
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * 磁性吸附：在 (x, y)（归一化 0–1000）附近 radius 像素内找边缘最强的列 / 行，分别吸附 x、y。
 */
export function snapToEdge(edge: EdgeMap, x: number, y: number, radiusPx = 6, windowPx = 14): [number, number] {
  const px = (x / 1000) * edge.width;
  const py = (y / 1000) * edge.height;
  const cx = Math.round(px);
  const cy = Math.round(py);
  let bestX = cx;
  let bestXScore = 0;
  for (let dx = -radiusPx; dx <= radiusPx; dx++) {
    const xx = cx + dx;
    if (xx < 0 || xx >= edge.width) continue;
    let s = 0;
    for (let dy = -windowPx; dy <= windowPx; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= edge.height) continue;
      s += edge.data[yy * edge.width + xx];
    }
    if (s > bestXScore * 1.05) {
      bestXScore = s;
      bestX = xx;
    }
  }
  let bestY = cy;
  let bestYScore = 0;
  for (let dy = -radiusPx; dy <= radiusPx; dy++) {
    const yy = cy + dy;
    if (yy < 0 || yy >= edge.height) continue;
    let s = 0;
    for (let dx = -windowPx; dx <= windowPx; dx++) {
      const xx = cx + dx;
      if (xx < 0 || xx >= edge.width) continue;
      s += edge.data[yy * edge.width + xx];
    }
    if (s > bestYScore * 1.05) {
      bestYScore = s;
      bestY = yy;
    }
  }
  // 太弱的边缘不吸
  const threshold = 40 * (windowPx * 2 + 1);
  return [bestXScore > threshold ? (bestX / edge.width) * 1000 : x, bestYScore > threshold ? (bestY / edge.height) * 1000 : y];
}

import * as THREE from "three";

export interface LabelStyle {
  fg: string;
  sub: string;
  bg: string;
  accent?: string | null;
}

const cache = new Map<string, THREE.CanvasTexture>();

/** 把「姓名 + 工号」画到 canvas 纹理（走系统字体，内网无需字体文件）。 */
export function labelTexture(main: string, subText: string, style: LabelStyle): THREE.CanvasTexture {
  const key = [main, subText, style.fg, style.sub, style.bg, style.accent ?? ""].join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 256;
  const H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = style.bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 18);
  ctx.fill();
  if (style.accent) {
    ctx.fillStyle = style.accent;
    ctx.beginPath();
    ctx.roundRect(10, 16, 10, H - 32, 5);
    ctx.fill();
  }
  ctx.fillStyle = style.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${main.length > 4 ? 40 : 48}px -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
  ctx.fillText(main, W / 2 + (style.accent ? 6 : 0), subText ? H / 2 - 16 : H / 2);
  if (subText) {
    ctx.fillStyle = style.sub;
    ctx.font = `500 26px ui-monospace, Menlo, monospace`;
    ctx.fillText(subText, W / 2 + (style.accent ? 6 : 0), H / 2 + 30);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  if (cache.size > 800) {
    const first = cache.keys().next().value;
    if (first) {
      cache.get(first)?.dispose();
      cache.delete(first);
    }
  }
  return tex;
}

export function clearLabelCache() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

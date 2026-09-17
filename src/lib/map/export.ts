/**
 * 把当前 2D 地图导出为 SVG / PNG（零依赖）。
 * 复制 svg → 把 CSS 变量驱动的样式内联成计算值 → 去掉视口变换、按楼层范围设 viewBox → 序列化。
 */
import type { Bounds } from "./geometry";

const INLINE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linejoin",
  "stroke-linecap",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "mix-blend-mode",
  "visibility",
] as const;

function inlineStyles(original: Element, clone: Element) {
  const src = [original, ...Array.from(original.querySelectorAll("*"))];
  const dst = [clone, ...Array.from(clone.querySelectorAll("*"))];
  for (let i = 0; i < src.length && i < dst.length; i++) {
    const cs = getComputedStyle(src[i]);
    const el = dst[i] as HTMLElement | SVGElement;
    el.removeAttribute("class");
    for (const p of INLINE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) el.style.setProperty(p, v);
    }
    // 悬停阴影等滤镜不导出
    el.style.removeProperty("filter");
  }
}

export function serializeMapSvg(svg: SVGSVGElement, bounds: Bounds, padding = 60): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  const root = clone.querySelector("[data-map-root]");
  if (root) root.removeAttribute("transform");
  const x = bounds.x - padding;
  const y = bounds.y - padding;
  const w = bounds.w + padding * 2;
  const h = bounds.h + padding * 2;
  clone.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  // 背景
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const bgColor = getComputedStyle(svg.parentElement ?? svg).backgroundColor || "#ffffff";
  bg.setAttribute("x", String(x));
  bg.setAttribute("y", String(y));
  bg.setAttribute("width", String(w));
  bg.setAttribute("height", String(h));
  bg.setAttribute("fill", bgColor === "rgba(0, 0, 0, 0)" ? "#ffffff" : bgColor);
  clone.insertBefore(bg, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

export function svgToBlob(svgText: string): Blob {
  return new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
}

/** 渲染到 canvas 输出 PNG；targetWidth 为像素宽度。 */
export async function svgToPngBlob(svgText: string, targetWidth = 2400): Promise<Blob> {
  const svgBlob = svgToBlob(svgText);
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG 渲染失败"));
      img.src = url;
    });
    const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = Math.round(targetWidth * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 不可用");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 编码失败"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

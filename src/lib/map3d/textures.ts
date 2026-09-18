/**
 * 程序化地面贴图（canvas 生成，按 (kind, theme) 缓存）。ShapeGeometry 的 UV 就是世界坐标（米），
 * 所以每张贴图代表 2m × 2m，repeat 固定为 0.5，各房间的纹理自然对齐。
 */
import * as THREE from "three";
import type { FloorStyle, RoomType } from "@/lib/map/types";

export type TextureKind = "carpet" | "wood" | "tile" | "concrete" | "plain";

const SIZE = 512;
/** 一张贴图覆盖的世界尺寸（米） */
export const TEXTURE_WORLD_SIZE = 2;

const cache = new Map<string, THREE.CanvasTexture>();

function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export function floorTextureKind(room: { type: RoomType; floorStyle: FloorStyle | null }): TextureKind {
  if (room.floorStyle) return room.floorStyle === "plain" ? "plain" : room.floorStyle;
  switch (room.type) {
    case "office":
    case "other":
      return "carpet";
    case "meeting":
    case "reception":
      return "wood";
    case "pantry":
    case "restroom":
      return "tile";
    case "storage":
    case "elevator":
    case "stairs":
      return "concrete";
    case "corridor":
      return "plain";
  }
}

interface Colors {
  base: string;
  dark: string;
  light: string;
  line: string;
}

function colorsFor(kind: TextureKind, isDark: boolean): Colors {
  if (isDark) {
    switch (kind) {
      case "carpet":
        return { base: "#26262d", dark: "#212127", light: "#2b2b33", line: "#1f1f25" };
      case "wood":
        return { base: "#3a2f26", dark: "#2f261f", light: "#45382d", line: "#241c16" };
      case "tile":
        return { base: "#2b2f33", dark: "#262a2e", light: "#31363b", line: "#1c1f22" };
      case "concrete":
        return { base: "#2a2a2c", dark: "#262628", light: "#2f2f31", line: "#222224" };
      default:
        return { base: "#202024", dark: "#202024", light: "#202024", line: "#202024" };
    }
  }
  switch (kind) {
    case "carpet":
      return { base: "#dfe2e8", dark: "#d6dae1", light: "#e6e9ee", line: "#cfd3da" };
    case "wood":
      return { base: "#d9c2a3", dark: "#c8ae8d", light: "#e4d0b6", line: "#b59a7b" };
    case "tile":
      return { base: "#eceff1", dark: "#e3e7ea", light: "#f4f6f7", line: "#cfd5d9" };
    case "concrete":
      return { base: "#dcdcde", dark: "#d4d4d6", light: "#e4e4e6", line: "#c9c9cc" };
    default:
      return { base: "#f4f4f6", dark: "#f4f4f6", light: "#f4f4f6", line: "#f4f4f6" };
  }
}

function paint(kind: TextureKind, isDark: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext("2d")!;
  const col = colorsFor(kind, isDark);
  const rnd = prng(kind.length * 7919 + (isDark ? 17 : 3));
  g.fillStyle = col.base;
  g.fillRect(0, 0, SIZE, SIZE);
  const px = SIZE / (TEXTURE_WORLD_SIZE * 100); // 每 cm 像素
  switch (kind) {
    case "carpet": {
      // 3% 噪点 + 50cm 拼缝
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = rnd() < 0.5 ? col.dark : col.light;
        g.globalAlpha = 0.35;
        g.fillRect(rnd() * SIZE, rnd() * SIZE, 2, 2);
      }
      g.globalAlpha = 1;
      g.strokeStyle = col.line;
      g.lineWidth = 1;
      const tile = 50 * px;
      for (let v = 0; v <= SIZE; v += tile) {
        g.beginPath();
        g.moveTo(v, 0);
        g.lineTo(v, SIZE);
        g.moveTo(0, v);
        g.lineTo(SIZE, v);
        g.stroke();
      }
      break;
    }
    case "wood": {
      // 12cm 板条，长 120cm 错缝，±6% 色差 + 细纹理
      const plankW = 12 * px;
      const plankL = 120 * px;
      for (let row = 0; row * plankW < SIZE; row++) {
        const offset = (row % 3) * (plankL / 3);
        for (let x = -plankL + offset; x < SIZE; x += plankL) {
          const shade = 0.94 + rnd() * 0.12;
          g.fillStyle = shadeColor(col.base, shade);
          g.fillRect(x, row * plankW, plankL, plankW);
          g.strokeStyle = col.line;
          g.lineWidth = 1;
          g.strokeRect(x + 0.5, row * plankW + 0.5, plankL - 1, plankW - 1);
          // 木纹
          g.globalAlpha = 0.18;
          for (let s = 0; s < 4; s++) {
            g.beginPath();
            const y0 = row * plankW + rnd() * plankW;
            g.moveTo(x, y0);
            g.bezierCurveTo(x + plankL * 0.3, y0 + (rnd() - 0.5) * 6, x + plankL * 0.6, y0 + (rnd() - 0.5) * 6, x + plankL, y0 + (rnd() - 0.5) * 4);
            g.strokeStyle = col.dark;
            g.stroke();
          }
          g.globalAlpha = 1;
        }
      }
      break;
    }
    case "tile": {
      const tile = 30 * px;
      const gap = 2;
      g.fillStyle = col.line;
      g.fillRect(0, 0, SIZE, SIZE);
      for (let y = 0; y < SIZE; y += tile)
        for (let x = 0; x < SIZE; x += tile) {
          g.fillStyle = shadeColor(col.base, 0.97 + rnd() * 0.06);
          g.fillRect(x + gap / 2, y + gap / 2, tile - gap, tile - gap);
        }
      break;
    }
    case "concrete": {
      for (let i = 0; i < 14000; i++) {
        g.fillStyle = rnd() < 0.5 ? col.dark : col.light;
        g.globalAlpha = 0.25;
        g.fillRect(rnd() * SIZE, rnd() * SIZE, 1.5, 1.5);
      }
      g.globalAlpha = 1;
      break;
    }
    default:
      break;
  }
  return c;
}

function shadeColor(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function getFloorTexture(kind: TextureKind, isDark: boolean): THREE.CanvasTexture {
  const key = `${kind}:${isDark ? "d" : "l"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(paint(kind, isDark));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / TEXTURE_WORLD_SIZE, 1 / TEXTURE_WORLD_SIZE);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

export function disposeRoomTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

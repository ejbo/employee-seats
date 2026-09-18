"use client";

/**
 * 工位：桌 + 椅 + 显示器 + 键盘（+ 随机绿植）全部走 ProceduralInstances；
 * 命中用一层不可见的脚印实例；名牌是贴在桌面上的 canvas 纹理平面。
 */
import { useEffect, useMemo } from "react";
import { Instance, Instances, MeshDiscardMaterial } from "@react-three/drei";
import type { DepartmentSummary, EmployeeSummary, SeatEl } from "@/lib/map/types";
import { seatState } from "@/lib/map/types";
import { CHAIR, deskSpec, KEYBOARD, MONITOR, PLANT_SMALL } from "@/lib/map/object-specs";
import { shortName } from "@/lib/map/geometry";
import { labelTexture } from "@/lib/map3d/label-texture";
import type { Palette3D } from "@/lib/map3d/palette";
import { mixColor, ProceduralInstances, type InstanceItem } from "./procedural-object";

const M = 0.01;
const DESK_H = 0.74;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 座位局部坐标（cm，桌面中心为原点，+z 朝椅子）→ 世界 (m) */
function local(seat: SeatEl, dx: number, dz: number): [number, number, number] {
  const cx = seat.x + seat.w / 2;
  const cz = seat.y + seat.h / 2;
  const a = (seat.rotation * Math.PI) / 180;
  const wx = cx + dx * Math.cos(a) - dz * Math.sin(a);
  const wz = cz + dx * Math.sin(a) + dz * Math.cos(a);
  return [wx * M, 0, wz * M];
}

export interface WorkstationsProps {
  seats: SeatEl[];
  employees: Record<string, EmployeeSummary>;
  departments: Record<string, DepartmentSummary>;
  p: Palette3D;
  hoveredSeatId: string | null;
  selectedSeatId: string | null;
  highlightDeptId: string | null;
  onOver: (id: string) => void;
  onOut: () => void;
  onClick: (id: string) => void;
}

export function Workstations({ seats, employees, departments, p, hoveredSeatId, selectedSeatId, highlightDeptId, onOver, onOut, onClick }: WorkstationsProps) {
  const items = useMemo(() => {
    const out: InstanceItem[] = [];
    for (const seat of seats) {
      const state = seatState(seat);
      const emp = seat.employeeId ? employees[seat.employeeId] : null;
      const dept = emp?.departmentId ? departments[emp.departmentId] : null;
      const occupied = state === "occupied";
      const dim = highlightDeptId && (!emp || emp.departmentId !== highlightDeptId) ? 0.7 : 0;
      const hot = hoveredSeatId === seat.id || selectedSeatId === seat.id;
      const rotY = (-seat.rotation * Math.PI) / 180;
      const lift = hoveredSeatId === seat.id ? 0.03 : 0;
      const ctx = {
        accent: occupied ? (dept?.color ?? p.chair) : null,
        lit: occupied,
        deskOverride: hot ? mixColor(p.desk, p.info, 0.45) : state === "reserved" ? p.reservedDesk : null,
        dim,
      };
      const transparent = state === "disabled";
      const at = (dx: number, dz: number): [number, number, number] => {
        const v = local(seat, dx, dz);
        return [v[0], lift, v[2]];
      };
      out.push({ key: `${seat.id}:desk`, spec: deskSpec(seat.style, seat.w, seat.h), position: at(0, 0), rotationY: rotY, ctx, transparent });
      out.push({ key: `${seat.id}:chair`, spec: CHAIR, position: at(0, seat.h / 2 + 28), rotationY: rotY + Math.PI, ctx, transparent });
      if (state !== "disabled") {
        out.push({ key: `${seat.id}:monitor`, spec: MONITOR, position: at(0, -seat.h / 2 + 12), rotationY: rotY, ctx, transparent });
        out.push({ key: `${seat.id}:kb`, spec: KEYBOARD, position: at(-4, seat.h * 0.12), rotationY: rotY, ctx, transparent });
        if (hash(seat.id) % 4 === 0) out.push({ key: `${seat.id}:plant`, spec: PLANT_SMALL, position: at(-seat.w / 2 + 14, -seat.h / 2 + 14), rotationY: rotY, ctx, transparent });
      }
    }
    return out;
  }, [departments, employees, highlightDeptId, hoveredSeatId, p, seats, selectedSeatId]);

  return (
    <group>
      <ProceduralInstances items={items} p={p} />
      {/* 命中盒：桌 + 椅的脚印，1.1m 高 */}
      <Instances limit={Math.max(seats.length, 1)} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <MeshDiscardMaterial />
        {seats.map((seat) => {
          const [x, , z] = local(seat, 0, 25);
          return (
            <Instance
              key={seat.id}
              position={[x, 0.55, z]}
              rotation={[0, (-seat.rotation * Math.PI) / 180, 0]}
              scale={[seat.w * M, 1.1, (seat.h + 50) * M]}
              onPointerOver={(e) => {
                e.stopPropagation();
                onOver(seat.id);
              }}
              onPointerOut={() => onOut()}
              onClick={(e) => {
                e.stopPropagation();
                onClick(seat.id);
              }}
            />
          );
        })}
      </Instances>
      {seats.map((seat) => (
        <NamePlate key={seat.id} seat={seat} employee={seat.employeeId ? (employees[seat.employeeId] ?? null) : null} department={seat.employeeId && employees[seat.employeeId]?.departmentId ? (departments[employees[seat.employeeId]!.departmentId!] ?? null) : null} p={p} dimmed={Boolean(highlightDeptId && (!seat.employeeId || employees[seat.employeeId]?.departmentId !== highlightDeptId))} lifted={hoveredSeatId === seat.id} />
      ))}
      {selectedSeatId &&
        (() => {
          const seat = seats.find((s) => s.id === selectedSeatId);
          if (!seat) return null;
          const [x, , z] = local(seat, 0, 10);
          const r = Math.max(seat.w, seat.h) * M * 0.62;
          return (
            <mesh position={[x, 0.015, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[r, r + 0.08, 48]} />
              <meshBasicMaterial color={p.info} transparent opacity={0.9} toneMapped={false} />
            </mesh>
          );
        })()}
    </group>
  );
}

function NamePlate({ seat, employee, department, p, dimmed, lifted }: { seat: SeatEl; employee: EmployeeSummary | null; department: DepartmentSummary | null; p: Palette3D; dimmed: boolean; lifted: boolean }) {
  const state = seatState(seat);
  const occupied = state === "occupied" && employee;
  const label = useMemo(
    () =>
      labelTexture(occupied ? shortName(employee.name) : seat.code, occupied ? `${seat.code} · ${employee.employeeNo}` : state === "free" ? "" : state === "reserved" ? "预留" : "停用", {
        fg: p.text,
        sub: p.sub,
        bg: p.surface,
        accent: occupied ? (department?.color ?? null) : null,
      }),
    [department?.color, employee, occupied, p.sub, p.surface, p.text, seat.code, state],
  );
  useEffect(() => () => label.dispose(), [label]);
  const [x, , z] = local(seat, 0, seat.h * 0.12);
  const w = Math.min(seat.w * M * 0.85, 1.1);
  return (
    <mesh position={[x, DESK_H + 0.006 + (lifted ? 0.03 : 0), z]} rotation={[-Math.PI / 2, 0, (-seat.rotation * Math.PI) / 180]}>
      <planeGeometry args={[w, w / 2]} />
      <meshBasicMaterial map={label} transparent opacity={dimmed ? 0.3 : 1} depthWrite={false} polygonOffset polygonOffsetFactor={-2} toneMapped={false} />
    </mesh>
  );
}

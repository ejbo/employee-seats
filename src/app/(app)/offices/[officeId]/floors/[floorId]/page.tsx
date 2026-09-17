import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser, loadOfficeCapabilities } from "@/lib/auth/guards";
import { loadFloorPageData } from "@/lib/floors/scene";
import { FloorWorkspace } from "@/components/floor/floor-workspace";

type Params = Promise<{ officeId: string; floorId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { floorId } = await params;
  const data = await loadFloorPageData(floorId);
  return { title: data ? `${data.office.name} ${data.scene.floor.name}` : "楼层" };
}

export default async function FloorPage({ params }: { params: Params }) {
  const { officeId, floorId } = await params;
  const actor = await requireUser(`/offices/${officeId}/floors/${floorId}`);
  const data = await loadFloorPageData(floorId);
  if (!data || data.office.id !== officeId) notFound();
  const viewer = await loadOfficeCapabilities(actor, officeId);
  return <FloorWorkspace initial={{ ...data, viewer }} />;
}

import type { Metadata } from "next";
import { CostsView, generateCostsMetadata } from "../_shared/costs-view";

export async function generateMetadata(): Promise<Metadata> {
  return generateCostsMetadata("new-zealand");
}

export default async function CostsPage() {
  return <CostsView country="new-zealand" />;
}

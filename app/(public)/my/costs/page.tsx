import type { Metadata } from "next";
import { CostsView, generateCostsMetadata } from "../../_shared/costs-view";

// The same costs page as New Zealand's, in ringgit, from Malaysia stories only.

export async function generateMetadata(): Promise<Metadata> {
  return generateCostsMetadata("malaysia");
}

export default async function MalaysiaCostsPage() {
  return <CostsView country="malaysia" />;
}

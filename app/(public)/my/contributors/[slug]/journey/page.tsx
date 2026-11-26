import type { Metadata } from "next";
import {
  ContributorJourney,
  generateContributorJourneyMetadata,
} from "../../../../_shared/contributor-journey";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return generateContributorJourneyMetadata("malaysia", slug);
}

export default async function MalaysiaContributorJourneyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ContributorJourney country="malaysia" slug={slug} />;
}

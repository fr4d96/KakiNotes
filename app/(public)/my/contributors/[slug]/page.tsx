import type { Metadata } from "next";
import {
  ContributorProfile,
  generateContributorProfileMetadata,
} from "../../../_shared/contributor-profile";

// A contributor's Malaysia profile: only their Malaysia stories, facts and
// journey pins, 404 when they have none (Rule 10/12).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return generateContributorProfileMetadata("malaysia", slug);
}

export default async function MalaysiaContributorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ContributorProfile country="malaysia" slug={slug} />;
}

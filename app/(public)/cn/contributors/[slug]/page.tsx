import type { Metadata } from "next";
import {
  ContributorProfile,
  generateContributorProfileMetadata,
} from "../../../_shared/contributor-profile";

// A contributor's China profile: only their China stories and facts, 404
// when they have none (Rule 10/12). Uncached, like the NZ profile.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return generateContributorProfileMetadata("china", slug);
}

export default async function ChinaContributorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ContributorProfile country="china" slug={slug} />;
}

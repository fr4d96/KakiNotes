import type { Metadata } from "next";
import {
  ContributorProfile,
  generateContributorProfileMetadata,
} from "../../_shared/contributor-profile";

// Uncached on purpose: a contributor who makes their profile private, or a
// story taken down from under their byline, must stop being listed NOW
// (Engineering Rule 12). See ../../_shared/contributor-profile.tsx.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return generateContributorProfileMetadata("new-zealand", slug);
}

export default async function ContributorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ContributorProfile country="new-zealand" slug={slug} />;
}

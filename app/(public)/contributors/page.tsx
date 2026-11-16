import type { Metadata } from "next";
import {
  ContributorsIndex,
  generateContributorsIndexMetadata,
  type SearchParams,
} from "../_shared/contributors-index";

// No `export const revalidate` here on purpose. This route awaits
// `searchParams` (the keyset pagination cursor), which forces dynamic
// rendering -- a revalidate export would be a silent no-op.

export async function generateMetadata(): Promise<Metadata> {
  return generateContributorsIndexMetadata("new-zealand");
}

export default async function ContributorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <ContributorsIndex country="new-zealand" searchParams={searchParams} />
  );
}

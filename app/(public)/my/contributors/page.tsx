import type { Metadata } from "next";
import {
  ContributorsIndex,
  generateContributorsIndexMetadata,
  type SearchParams,
} from "../../_shared/contributors-index";

// Malaysia's own contributor directory: only people with a published
// Malaysia story (Rule 10/12).

export async function generateMetadata(): Promise<Metadata> {
  return generateContributorsIndexMetadata("malaysia");
}

export default async function MalaysiaContributorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <ContributorsIndex country="malaysia" searchParams={searchParams} />;
}

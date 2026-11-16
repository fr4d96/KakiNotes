import type { Metadata } from "next";
import {
  ContributorsIndex,
  generateContributorsIndexMetadata,
  type SearchParams,
} from "../../_shared/contributors-index";

// China's own contributor directory: only people with a published China
// story (Rule 10/12). Same "no revalidate export" reasoning as
// /contributors/page.tsx.

export async function generateMetadata(): Promise<Metadata> {
  return generateContributorsIndexMetadata("china");
}

export default async function ChinaContributorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <ContributorsIndex country="china" searchParams={searchParams} />;
}

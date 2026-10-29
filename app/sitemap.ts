import type { MetadataRoute } from "next";
import {
  listPublishedStories,
  listPublicContributors,
} from "@/lib/story/public-queries";
import {
  COUNTRY_SLUGS,
  countryUrlPrefix,
  type CountrySlug,
} from "@/lib/story/countries";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const revalidate = 3600;

// Bounded loops, not a single unbounded call: 50 pages * 50 rows (the RPCs'
// own server-side clamp) is a generous ceiling for the founding catalogue
// and prevents this route from ever becoming an accidental full-table scan
// if the catalogue grows large.
const MAX_PAGES = 50;
const PAGE_SIZE = 50;

async function allPublishedStorySlugs(
  country: CountrySlug,
): Promise<{ slug: string; publishedAt: string }[]> {
  const slugs: { slug: string; publishedAt: string }[] = [];
  let cursorPublishedAt: string | undefined;
  let cursorId: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await listPublishedStories({
      cursorPublishedAt,
      cursorId,
      limit: PAGE_SIZE,
      countrySlug: country,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      slugs.push({ slug: row.slug, publishedAt: row.published_at });
    }
    if (rows.length < PAGE_SIZE) break;
    const last = rows[rows.length - 1];
    cursorPublishedAt = last.published_at;
    cursorId = last.story_id;
  }
  return slugs;
}

async function allPublicContributorSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  let cursorDisplayName: string | undefined;
  let cursorId: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await listPublicContributors({
      cursorDisplayName,
      cursorId,
      limit: PAGE_SIZE,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      if (row.public_slug) slugs.push(row.public_slug);
    }
    if (rows.length < PAGE_SIZE) break;
    const last = rows[rows.length - 1];
    cursorDisplayName = last.display_name;
    cursorId = last.contributor_id;
  }
  return slugs;
}

// Routes that exist under every country prefix ("" for NZ, "/cn" for China).
const countryRoutes = ["", "/stories", "/contributors", "/about", "/costs"];

// Site-wide routes with no country variant.
const staticRoutes = [
  "/privacy",
  "/terms",
  "/community-guidelines",
  "/copyright",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [storiesByCountry, contributorSlugs] = await Promise.all([
    Promise.all(
      COUNTRY_SLUGS.map(async (country) => ({
        prefix: countryUrlPrefix(country),
        stories: await allPublishedStorySlugs(country),
      })),
    ),
    allPublicContributorSlugs(),
  ]);

  return [
    ...COUNTRY_SLUGS.flatMap((country) =>
      countryRoutes.map((path) => ({
        url: `${siteUrl}${countryUrlPrefix(country)}${path}`,
      })),
    ),
    ...staticRoutes.map((path) => ({
      url: `${siteUrl}${path}`,
    })),
    ...storiesByCountry.flatMap(({ prefix, stories }) =>
      stories.map((s) => ({
        url: `${siteUrl}${prefix}/stories/${s.slug}`,
        lastModified: s.publishedAt,
      })),
    ),
    ...contributorSlugs.map((slug) => ({
      url: `${siteUrl}/contributors/${slug}`,
    })),
  ];
}

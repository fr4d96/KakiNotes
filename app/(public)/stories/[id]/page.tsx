import type { Metadata } from "next";
import {
  StoryDetail,
  generateStoryDetailMetadata,
} from "../../_shared/story-detail";

// The dynamic segment is named `id` (not `slug`) to match the sibling
// (contributor)/stories/[id]/ route group -- Next.js requires the same
// parameter name for every route sharing this URL position across route
// groups. The value itself is still the story's slug, not a UUID.
//
// Rendering logic lives in ../../_shared/story-detail.tsx, shared with
// /cn/stories/[id] -- see that file's header comment for why (Rule 10/12:
// country must be enforced at every data read, not just by which route
// happens to link here).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: slug } = await params;
  return generateStoryDetailMetadata("new-zealand", slug);
}

export default async function StoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  return <StoryDetail country="new-zealand" slug={slug} />;
}

import type { Metadata } from "next";
import {
  StoryDetail,
  generateStoryDetailMetadata,
} from "../../../_shared/story-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: slug } = await params;
  return generateStoryDetailMetadata("china", slug);
}

export default async function ChinaStoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  return <StoryDetail country="china" slug={slug} />;
}

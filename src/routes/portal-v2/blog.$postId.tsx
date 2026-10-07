import { createFileRoute } from "@tanstack/react-router";
import { BlogArtigoV2 } from "@/features/client-portal-v2/pages/BlogV2";

export const Route = createFileRoute("/portal-v2/blog/$postId")({
  component: BlogArtigoPage,
});

function BlogArtigoPage() {
  const { postId } = Route.useParams();
  return <BlogArtigoV2 postId={postId} />;
}

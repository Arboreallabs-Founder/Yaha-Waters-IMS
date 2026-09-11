import { DetailPageSkeleton } from "@/components/ui/page-skeletons";

export default function Loading() {
  // Up to six cards render here, so one more panel than the shared default.
  return <DetailPageSkeleton panels={4} />;
}

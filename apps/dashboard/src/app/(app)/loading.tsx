import { PageSkeleton } from "@/components/skeleton";

/** While a page's server part renders (#172): the shape of a page, not a blank screen. */
export default function Loading() {
  return <PageSkeleton />;
}

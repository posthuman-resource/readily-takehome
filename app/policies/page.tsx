import {
  getPoliciesWithRequirementCounts,
  getCategoryCounts,
} from "@/lib/db/queries";
import { PolicyList } from "./policy-list";

export const dynamic = "force-dynamic";

export default async function PoliciesPage(
  props: PageProps<"/policies">
) {
  const searchParams = await props.searchParams;

  const categoryFilter =
    typeof searchParams.category === "string" ? searchParams.category : undefined;
  const searchQuery =
    typeof searchParams.q === "string" ? searchParams.q : undefined;

  let policies = getPoliciesWithRequirementCounts(categoryFilter);

  // Apply filename search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    policies = policies.filter((p) =>
      p.filename.toLowerCase().includes(q)
    );
  }

  const categoryCounts = getCategoryCounts();
  const totalPolicies = categoryCounts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="h-full flex flex-col">
      <header className="border-b px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold">Policy Explorer</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Browse organizational policies by category and see which requirements they satisfy
        </p>
      </header>

      <PolicyList
        policies={policies}
        categoryCounts={categoryCounts}
        totalPolicies={totalPolicies}
        currentCategory={categoryFilter}
        currentSearch={searchQuery}
      />
    </div>
  );
}

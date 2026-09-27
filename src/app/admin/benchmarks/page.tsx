import { auth } from "@/lib/auth";
import { requireActiveAdmin } from "@/lib/admin-auth";
import { MatchingService } from "@/services/matching.service";
import CategoryBenchmarksClient from "./CategoryBenchmarksClient";
import Link from "next/link";
import { ArrowLeft, Target } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Category CPV Benchmarks | VyaparMedia Admin",
  description: "Tune market Cost-Per-View (CPV) benchmarks for relative ROI matching across creator categories",
};

export default async function AdminBenchmarksPage() {
  const session = await auth();
  await requireActiveAdmin(session?.user);

  const benchmarks = await MatchingService.getAllCategoryBenchmarks();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Breadcrumb */}
      <div>
        <Link
          href="/admin"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Admin Operations
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                Category CPV Benchmarks &amp; Relative ROI
              </h1>
              <p className="text-xs text-muted-foreground">
                Manage industry cost baselines. High-ticket niches (Finance, Tech) convert at higher CPVs than viral entertainment.
              </p>
            </div>
          </div>
        </div>
      </div>

      <CategoryBenchmarksClient initialBenchmarks={benchmarks} />
    </div>
  );
}

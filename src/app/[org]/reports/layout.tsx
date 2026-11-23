import { ReportsNav } from "@/features/reports/reports-nav";

/** Every /{slug}/reports page shows lejar.ai's report tabs on top. */
export default async function ReportsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  return (
    <>
      <ReportsNav slug={org} />
      {children}
    </>
  );
}

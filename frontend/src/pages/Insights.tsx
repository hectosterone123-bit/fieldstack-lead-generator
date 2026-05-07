import { InsightsCockpit } from '../components/dashboard/InsightsCockpit';

export function Insights() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Strategy Insights</h1>
        <p className="text-sm text-zinc-500 mt-0.5">AI-powered analysis of your pipeline health and outreach performance</p>
      </div>
      <InsightsCockpit />
    </div>
  );
}

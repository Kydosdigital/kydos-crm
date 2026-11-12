import { processDueRuns } from "@/lib/automation";
import { syncAllInboxes } from "@/lib/outlook";
import { agentSweep } from "@/lib/agent";
import { weeklyReportIfDue } from "@/lib/report";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const processed = await processDueRuns();
  const synced = await syncAllInboxes();
  const reports = await weeklyReportIfDue();
  const agent = await agentSweep(); // no-op until ANTHROPIC_API_KEY is set and a workspace agent_mode is on
  return Response.json({ processed, synced, reports, agent });
}

import { processDueRuns } from "@/lib/automation";
import { syncAllInboxes } from "@/lib/outlook";
import { agentSweep } from "@/lib/agent";
import { weeklyReportIfDue } from "@/lib/report";
import { processScheduledSends, processDateTriggers } from "@/lib/scheduled";
import { nightlyBackupIfDue } from "@/lib/backup";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const processed = await processDueRuns();
  const scheduled = await processScheduledSends();
  const dates = await processDateTriggers();
  const backup = await nightlyBackupIfDue();
  const synced = await syncAllInboxes();
  const reports = await weeklyReportIfDue();
  const agent = await agentSweep(); // no-op until ANTHROPIC_API_KEY is set and a workspace agent_mode is on
  return Response.json({ processed, scheduled, dates, backup, synced, reports, agent });
}

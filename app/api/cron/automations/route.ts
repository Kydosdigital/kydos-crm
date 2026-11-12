import { processDueRuns } from "@/lib/automation";
import { syncAllInboxes } from "@/lib/outlook";


export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const processed = await processDueRuns();
  const synced = await syncAllInboxes();
  return Response.json({ processed, synced });
}

import { processDueRuns } from "@/lib/automation";


export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const processed = await processDueRuns();
  return Response.json({ processed });
}

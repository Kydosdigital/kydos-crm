import { requireAdmin } from "@/lib/workspace";
import { exportWorkspace } from "@/lib/backup";

// Signed-in download of the whole workspace as JSON: /api/backup
export async function GET() {
  const { ws } = await requireAdmin();
  const body = JSON.stringify(await exportWorkspace(ws.id), null, 1);
  return new Response(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${ws.slug}-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
}

-- KD-026 / PR #40: database-side guard for self-service workspace creation.
-- SECURITY REVIEW: authenticated users could previously call this SECURITY DEFINER RPC
-- directly and mint an owner membership without any existing CRM authorisation.
-- Apply to STAGING only after independent QA and migration review. Never apply to production
-- without explicit product-owner approval and authenticated two-workspace UAT.
-- Existing owners/admins may create a new workspace; new/unassigned and client accounts may not.
-- Preserve the historical create_workspace(text,text) signature and its existing initial pipeline.
CREATE OR REPLACE FUNCTION public.create_workspace(p_name text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  ws uuid;
  pl uuid;
  actor uuid;
BEGIN
  actor := auth.uid();
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.workspace_members AS wm
    WHERE wm.user_id = actor AND wm.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Workspace creation not permitted'
      USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) < 1 OR length(p_name) > 120
     OR p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR length(p_slug) > 120 THEN
    RAISE EXCEPTION 'Invalid workspace details'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workspaces (name, slug)
    VALUES (btrim(p_name), p_slug) RETURNING id INTO ws;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (ws, actor, 'owner');
  INSERT INTO public.pipelines (workspace_id, name)
    VALUES (ws, 'Sales') RETURNING id INTO pl;
  INSERT INTO public.stages (workspace_id, pipeline_id, name, position)
    VALUES (ws, pl, 'New lead', 0), (ws, pl, 'Contacted', 1),
           (ws, pl, 'Proposal', 2), (ws, pl, 'Won', 3), (ws, pl, 'Lost', 4);
  RETURN ws;
END
$function$;
-- Do not grant this RPC to anon or PUBLIC; authenticated is subject to the
-- function-level existing-admin check above. service_role remains privileged.
REVOKE ALL ON FUNCTION public.create_workspace(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text) TO authenticated, service_role;

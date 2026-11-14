-- Kydos CRM synthetic staging fixtures ONLY.
-- Execute against Supabase staging project psnpdmwkevnxrdrjyiwk.
-- Never run this SQL on production. No authentication users or outgoing credentials are created.
-- Safe to re-run. Data is clearly labelled, synthetic and uses reserved example.test domains.

begin;

-- Executable fail-closed environment guard.
-- This fixture was initialised explicitly on the staging project on 14 Nov 2026.
-- The exact synthetic workspace UUIDs below are a project-specific sentinel,
-- not a generic database/project label. A fresh environment MUST be validated
-- and deliberately re-initialised by the technical lead before using this seed.
-- No privileged app credentials or customer identifiers are present.
do $staging_guard$
begin
  if (
    select count(*)
    from public.workspaces
    where (id, slug, name) in (
      ('df55bd02-9862-4d69-aa75-fc5ac67389cb'::uuid, 'kydos-qa-alpha-20261114', 'QA SYNTHETIC Alpha'),
      ('cdf44e6c-0ba4-40e8-b900-53fc1c1d455b'::uuid, 'kydos-qa-beta-20261114', 'QA SYNTHETIC Beta')
    )
      and agent_mode = 'off'
      and daily_digest = false
      and email_from is null
      and sms_from is null
      and whatsapp_from is null
  ) <> 2 then
    raise exception 'STAGING-ONLY SEED REFUSED: expected QA workspace UUID and safety settings not found. Do not use on production.';
  end if;
end;
$staging_guard$;

insert into public.workspaces (name, slug, agent_mode, daily_digest)
values
  ('QA SYNTHETIC Alpha', 'kydos-qa-alpha-20261114', 'off', false),
  ('QA SYNTHETIC Beta',  'kydos-qa-beta-20261114', 'off', false)
on conflict (slug) do nothing;

insert into public.pipelines (workspace_id, name)
select w.id, 'QA Pipeline'
from public.workspaces w
where w.slug in ('kydos-qa-alpha-20261114', 'kydos-qa-beta-20261114')
  and not exists (
    select 1 from public.pipelines p where p.workspace_id = w.id and p.name = 'QA Pipeline'
  );

insert into public.stages (workspace_id, pipeline_id, name, position)
select w.id, p.id, stage.name, stage.position
from public.workspaces w
join public.pipelines p on p.workspace_id = w.id and p.name = 'QA Pipeline'
cross join (values ('New', 0), ('Contacted', 1), ('Won', 2)) as stage(name, position)
where w.slug in ('kydos-qa-alpha-20261114', 'kydos-qa-beta-20261114')
  and not exists (
    select 1 from public.stages s where s.workspace_id = w.id
      and s.pipeline_id = p.id and s.name = stage.name
  );

with fixture(slug, first_name, last_name, email, opted_out, source) as (
  values
    ('kydos-qa-alpha-20261114', 'Alpha', 'ContactOne', 'qa-alpha-one@example.test', false, 'qa-synthetic-alpha'),
    ('kydos-qa-alpha-20261114', 'Alpha', 'OptedOut', 'qa-alpha-optout@example.test', true, 'qa-synthetic-alpha'),
    ('kydos-qa-beta-20261114', 'Beta', 'ContactOne', 'qa-beta-one@example.test', false, 'qa-synthetic-beta'),
    ('kydos-qa-beta-20261114', 'Beta', 'OptedOut', 'qa-beta-optout@example.test', true, 'qa-synthetic-beta')
)
insert into public.contacts (workspace_id, first_name, last_name, email, source, email_opt_out, sms_opt_out, tags, utm_source)
select w.id, f.first_name, f.last_name, f.email, f.source, f.opted_out, f.opted_out,
  array['qa-synthetic'], 'qa-fixture'
from fixture f
join public.workspaces w on w.slug = f.slug
where not exists (
  select 1 from public.contacts c where c.workspace_id = w.id and c.email = f.email
);

-- Assertions run inside the same transaction: failure rolls back all inserts.
do $fixture_assertions$
declare
  qa_workspace record;
begin
  for qa_workspace in
    select id, slug, agent_mode, daily_digest, email_from, sms_from, whatsapp_from
    from public.workspaces
    where slug in ('kydos-qa-alpha-20261114', 'kydos-qa-beta-20261114')
  loop
    if qa_workspace.agent_mode <> 'off'
      or qa_workspace.daily_digest is distinct from false
      or qa_workspace.email_from is not null
      or qa_workspace.sms_from is not null
      or qa_workspace.whatsapp_from is not null then
      raise exception 'Unsafe outbound settings in QA workspace %', qa_workspace.slug;
    end if;
    if (select count(*) from public.pipelines p
        where p.workspace_id = qa_workspace.id and p.name = 'QA Pipeline') <> 1 then
      raise exception 'QA Pipeline count incorrect for %', qa_workspace.slug;
    end if;
    if (select count(*) from public.stages st
        join public.pipelines p on p.id = st.pipeline_id
        where st.workspace_id = qa_workspace.id and p.name = 'QA Pipeline'
          and st.name in ('New', 'Contacted', 'Won')) <> 3 then
      raise exception 'QA stage count incorrect for %', qa_workspace.slug;
    end if;
    if (select count(*) from public.contacts c
        where c.workspace_id = qa_workspace.id and c.source = 'qa-synthetic-' ||
          case when qa_workspace.slug = 'kydos-qa-alpha-20261114' then 'alpha' else 'beta' end
          and c.email like '%@example.test'
          and c.tags @> array['qa-synthetic']::text[]) <> 2 then
      raise exception 'Synthetic contact count incorrect for %', qa_workspace.slug;
    end if;
  end loop;
  if (select count(*) from public.workspaces
      where id in ('df55bd02-9862-4d69-aa75-fc5ac67389cb'::uuid,
                    'cdf44e6c-0ba4-40e8-b900-53fc1c1d455b'::uuid)) <> 2 then
    raise exception 'Expected exactly two staging QA workspaces';
  end if;
  if (select count(*) from public.contacts
      where email in ('qa-alpha-optout@example.test', 'qa-beta-optout@example.test')
        and email_opt_out = true and sms_opt_out = true) <> 2 then
    raise exception 'QA opt-out flags are not correct';
  end if;
  if (select count(*) from public.contacts
      where email in ('qa-alpha-one@example.test', 'qa-beta-one@example.test')
        and email_opt_out = false and sms_opt_out = false) <> 2 then
    raise exception 'QA non-opted-out contact flags are not correct';
  end if;
end;
$fixture_assertions$;

commit;

-- Verification queries must return 2 workspaces, 2 pipelines, 6 stages, 4 contacts.
select w.slug, w.agent_mode, w.daily_digest,
  (select count(*) from public.contacts c where c.workspace_id = w.id) as contacts,
  (select count(*) from public.pipelines p where p.workspace_id = w.id) as pipelines,
  (select count(*) from public.stages s where s.workspace_id = w.id) as stages
from public.workspaces w
where w.slug in ('kydos-qa-alpha-20261114', 'kydos-qa-beta-20261114')
order by w.slug;

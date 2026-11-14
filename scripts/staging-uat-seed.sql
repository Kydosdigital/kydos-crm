-- Kydos CRM synthetic staging fixtures ONLY.
-- Execute against Supabase staging project psnpdmwkevnxrdrjyiwk.
-- Never run this SQL on production. No authentication users or outgoing credentials are created.
-- Safe to re-run. Data is clearly labelled, synthetic and uses reserved example.test domains.

begin;

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

commit;

-- Verification queries must return 2 workspaces, 2 pipelines, 6 stages, 4 contacts.
select w.slug, w.agent_mode, w.daily_digest,
  (select count(*) from public.contacts c where c.workspace_id = w.id) as contacts,
  (select count(*) from public.pipelines p where p.workspace_id = w.id) as pipelines,
  (select count(*) from public.stages s where s.workspace_id = w.id) as stages
from public.workspaces w
where w.slug in ('kydos-qa-alpha-20261114', 'kydos-qa-beta-20261114')
order by w.slug;

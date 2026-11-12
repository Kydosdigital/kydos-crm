alter table scheduled_sends add column if not exists channel text not null default 'email' check (channel in ('email','sms','whatsapp'));
alter table scheduled_sends add column if not exists wa_template text;
alter table scheduled_sends add column if not exists wa_lang text default 'en_GB';
alter table scheduled_sends alter column subject drop not null;
alter table scheduled_sends alter column body drop not null;

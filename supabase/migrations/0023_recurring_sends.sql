alter table scheduled_sends add column if not exists repeat text not null default 'none' check (repeat in ('none','weekly','fortnightly','monthly'));

alter table messages drop constraint if exists messages_channel_check;
alter table messages add constraint messages_channel_check check (channel in ('sms','email','whatsapp','messenger','instagram'));

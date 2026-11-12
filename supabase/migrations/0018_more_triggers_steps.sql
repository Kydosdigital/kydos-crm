alter table automations drop constraint if exists automations_trigger_type_check;
alter table automations add constraint automations_trigger_type_check check (trigger_type in
  ('contact_created','tag_added','stage_changed','form_submitted','booking_created','booking_cancelled','date_reached','missed_call',
   'reply_received','email_opened','email_clicked','invoice_paid','deal_won','deal_lost','proposal_accepted'));
alter table automation_steps drop constraint if exists automation_steps_type_check;
alter table automation_steps add constraint automation_steps_type_check check (type in
  ('send_email','send_sms','add_tag','remove_tag','move_stage','create_task','wait','stop_if_replied',
   'notify','create_opportunity','wait_weekday','enrol','send_whatsapp',
   'skip_if','skip_unless','end','wait_until','wait_before','wait_after','webhook',
   'assign_owner','set_field','split'));

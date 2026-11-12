alter table automation_steps drop constraint if exists automation_steps_type_check;
alter table automation_steps add constraint automation_steps_type_check check (type in
  ('send_email','send_sms','add_tag','remove_tag','move_stage','create_task','wait','stop_if_replied',
   'notify','create_opportunity','wait_weekday','enrol','send_whatsapp'));

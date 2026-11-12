alter table workspaces alter column brand_color set default '#0e5a48';
update workspaces set brand_color = '#0e5a48' where brand_color = '#1f3a5f';

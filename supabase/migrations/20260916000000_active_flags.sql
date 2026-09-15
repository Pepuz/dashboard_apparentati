-- Rows referenced by presence or shift history cannot be deleted (FK), so they are deactivated instead.
alter table roommates add column active boolean not null default true;
alter table cleaning_tasks add column active boolean not null default true;

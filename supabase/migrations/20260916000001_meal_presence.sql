-- Dropped and recreated instead of altered; the guard refuses to drop the table if it holds data.
do $$
begin
  if exists (select 1 from dinner_presence) then
    raise exception 'dinner_presence is not empty: migrate its rows before replacing the table';
  end if;
  drop table dinner_presence;
end $$;

create table meal_presence (
  id uuid primary key default gen_random_uuid(),
  roommate_id uuid not null references roommates(id),
  date date not null,
  meal text not null check (meal in ('lunch', 'dinner')),
  is_present boolean not null,
  required_time time,
  guest_names text[] not null default '{}',
  note text,
  updated_at timestamptz not null default now(),
  unique (roommate_id, date, meal),
  constraint absent_has_no_guests_or_time
    check (is_present or (cardinality(guest_names) = 0 and required_time is null))
);

alter table meal_presence enable row level security;

create policy "anon read meal_presence" on meal_presence
  for select to anon using (true);
create policy "anon insert meal_presence" on meal_presence
  for insert to anon with check (true);
create policy "anon update meal_presence" on meal_presence
  for update to anon using (true) with check (true);

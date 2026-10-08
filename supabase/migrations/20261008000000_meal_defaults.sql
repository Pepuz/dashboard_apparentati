-- Weekly meal habits. weekday is ISO (1 = Monday, 7 = Sunday); a null is_present means "no habit",
-- because anon cannot delete rows.
create table meal_defaults (
  roommate_id uuid not null references roommates(id),
  weekday smallint not null check (weekday between 1 and 7),
  meal text not null check (meal in ('lunch', 'dinner')),
  is_present boolean,
  updated_at timestamptz not null default now(),
  primary key (roommate_id, weekday, meal)
);

alter table meal_defaults enable row level security;

create policy "anon read meal_defaults" on meal_defaults
  for select to anon using (true);
create policy "anon insert meal_defaults" on meal_defaults
  for insert to anon with check (true);
create policy "anon update meal_defaults" on meal_defaults
  for update to anon using (true) with check (true);

-- Supabase no longer exposes new tables to the API roles on its own.
grant select, insert, update on meal_defaults to anon;

-- PostgREST needs a fresh schema cache to embed the new table and to upsert into it.
notify pgrst, 'reload schema';

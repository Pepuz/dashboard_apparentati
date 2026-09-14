-- The anon key is public (shipped in the APK and the TV app), so these policies are the only
-- write guard: anon may write only the two tables the Android app updates.

alter table roommates enable row level security;
alter table dinner_presence enable row level security;
alter table cleaning_tasks enable row level security;
alter table cleaning_shifts enable row level security;

create policy "anon read roommates" on roommates
  for select to anon using (true);

create policy "anon read cleaning_tasks" on cleaning_tasks
  for select to anon using (true);

create policy "anon read dinner_presence" on dinner_presence
  for select to anon using (true);
create policy "anon insert dinner_presence" on dinner_presence
  for insert to anon with check (true);
create policy "anon update dinner_presence" on dinner_presence
  for update to anon using (true) with check (true);

create policy "anon read cleaning_shifts" on cleaning_shifts
  for select to anon using (true);
create policy "anon insert cleaning_shifts" on cleaning_shifts
  for insert to anon with check (true);
create policy "anon update cleaning_shifts" on cleaning_shifts
  for update to anon using (true) with check (true);

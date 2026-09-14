create table roommates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table dinner_presence (
  id uuid primary key default gen_random_uuid(),
  roommate_id uuid not null references roommates(id),
  date date not null,
  is_present boolean not null,
  updated_at timestamptz not null default now(),
  unique (roommate_id, date)
);

create table cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

create table cleaning_shifts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references cleaning_tasks(id),
  roommate_id uuid not null references roommates(id),
  week_start date not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  updated_at timestamptz not null default now(),
  unique (task_id, week_start)
);

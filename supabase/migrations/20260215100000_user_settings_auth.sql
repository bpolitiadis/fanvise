-- User settings table for per-user secrets (e.g. BYOK Gemini API key)
create table if not exists public.user_settings (
    user_id uuid primary key references auth.users(id) on delete cascade,
    gemini_api_key_encrypted text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users can select own settings" on public.user_settings;
create policy "Users can select own settings"
on public.user_settings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings"
on public.user_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.touch_user_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
before update on public.user_settings
for each row
execute function public.touch_user_settings_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Backfill for existing users created before trigger.
insert into public.user_settings (user_id)
select id
from auth.users
on conflict (user_id) do nothing;

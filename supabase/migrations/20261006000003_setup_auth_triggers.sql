-- Migration 3: Auth Triggers and Updated At Handling
-- Security Definer with search_path = '' to protect against search path hijacking

-- Function to automatically update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Trigger on profiles for updated_at
create or replace trigger tr_profiles_updated_at
    before update on public.profiles
    for each row
    execute function public.handle_updated_at();

-- Trigger on countries for updated_at
create or replace trigger tr_countries_updated_at
    before update on public.countries
    for each row
    execute function public.handle_updated_at();

-- Function to handle new user registration from auth.users (Google OAuth)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_display_name text;
    v_avatar_url text;
begin
    -- Extract display name and avatar from Google OAuth metadata
    v_display_name := coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        split_part(new.email, '@', 1)
    );
    v_avatar_url := coalesce(
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'picture'
    );

    -- Insert baseline profile
    insert into public.profiles (
        id,
        display_name,
        avatar_url,
        created_at,
        updated_at
    ) values (
        new.id,
        v_display_name,
        v_avatar_url,
        now(),
        now()
    );

    -- Assign baseline 'user' role
    insert into public.user_roles (
        user_id,
        role,
        created_at
    ) values (
        new.id,
        'user'::public.app_role,
        now()
    );

    return new;
end;
$$;

-- Trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute function public.handle_new_user();

comment on function public.handle_new_user() is 'Creates profiles and default user_role row upon Supabase Auth user creation.';

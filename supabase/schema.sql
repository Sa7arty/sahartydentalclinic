-- ============================================================
-- Saharty Dental Clinic — Staff Portal schema
-- Run this once in the Supabase SQL Editor on a fresh project.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type public.app_role as enum ('dentist', 'front_desk');
create type public.visit_status as enum ('unconfirmed', 'confirmed', 'missed', 'cancelled');
create type public.ledger_entry_type as enum ('charge', 'payment', 'discount');
create type public.payment_method as enum ('cash', 'card', 'transfer', 'other', 'mobile_wallet');
create type public.gender_type as enum ('male', 'female');
create type public.tooth_status as enum (
  'healthy', 'decayed', 'filled', 'crown', 'missing', 'root_canal', 'extraction_needed', 'implant'
);

-- ---------- Locations ----------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

insert into public.locations (name, address) values
  ('Saharty Dental Clinic', '43 Kambiz Street, from Mosaddak, Dokki, Giza, Egypt');

-- ---------- Profiles (1:1 with auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

-- ---------- Roles ----------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

-- ---------- Staff <-> Location assignment ----------
create table public.staff_locations (
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  primary key (user_id, location_id)
);

-- ---------- Helper functions (security definer so RLS can call them safely) ----------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.has_location_access(_user_id uuid, _location_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff_locations
    where user_id = _user_id and location_id = _location_id
  )
$$;

-- ---------- Providers (doctors, managed in Settings) ----------
create table public.providers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  specialty text,
  license_number text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- App settings (singleton row) ----------
create table public.app_settings (
  id boolean primary key default true check (id),
  id_digit_length int not null default 5 check (id_digit_length between 1 and 7),
  auto_generate_file_number boolean not null default true,
  required_fields text[] not null default array['first_name', 'last_name']::text[],
  week_start_day int not null default 6 check (week_start_day between 0 and 6),
  default_visit_duration_minutes int not null default 60 check (default_visit_duration_minutes > 0),
  elderly_age_threshold int not null default 65 check (elderly_age_threshold > 0),
  currency text not null default 'EGP',
  default_country text default 'Egypt',
  default_nationality text default 'Egypt',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

-- ---------- Patient groups (managed in Settings) ----------
create table public.patient_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.patient_groups (name) values ('Family'), ('VIP');

-- ---------- Manageable medical conditions list (searchable dropdown source) ----------
create table public.medical_conditions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Procedures + price list (managed in Settings) ----------
create table public.procedure_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.procedure_categories(id) on delete set null,
  name text not null,
  code text,
  description text,
  default_duration_minutes int,
  default_price numeric(10,2),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Patient file numbering (a sequence never reuses a number, even after deletes) ----------
create sequence public.patient_file_number_seq start 1;

create or replace function public.next_patient_file_number()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  n bigint;
  digits int;
begin
  select id_digit_length into digits from public.app_settings limit 1;
  n := nextval('public.patient_file_number_seq');
  return lpad(n::text, coalesce(digits, 5), '0');
end;
$$;

create or replace function public.peek_next_patient_file_number()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  last_val bigint;
  called boolean;
  n bigint;
  digits int;
begin
  select last_value, is_called into last_val, called from public.patient_file_number_seq;
  n := case when called then last_val + 1 else last_val end;
  select id_digit_length into digits from public.app_settings limit 1;
  return lpad(n::text, coalesce(digits, 5), '0');
end;
$$;

create or replace function public.set_patient_file_number_counter(new_value bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'dentist') then
    raise exception 'only a dentist can change the file number counter';
  end if;
  perform setval('public.patient_file_number_seq', new_value, true);
end;
$$;

-- Re-pad all existing file numbers to a new digit length (only affects leading zeros;
-- never truncates a number that already has more digits than requested).
create or replace function public.repad_patient_file_numbers(new_digits int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'dentist') then
    raise exception 'only a dentist can change file numbers';
  end if;
  update public.patients
  set file_number = case
    when file_number is null then null
    when ltrim(file_number, '0') = '' then lpad('0', new_digits, '0')
    when length(ltrim(file_number, '0')) >= new_digits then ltrim(file_number, '0')
    else lpad(ltrim(file_number, '0'), new_digits, '0')
  end
  where file_number is not null;
end;
$$;

-- ---------- Patients ----------
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_name text,
  last_name text not null,
  gender public.gender_type,
  date_of_birth date,
  marital_status text,
  nationality text,
  national_id text,
  occupation text,
  phone text,
  phone_secondary text,
  email text,
  country text,
  city text,
  district text,
  address text,
  provider_id uuid references public.providers(id) on delete set null,
  group_id uuid references public.patient_groups(id) on delete set null,
  is_smoker boolean not null default false,
  medical_history text,
  notes text,
  file_number text unique default public.next_patient_file_number(),
  primary_location_id uuid references public.locations(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz
);

create or replace function public.patients_set_audit_fields()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
  elsif TG_OP = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger patients_audit_fields
  before insert or update on public.patients
  for each row execute function public.patients_set_audit_fields();

-- ---------- Visits ----------
create or replace function public.default_visit_duration()
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce((select default_visit_duration_minutes from public.app_settings limit 1), 60)
$$;

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete set null,
  location_id uuid not null references public.locations(id),
  scheduled_at timestamptz not null,
  duration_minutes int not null default public.default_visit_duration(),
  status public.visit_status not null default 'unconfirmed',
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Clinical records (dentist only; editable, with an edit audit trail) ----------
create table public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid references public.visits(id),
  note text,
  treatment_plan text,
  author_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz
);

create or replace function public.clinical_records_set_audit_fields()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.author_id := coalesce(new.author_id, auth.uid());
  elsif TG_OP = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger clinical_records_audit_fields
  before insert or update on public.clinical_records
  for each row execute function public.clinical_records_set_audit_fields();

-- ---------- Photos (dentist only) ----------
create table public.patient_photos (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid references public.visits(id),
  storage_path text not null,
  label text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- Ledger (dentist + front_desk — bookkeeping only, no payment processing) ----------
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  entry_date date not null default current_date,
  occurred_at timestamptz not null default now(),
  entry_type public.ledger_entry_type not null,
  description text,
  amount numeric(10,2) not null check (amount >= 0),
  payment_method public.payment_method,
  entered_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- Expenses (clinic overhead — dentist only) ----------
-- expense_type: 'general' | 'provider_fee' | 'lab_fee'. Provider/lab fees can be tied to a
-- patient (and provider) so they show on the patient file AND roll up into clinic expenses.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  occurred_at timestamptz not null default now(),
  description text not null,
  category text,
  amount numeric(10,2) not null check (amount >= 0),
  payment_method public.payment_method,
  expense_type text not null default 'general' check (expense_type in ('general', 'provider_fee', 'lab_fee')),
  patient_id uuid references public.patients(id) on delete set null,
  provider_id uuid references public.providers(id) on delete set null,
  entered_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- Structured medical history ----------
create table public.patient_conditions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  condition text not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.patient_medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.patient_allergies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  name text not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- Tooth chart (dentist only) ----------
create table public.tooth_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  -- FDI two-digit notation: quadrant (1-4) + position from midline (1-8), e.g. 11, 48
  tooth_number int not null check ((tooth_number / 10) between 1 and 4 and (tooth_number % 10) between 1 and 8),
  status public.tooth_status not null default 'healthy',
  note text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (patient_id, tooth_number)
);

-- ---------- New user -> profile row ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.app_settings enable row level security;
alter table public.providers enable row level security;
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.staff_locations enable row level security;
alter table public.patients enable row level security;
alter table public.visits enable row level security;
alter table public.clinical_records enable row level security;
alter table public.patient_photos enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.expenses enable row level security;
alter table public.tooth_records enable row level security;
alter table public.patient_groups enable row level security;
alter table public.patient_conditions enable row level security;
alter table public.patient_medications enable row level security;
alter table public.patient_allergies enable row level security;
alter table public.medical_conditions enable row level security;

create policy "staff manage allergies for accessible patients" on public.patient_allergies for all
  using (
    public.has_role(auth.uid(), 'dentist')
    or exists (select 1 from public.patients p where p.id = patient_allergies.patient_id and public.has_location_access(auth.uid(), p.primary_location_id))
  )
  with check (
    public.has_role(auth.uid(), 'dentist')
    or exists (select 1 from public.patients p where p.id = patient_allergies.patient_id and public.has_location_access(auth.uid(), p.primary_location_id))
  );
alter table public.procedure_categories enable row level security;
alter table public.procedures enable row level security;

-- Medical conditions list / procedures / price list: all staff read; dentist manages
create policy "staff can view conditions list" on public.medical_conditions for select
  using (auth.role() = 'authenticated');
create policy "dentist manages conditions list" on public.medical_conditions for all
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

create policy "staff can view procedure categories" on public.procedure_categories for select
  using (auth.role() = 'authenticated');
create policy "dentist manages procedure categories" on public.procedure_categories for all
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

create policy "staff can view procedures" on public.procedures for select
  using (auth.role() = 'authenticated');
create policy "dentist manages procedures" on public.procedures for all
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

-- Patient groups: all staff read; dentist manages
create policy "staff can view groups" on public.patient_groups for select
  using (auth.role() = 'authenticated');
create policy "dentist manages groups" on public.patient_groups for all
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

-- Conditions & medications: same access as the underlying patient
create policy "staff manage conditions for accessible patients" on public.patient_conditions for all
  using (
    public.has_role(auth.uid(), 'dentist')
    or exists (select 1 from public.patients p where p.id = patient_conditions.patient_id and public.has_location_access(auth.uid(), p.primary_location_id))
  )
  with check (
    public.has_role(auth.uid(), 'dentist')
    or exists (select 1 from public.patients p where p.id = patient_conditions.patient_id and public.has_location_access(auth.uid(), p.primary_location_id))
  );

create policy "staff manage medications for accessible patients" on public.patient_medications for all
  using (
    public.has_role(auth.uid(), 'dentist')
    or exists (select 1 from public.patients p where p.id = patient_medications.patient_id and public.has_location_access(auth.uid(), p.primary_location_id))
  )
  with check (
    public.has_role(auth.uid(), 'dentist')
    or exists (select 1 from public.patients p where p.id = patient_medications.patient_id and public.has_location_access(auth.uid(), p.primary_location_id))
  );

-- App settings: all authenticated staff can read; only dentist changes them
create policy "staff can view settings" on public.app_settings for select
  using (auth.role() = 'authenticated');
create policy "dentist manages settings" on public.app_settings for update
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

-- Providers: all authenticated staff can read; only dentist manages
create policy "staff can view providers" on public.providers for select
  using (auth.role() = 'authenticated');
create policy "dentist manages providers" on public.providers for all
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

-- Locations: all authenticated staff can read; only dentist manages
create policy "staff can view locations" on public.locations for select
  using (auth.role() = 'authenticated');
create policy "dentist manages locations" on public.locations for all
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

-- Profiles
create policy "view own or dentist views all profiles" on public.profiles for select
  using (id = auth.uid() or public.has_role(auth.uid(), 'dentist'));
create policy "update own profile" on public.profiles for update
  using (id = auth.uid());

-- Roles: dentist manages; everyone can see their own
create policy "view own roles or dentist views all" on public.user_roles for select
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'dentist'));
create policy "dentist manages roles" on public.user_roles for all
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

-- Staff-location assignments: dentist manages; everyone sees their own
create policy "view own staff_locations or dentist views all" on public.staff_locations for select
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'dentist'));
create policy "dentist manages staff_locations" on public.staff_locations for all
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

-- Patients: dentist (any location) or staff assigned to that patient's location
create policy "staff view patients in their locations" on public.patients for select
  using (public.has_role(auth.uid(), 'dentist') or public.has_location_access(auth.uid(), primary_location_id));
create policy "staff insert patients in their locations" on public.patients for insert
  with check (public.has_role(auth.uid(), 'dentist') or public.has_location_access(auth.uid(), primary_location_id));
create policy "staff update patients in their locations" on public.patients for update
  using (public.has_role(auth.uid(), 'dentist') or public.has_location_access(auth.uid(), primary_location_id));

-- Visits: same location-scoping as patients
create policy "staff view visits in their locations" on public.visits for select
  using (public.has_role(auth.uid(), 'dentist') or public.has_location_access(auth.uid(), location_id));
create policy "staff manage visits in their locations" on public.visits for all
  using (public.has_role(auth.uid(), 'dentist') or public.has_location_access(auth.uid(), location_id))
  with check (public.has_role(auth.uid(), 'dentist') or public.has_location_access(auth.uid(), location_id));

-- Clinical records: dentist only; editable (edits are tracked via updated_by/updated_at)
create policy "dentist views clinical records" on public.clinical_records for select
  using (public.has_role(auth.uid(), 'dentist'));
create policy "dentist inserts clinical records" on public.clinical_records for insert
  with check (public.has_role(auth.uid(), 'dentist') and author_id = auth.uid());
create policy "dentist updates clinical records" on public.clinical_records for update
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

-- Photos: dentist only
create policy "dentist views photos" on public.patient_photos for select
  using (public.has_role(auth.uid(), 'dentist'));
create policy "dentist uploads photos" on public.patient_photos for insert
  with check (public.has_role(auth.uid(), 'dentist') and uploaded_by = auth.uid());

-- Ledger: dentist (all) or front_desk/dentist scoped to the patient's location
create policy "staff view ledger in their locations" on public.ledger_entries for select
  using (
    public.has_role(auth.uid(), 'dentist')
    or exists (
      select 1 from public.patients p
      where p.id = ledger_entries.patient_id
        and public.has_location_access(auth.uid(), p.primary_location_id)
    )
  );
create policy "staff insert ledger entries in their locations" on public.ledger_entries for insert
  with check (
    entered_by = auth.uid()
    and (
      public.has_role(auth.uid(), 'dentist')
      or exists (
        select 1 from public.patients p
        where p.id = ledger_entries.patient_id
          and public.has_location_access(auth.uid(), p.primary_location_id)
      )
    )
  );

-- Expenses: dentist only
create policy "dentist manages expenses" on public.expenses for all
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

-- Tooth chart: dentist only
create policy "dentist views tooth records" on public.tooth_records for select
  using (public.has_role(auth.uid(), 'dentist'));
create policy "dentist manages tooth records" on public.tooth_records for all
  using (public.has_role(auth.uid(), 'dentist'))
  with check (public.has_role(auth.uid(), 'dentist'));

-- ============================================================
-- Storage: private bucket for patient photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('patient-photos', 'patient-photos', false)
on conflict (id) do nothing;

create policy "dentist reads patient photo files"
  on storage.objects for select
  using (bucket_id = 'patient-photos' and public.has_role(auth.uid(), 'dentist'));

create policy "dentist uploads patient photo files"
  on storage.objects for insert
  with check (bucket_id = 'patient-photos' and public.has_role(auth.uid(), 'dentist'));

-- ============================================================
-- v8: recurring expenses + HR (employees, attendance, payroll)
-- ============================================================
alter table public.app_settings add column if not exists profit_share_percent numeric not null default 0 check (profit_share_percent >= 0 and profit_share_percent <= 100);
alter table public.app_settings add column if not exists salary_period_start_day int not null default 26 check (salary_period_start_day between 1 and 28);
alter table public.app_settings add column if not exists salary_pay_day int not null default 28 check (salary_pay_day between 1 and 28);
alter table public.app_settings add column if not exists leave_eligibility_months int not null default 6 check (leave_eligibility_months >= 0);
alter table public.app_settings add column if not exists overtime_midnight_multiplier numeric not null default 2 check (overtime_midnight_multiplier >= 1);
alter table public.app_settings add column if not exists early_overtime_cap_hours numeric not null default 1 check (early_overtime_cap_hours >= 0);
alter table public.app_settings add column if not exists salary_rounding int not null default 10 check (salary_rounding >= 0);
alter table public.app_settings add column if not exists weekly_off_day int not null default 5 check (weekly_off_day between 0 and 6);
alter table public.app_settings add column if not exists late_grace_minutes int not null default 0 check (late_grace_minutes >= 0);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text,
  amount numeric not null,
  payment_method public.payment_method,
  interval_unit text not null default 'month' check (interval_unit in ('day','week','month','year')),
  interval_count int not null default 1 check (interval_count > 0),
  start_date date not null,
  end_type text not null default 'never' check (end_type in ('never','until','count')),
  end_date date,
  occurrences int,
  generated_count int not null default 0,
  next_run_date date not null,
  active boolean not null default true,
  entered_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.recurring_expenses enable row level security;
create policy "dentist manages recurring expenses" on public.recurring_expenses for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

alter table public.expenses add column if not exists recurring_expense_id uuid references public.recurring_expenses(id) on delete set null;

create or replace function public.generate_due_recurring_expenses()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record; nrun date; gcount int; is_active boolean; inserted int := 0; guard int;
begin
  if not public.has_role(auth.uid(), 'dentist') then return 0; end if;
  for r in select * from public.recurring_expenses where active = true and next_run_date <= current_date loop
    nrun := r.next_run_date; gcount := r.generated_count; is_active := true; guard := 0;
    while is_active and nrun <= current_date and guard < 1000 loop
      guard := guard + 1;
      insert into public.expenses (description, category, amount, payment_method, expense_type, occurred_at, expense_date, entered_by, recurring_expense_id)
      values (r.description, r.category, r.amount, r.payment_method, 'general', (nrun::text || ' 12:00:00')::timestamptz, nrun, r.entered_by, r.id);
      inserted := inserted + 1; gcount := gcount + 1;
      nrun := (nrun + (r.interval_count || ' ' || r.interval_unit)::interval)::date;
      if r.end_type = 'count' and gcount >= r.occurrences then is_active := false;
      elsif r.end_type = 'until' and nrun > r.end_date then is_active := false; end if;
    end loop;
    update public.recurring_expenses set next_run_date = nrun, generated_count = gcount, active = is_active where id = r.id;
  end loop;
  return inserted;
end; $$;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_name text,
  last_name text not null,
  position text,
  date_of_birth date,
  hire_date date,
  last_working_day date,
  national_id text,
  national_id_expiry date,
  national_id_file_path text,
  phone text,
  email text,
  shift_start time,
  shift_end time,
  base_salary numeric not null default 0,
  overtime_hourly_rate numeric not null default 0,
  standard_daily_hours numeric not null default 8,
  expected_work_days int not null default 26,
  annual_leave_days int not null default 21 check (annual_leave_days >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.employees enable row level security;
create policy "dentist manages employees" on public.employees for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

create table public.employee_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  check_in time,
  check_out time,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
alter table public.employee_attendance enable row level security;
create policy "dentist manages attendance" on public.employee_attendance for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

create table public.employee_deductions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null default 'deduction' check (kind in ('deduction','loan')),
  description text,
  start_date date,
  total_amount numeric not null check (total_amount > 0),
  per_installment numeric not null check (per_installment > 0),
  amount_settled numeric not null default 0,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.employee_deductions enable row level security;
create policy "dentist manages deductions" on public.employee_deductions for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

create table public.deduction_payments (
  id uuid primary key default gen_random_uuid(),
  deduction_id uuid not null references public.employee_deductions(id) on delete cascade,
  amount numeric not null check (amount > 0),
  kind text not null check (kind in ('salary_deduction','partial_settlement','full_settlement')),
  paid_on date not null default current_date,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.deduction_payments enable row level security;
create policy "dentist manages deduction payments" on public.deduction_payments for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

create table public.misc_income (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text,
  amount numeric not null,
  payment_method public.payment_method,
  occurred_at timestamptz not null default now(),
  income_date date not null default current_date,
  entered_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.misc_income enable row level security;
create policy "dentist manages misc income" on public.misc_income for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  pay_month date not null unique,
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  total_amount numeric not null default 0,
  expense_id uuid references public.expenses(id) on delete set null,
  notes text,
  finalized_by uuid references public.profiles(id),
  finalized_at timestamptz not null default now()
);
alter table public.payroll_runs enable row level security;
create policy "dentist manages payroll runs" on public.payroll_runs for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null,
  position text,
  base_salary numeric not null default 0,
  per_day_value numeric not null default 0,
  expected_days int not null default 0,
  attended_days int not null default 0,
  paid_leave_days int not null default 0,
  unpaid_days int not null default 0,
  regular_pay numeric not null default 0,
  overtime_hours numeric not null default 0,
  overtime_midnight_hours numeric not null default 0,
  overtime_pay numeric not null default 0,
  profit_share numeric not null default 0,
  deductions_total numeric not null default 0,
  rounding_adjustment numeric not null default 0,
  net_pay numeric not null default 0,
  breakdown jsonb,
  created_at timestamptz not null default now()
);
alter table public.payslips enable row level security;
create policy "dentist manages payslips" on public.payslips for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

create table public.employee_leave (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  leave_type text not null default 'annual' check (leave_type in ('annual','sick','emergency','unpaid','day_off')),
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
alter table public.employee_leave enable row level security;
create policy "dentist manages leave" on public.employee_leave for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

insert into storage.buckets (id, name, public) values ('employee-docs', 'employee-docs', false) on conflict (id) do nothing;
create policy "dentist reads employee docs" on storage.objects for select
  using (bucket_id = 'employee-docs' and public.has_role(auth.uid(), 'dentist'));
create policy "dentist uploads employee docs" on storage.objects for insert
  with check (bucket_id = 'employee-docs' and public.has_role(auth.uid(), 'dentist'));
create policy "dentist deletes employee docs" on storage.objects for delete
  using (bucket_id = 'employee-docs' and public.has_role(auth.uid(), 'dentist'));

-- ============================================================
-- v15: inventory (dental materials stock counts)
-- ============================================================
create table public.inventories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
alter table public.inventories enable row level security;
create policy "staff view inventories" on public.inventories for select using (auth.uid() is not null);
create policy "dentist manages inventories" on public.inventories for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

create table public.inventory_clusters (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories(id) on delete cascade,
  name text not null,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
alter table public.inventory_clusters enable row level security;
create policy "staff view clusters" on public.inventory_clusters for select using (auth.uid() is not null);
create policy "dentist manages clusters" on public.inventory_clusters for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.inventory_clusters(id) on delete cascade,
  name text not null,
  brand text,
  original_quantity numeric not null default 0,
  position double precision not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.inventory_items enable row level security;
create policy "staff view items" on public.inventory_items for select using (auth.uid() is not null);
create policy "dentist manages items" on public.inventory_items for all
  using (public.has_role(auth.uid(), 'dentist')) with check (public.has_role(auth.uid(), 'dentist'));

create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  period date not null,
  current_quantity numeric,
  ordered boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (item_id, period)
);
alter table public.inventory_counts enable row level security;
create policy "staff manage counts" on public.inventory_counts for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- After running this file:
-- 1. Create your first staff user under Authentication > Users (invite by email).
-- 2. In the SQL editor, run (with the real user id from auth.users):
--    insert into public.user_roles (user_id, role) values ('<user-id>', 'dentist');
--    insert into public.staff_locations (user_id, location_id)
--      select '<user-id>', id from public.locations where name = 'Saharty Dental Clinic';
-- ============================================================

create extension if not exists "pgcrypto";

-- Helper: function to update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- LEADS
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  owner_id uuid not null, -- counselor user id
  email text,
  phone text,
  full_name text,
  stage text not null default 'new',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for common lead queries:
-- fetch leads by owner, stage, created_at (include tenant_id for multi-tenant filtering)
create index if not exists idx_leads_tenant_owner_stage_created_at
  on public.leads (tenant_id, owner_id, stage, created_at);

create index if not exists idx_leads_tenant_stage
  on public.leads (tenant_id, stage);

create index if not exists idx_leads_owner
  on public.leads (owner_id);

-- Trigger to auto-update updated_at on update
create trigger trg_leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();


-- APPLICATIONS
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  program_id uuid,
  intake_id uuid,
  stage text not null default 'inquiry',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for common application queries:
create index if not exists idx_applications_tenant_lead
  on public.applications (tenant_id, lead_id);

create index if not exists idx_applications_lead_id
  on public.applications (lead_id);

create trigger trg_applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();


-- TASKS
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  application_id uuid not null references public.applications(id) on delete cascade,
  title text,
  type text not null, -- must be one of call,email,review
  status text not null default 'open', -- e.g., open, completed, cancelled
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Check constraint for allowed types
  constraint chk_tasks_type check (type in ('call','email','review')),
  -- Ensure due_at is not before created_at
  constraint chk_tasks_due_at_after_created_at check (due_at >= created_at)
);

-- Indexes for tasks used in "due today" and other queries:
-- Filter by tenant_id + due_at (range for day), and by status
create index if not exists idx_tasks_tenant_due_at_status
  on public.tasks (tenant_id, due_at, status);

create index if not exists idx_tasks_due_at
  on public.tasks (due_at);

create index if not exists idx_tasks_status
  on public.tasks (status);

create index if not exists idx_tasks_application_id
  on public.tasks (application_id);

create trigger trg_tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

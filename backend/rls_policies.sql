

-- Ensure leads has team_id
alter table if exists public.leads
  add column if not exists team_id uuid;

create index if not exists idx_leads_tenant_team on public.leads (tenant_id, team_id);

-- Enable RLS
alter table public.leads enable row level security;

-- Helper to extract claims (we use inline current_setting in each expression)

-- SELECT policy (unchanged)
create policy leads_select_policy on public.leads
  for select
  using (
    (
      (current_setting('request.jwt.claims', true)::json->>'role') = 'admin'
    )
    OR
    (
      owner_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
    )
    OR
    (
      team_id IS NOT NULL
      AND exists (
        select 1
        from public.user_teams ut
        where ut.user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
          and ut.team_id = public.leads.team_id
      )
    )
  );

-- INSERT policy (FIXED: use column names owner_id and team_id in WITH CHECK, not new.owner_id)
create policy leads_insert_policy on public.leads
  for insert
  with check (
    (
      (current_setting('request.jwt.claims', true)::json->>'role') = 'admin'
    )
    OR
    (
      (current_setting('request.jwt.claims', true)::json->>'role') = 'counselor'
      AND (
        -- refer to columns directly (these are the values being inserted)
        owner_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
        OR
        (
          team_id IS NOT NULL
          AND exists (
            select 1
            from public.user_teams ut
            where ut.user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
              and ut.team_id = team_id
          )
        )
      )
    )
  );

-- UPDATE policy (FIXED: use column names in WITH CHECK)
create policy leads_update_policy on public.leads
  for update
  using (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'admin'
    OR owner_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
    OR (team_id IS NOT NULL AND exists (
           select 1 from public.user_teams ut
           where ut.user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
             and ut.team_id = public.leads.team_id
         )
    )
  )
  with check (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'admin'
    OR owner_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
  );

-- DELETE policy
create policy leads_delete_policy on public.leads
  for delete
  using (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'admin'
  );

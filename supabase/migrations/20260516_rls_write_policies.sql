-- RLS write policies (defense in depth).
--
-- The hosted API currently performs all mutations via the Supabase service_role
-- key, which bypasses Row Level Security. That means the API code itself is
-- the only enforcement boundary today. This migration adds INSERT / UPDATE /
-- DELETE policies for the `authenticated` role so that — if a future change
-- routes any mutation through a user JWT, or if the service_role key is
-- accidentally exchanged for an anon/user token — RLS will still reject
-- cross-tenant writes at the database layer.
--
-- service_role continues to bypass RLS as before; this is purely additive.

-- Helper: does the calling user hold one of the allowed roles in the team?
create or replace function public.is_team_role(target_team_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.team_id = target_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

-- security definer functions bypass RLS, so we restrict EXECUTE to the roles
-- that actually need to evaluate them in policies. service_role and the
-- function owner already retain access.
revoke execute on function public.is_team_role(uuid, text[]) from public;
grant execute on function public.is_team_role(uuid, text[]) to authenticated;

-- teams: any authenticated user can create a team they own; updates/deletes
-- require owner role.
create policy "authenticated can create teams"
  on public.teams for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "owners can update teams"
  on public.teams for update
  to authenticated
  using (public.is_team_role(id, array['owner']))
  with check (public.is_team_role(id, array['owner']));

create policy "owners can delete teams"
  on public.teams for delete
  to authenticated
  using (public.is_team_role(id, array['owner']));

-- memberships: a user may insert their own membership row (joining via invite),
-- and owner/admin may insert/update/delete memberships for their team.
create policy "self can insert own membership"
  on public.memberships for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or public.is_team_role(team_id, array['owner','admin'])
  );

create policy "managers can update memberships"
  on public.memberships for update
  to authenticated
  using (public.is_team_role(team_id, array['owner','admin']))
  with check (public.is_team_role(team_id, array['owner','admin']));

create policy "managers can delete memberships"
  on public.memberships for delete
  to authenticated
  using (public.is_team_role(team_id, array['owner','admin']));

-- team_invites: owner/admin only.
create policy "managers can write invites"
  on public.team_invites for insert
  to authenticated
  with check (public.is_team_role(team_id, array['owner','admin']));

create policy "managers can update invites"
  on public.team_invites for update
  to authenticated
  using (public.is_team_role(team_id, array['owner','admin']))
  with check (public.is_team_role(team_id, array['owner','admin']));

create policy "managers can delete invites"
  on public.team_invites for delete
  to authenticated
  using (public.is_team_role(team_id, array['owner','admin']));

-- projects, tasks, delivery_receipts: any active team member can write.
create policy "members can write projects"
  on public.projects for insert
  to authenticated
  with check (public.is_team_member(team_id));

create policy "members can update projects"
  on public.projects for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "members can delete projects"
  on public.projects for delete
  to authenticated
  using (public.is_team_member(team_id));

create policy "members can write tasks"
  on public.tasks for insert
  to authenticated
  with check (public.is_team_member(team_id));

create policy "members can update tasks"
  on public.tasks for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "members can delete tasks"
  on public.tasks for delete
  to authenticated
  using (public.is_team_member(team_id));

create policy "members can write delivery receipts"
  on public.delivery_receipts for insert
  to authenticated
  with check (public.is_team_member(team_id));

create policy "members can update delivery receipts"
  on public.delivery_receipts for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
-- delivery_receipts is intentionally append-mostly: no user-JWT DELETE policy.
-- Service_role retains the ability to purge for retention/cleanup jobs.

-- runners and capabilities: owner/admin write; runners themselves authenticate
-- via service_role-backed token exchange so they bypass RLS by design.
create policy "managers can write runners"
  on public.runners for insert
  to authenticated
  with check (public.is_team_role(team_id, array['owner','admin']));

create policy "managers can update runners"
  on public.runners for update
  to authenticated
  using (public.is_team_role(team_id, array['owner','admin']))
  with check (public.is_team_role(team_id, array['owner','admin']));

create policy "managers can delete runners"
  on public.runners for delete
  to authenticated
  using (public.is_team_role(team_id, array['owner','admin']));

create policy "managers can write runner capabilities"
  on public.runner_capabilities for insert
  to authenticated
  with check (public.is_team_role(team_id, array['owner','admin']));

create policy "managers can update runner capabilities"
  on public.runner_capabilities for update
  to authenticated
  using (public.is_team_role(team_id, array['owner','admin']))
  with check (public.is_team_role(team_id, array['owner','admin']));

-- runner_jobs: members can ENQUEUE work (INSERT only). Lease, claim, status
-- transitions, and event emission are all service_role-only — a permissive
-- user-JWT UPDATE policy would let a team member rewrite another runner's
-- lease and steal in-flight work. There is intentionally no UPDATE/DELETE
-- policy for authenticated; service_role retains full access for the
-- runner-claim hardening stored procedures.
create policy "members can write runner jobs"
  on public.runner_jobs for insert
  to authenticated
  with check (public.is_team_member(team_id));

-- runner_job_events: only the runner (service_role-authenticated) emits
-- events. No authenticated INSERT policy — events are an audit trail and
-- must not be forgeable by team members.

-- wiki_write_requests and wiki_article_index: any team member can request a
-- wiki write; the runner finalizes it via service_role.
create policy "members can write wiki requests"
  on public.wiki_write_requests for insert
  to authenticated
  with check (public.is_team_member(team_id));

create policy "members can update wiki requests"
  on public.wiki_write_requests for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "members can write wiki article index"
  on public.wiki_article_index for insert
  to authenticated
  with check (public.is_team_member(team_id));

create policy "members can update wiki article index"
  on public.wiki_article_index for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

-- orchestration_intents and skills: any active member can author. audit_events
-- and workspace_billing remain service_role-write-only (no policy needed:
-- authenticated has no write policy, so writes via user JWT are denied).
create policy "members can write orchestration intents"
  on public.orchestration_intents for insert
  to authenticated
  with check (public.is_team_member(team_id));

create policy "members can update orchestration intents"
  on public.orchestration_intents for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "members can write skills"
  on public.skills for insert
  to authenticated
  with check (public.is_team_member(team_id));

create policy "members can update skills"
  on public.skills for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

create policy "members can delete skills"
  on public.skills for delete
  to authenticated
  using (public.is_team_member(team_id));

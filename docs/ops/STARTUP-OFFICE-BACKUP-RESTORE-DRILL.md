# Startup Office Backup And Restore Drill

Status: repository-controlled drill template. Live PITR proof must be attached
by the operator before paid production handoff.

## Scope

This drill covers the current `startup-office-schema.v1` manifest and the
customer-visible recovery path for a paid beta workspace.

Required evidence:

- Supabase point-in-time recovery or daily backup setting is enabled for the
  production project.
- `GET /startup-office/export` returns `startup-office-export.v2`.
- Export manifest covers every workspace table from `supabase/schema/current.json`
  except the documented internal queues and deletion tombstones.
- Omitted tables have a customer-visible substitute: runs, receipts,
  notifications, usage events, or legal deletion proof.
- Memory restore rehearsal imports approved `memory_pages` into a non-production
  workspace through `POST /startup-office/memory/import`.
- Receipt traces, approval decisions, memory page slugs, legal acceptance
  evidence, and workspace billing state remain reviewable after rehearsal.

## Operator Steps

1. Pause loop worker, outbox worker, demo seeding, and manual service-role scripts.
2. Record the source workspace ID, target rehearsal workspace ID, schema version,
   latest migration, export timestamp, and operator.
3. Confirm backup availability in Supabase and record the last known-good
   restore timestamp.
4. Export the source workspace with `GET /startup-office/export`.
5. Validate `export_manifest.exported_tables`,
   `export_manifest.omitted_tables`, `export_limits`, and `restore_notes`.
6. Restore company memory into the rehearsal workspace with
   `POST /startup-office/memory/import`.
7. Spot-check restored memory pages, approval decisions, receipt traces, billing
   state, and legal acceptance evidence.
8. Run `npm run startup-office:backup-restore-drill`,
   `npm run startup-office:export-coverage`,
   `npm run startup-office:memory-import`, and
   `npm run startup-office:schema` on the exact commit being handed off.
9. Re-enable workers only after the health dependency check and synthetic monitor
   pass.

## Evidence Record

Fill this record for each paid handoff:

```text
workspace_id:
rehearsal_workspace_id:
operator:
commit:
schema_version:
latest_migration:
export_timestamp:
backup_restore_timestamp:
export_manifest_verified:
memory_pages_imported:
receipt_trace_spot_check:
approval_decision_spot_check:
billing_state_spot_check:
legal_acceptance_spot_check:
commands:
notes:
```

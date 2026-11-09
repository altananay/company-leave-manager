-- V5: the audit trail's before/after states become real JSON (spec 0004 review round 1, L-15).
--
-- The columns held text that happened to contain JSON, so a query could not use the database's JSON
-- operators and no constraint proved the payload was parseable. They are jsonb now; the conversion
-- keeps every existing row (null stays null).
alter table audit_event
    alter column before_state type jsonb using before_state::jsonb,
    alter column after_state type jsonb using after_state::jsonb;

-- The trail is read by type, by target and in time order: the three indexes below cover those reads
-- (occurred_at already had one from V2; `if not exists` keeps this migration honest on a database
-- that ran the earlier index under the same name).
create index if not exists audit_event_event_type_idx on audit_event (event_type);
create index if not exists audit_event_target_idx on audit_event (target_user_id);
create index if not exists audit_event_occurred_at_idx on audit_event (occurred_at);

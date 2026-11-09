-- V4: the cancellation record and the HR retroactive marker (spec 0004 review round 1, L-17/L-06).
--
-- Cancelling an approved request is its own event: it must not overwrite the manager's decision
-- (decided_at / decided_by stay as the decision history). The cancelling actor and its moment get
-- their own columns, so "who decided" and "who withdrew" never collapse into one timestamp.
alter table leave_request add column cancelled_at timestamptz;
alter table leave_request add column cancelled_by uuid references users (id);

-- BR-11's exception: HR may record a request whose start is in the past, but only with a reason.
-- The flag freezes that exception with the row, so the approval-time past-date rule can tell the
-- HR-recorded request (allowed) from an ordinary one whose start slipped into the past (refused).
alter table leave_request add column retroactive boolean not null default false;

create index leave_request_cancelled_by_idx on leave_request (cancelled_by);

-- V2: identity (users), the audit trail, and the Spring Session tables.
--
-- The session DDL is the official Spring Session 4.1 schema (schema-postgresql.sql), lowercased to
-- match the project convention; re-check it when Spring Session is upgraded.

create table users (
    id                   uuid        primary key,
    email                text        not null,
    display_name         text        not null,
    role                 text        not null,
    password_hash        text        not null,
    must_change_password boolean     not null default true,
    active               boolean     not null default true,
    failed_attempts      integer     not null default 0,
    locked_until         timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

create unique index users_email_key on users (lower(email));
create index users_role_idx on users (role);

create table audit_event (
    id             uuid        primary key,
    occurred_at    timestamptz not null,
    event_type     text        not null,
    actor_user_id  uuid,
    target_user_id uuid,
    details        text
);

create index audit_event_occurred_at_idx on audit_event (occurred_at);
create index audit_event_actor_idx on audit_event (actor_user_id);

create table spring_session (
    primary_id            char(36) not null,
    session_id            char(36) not null,
    creation_time         bigint   not null,
    last_access_time      bigint   not null,
    max_inactive_interval integer  not null,
    expiry_time           bigint   not null,
    principal_name        varchar(100),
    constraint spring_session_pk primary key (primary_id)
);

create unique index spring_session_ix1 on spring_session (session_id);
create index spring_session_ix2 on spring_session (expiry_time);
create index spring_session_ix3 on spring_session (principal_name);

create table spring_session_attributes (
    session_primary_id char(36)     not null,
    attribute_name     varchar(200) not null,
    attribute_bytes    bytea        not null,
    constraint spring_session_attributes_pk primary key (session_primary_id, attribute_name),
    constraint spring_session_attributes_fk foreign key (session_primary_id)
        references spring_session (primary_id) on delete cascade
);

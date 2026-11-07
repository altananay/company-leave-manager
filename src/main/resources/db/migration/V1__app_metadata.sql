-- V1: the walking skeleton's only table. Domain tables arrive with their own specs.
create table app_metadata (
    key   text primary key,
    value text not null
);

insert into app_metadata (key, value) values ('schema', '1');

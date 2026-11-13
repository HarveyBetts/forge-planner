-- RLS check for Forge (T4.4). Paste into Supabase → SQL Editor → Run. It changes NOTHING: everything happens inside a
-- transaction that is rolled back at the end. Expected result: every row says PASS.
--
-- It creates two throwaway users (A and B) and, acting as each of them exactly as the app would (role `authenticated` + their
-- JWT), checks that B can't read, change, delete or forge A's data, that anonymous requests see nothing, and that
-- delete_my_account only ever deletes the caller.
begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@example.invalid');

create temp table rls_results (n serial, check_name text, result text, detail text) on commit drop;

do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  cnt int; txt text; ok boolean; err text;
  procedure_ok boolean;
begin
  -- helper: act as a user (what the app's requests look like to the database)
  -- A writes a document
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  insert into public.user_docs (key, data) values ('settings', '{"owner":"a"}');
  reset role;

  -- B writes a document and looks around
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  set local role authenticated;
  insert into public.user_docs (key, data) values ('settings', '{"owner":"b"}');
  select count(*), max(data->>'owner') into cnt, txt from public.user_docs;
  reset role;
  insert into rls_results (check_name, result, detail) values ('B sees only their own documents', case when cnt = 1 and txt = 'b' then 'PASS' else 'FAIL' end, format('saw %s row(s), owner %s', cnt, txt));

  set local role authenticated;
  select count(*) into cnt from public.user_docs where user_id = a;
  reset role;
  insert into rls_results (check_name, result, detail) values ('B cannot read A''s documents, even by id', case when cnt = 0 then 'PASS' else 'FAIL' end, format('saw %s', cnt));

  set local role authenticated;
  with u as (update public.user_docs set data = '{"hacked":true}' where user_id = a returning 1) select count(*) into cnt from u;
  reset role;
  insert into rls_results (check_name, result, detail) values ('B cannot change A''s documents', case when cnt = 0 then 'PASS' else 'FAIL' end, format('%s row(s) changed', cnt));

  set local role authenticated;
  with d as (delete from public.user_docs where user_id = a returning 1) select count(*) into cnt from d;
  reset role;
  insert into rls_results (check_name, result, detail) values ('B cannot delete A''s documents', case when cnt = 0 then 'PASS' else 'FAIL' end, format('%s row(s) deleted', cnt));

  begin
    set local role authenticated;
    insert into public.user_docs (user_id, key, data) values (a, 'budget', '{"forged":true}');
    reset role;
    insert into rls_results (check_name, result, detail) values ('B cannot write a document as A', 'FAIL', 'insert was allowed');
  exception when others then
    get stacked diagnostics err = message_text;
    reset role;
    insert into rls_results (check_name, result, detail) values ('B cannot write a document as A', 'PASS', err);
  end;

  -- the old tables are locked the same way
  begin
    set local role authenticated;
    insert into public.scenarios (user_id, name, data) values (a, 'forged', '{}');
    reset role;
    insert into rls_results (check_name, result, detail) values ('B cannot write a scenario as A', 'FAIL', 'insert was allowed');
  exception when others then
    get stacked diagnostics err = message_text;
    reset role;
    insert into rls_results (check_name, result, detail) values ('B cannot write a scenario as A', 'PASS', err);
  end;

  -- anonymous requests (no sign-in) see nothing at all
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    set local role anon;
    select count(*) into cnt from public.user_docs;
    reset role;
    insert into rls_results (check_name, result, detail) values ('Signed-out requests see nothing', case when cnt = 0 then 'PASS' else 'FAIL' end, format('anon saw %s row(s)', cnt));
  exception when insufficient_privilege then
    get stacked diagnostics err = message_text;
    reset role;
    insert into rls_results (check_name, result, detail) values ('Signed-out requests see nothing', 'PASS', err);
  end;

  begin
    set local role anon;
    perform public.delete_my_account();
    reset role;
    insert into rls_results (check_name, result, detail) values ('Signed-out requests cannot delete accounts', 'FAIL', 'call was allowed');
  exception when others then
    get stacked diagnostics err = message_text;
    reset role;
    insert into rls_results (check_name, result, detail) values ('Signed-out requests cannot delete accounts', 'PASS', err);
  end;

  -- delete_my_account as B deletes only B (and B's documents); A is untouched
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  set local role authenticated;
  perform public.delete_my_account();
  reset role;
  select count(*) into cnt from auth.users where id in (a, b);
  insert into rls_results (check_name, result, detail) values ('Delete my account removes only the caller', case when cnt = 1 and exists (select 1 from auth.users where id = a) then 'PASS' else 'FAIL' end, format('%s of 2 test users left (A should remain)', cnt));
  select count(*) into cnt from public.user_docs where user_id = b;
  insert into rls_results (check_name, result, detail) values ('…and their documents go with it', case when cnt = 0 then 'PASS' else 'FAIL' end, format('%s of B''s rows left', cnt));
  select count(*) into cnt from public.user_docs where user_id = a;
  insert into rls_results (check_name, result, detail) values ('A''s documents are untouched', case when cnt = 1 then 'PASS' else 'FAIL' end, format('%s row(s)', cnt));
end $$;

select check_name, result, detail from rls_results order by n;
rollback;

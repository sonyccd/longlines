-- Local seed, applied after the migrations by `supabase start` and
-- `supabase db reset` (config.toml [db.seed]). It never runs against the
-- hosted project.
--
-- 1. A confirmed account to sign in with during review:
--      callsign N0SEED, email review@example.com, password longlines
-- 2. Seven complete UTC days of POTA and SOTA spots so the Stats page has
--    something to show. Every row is more than 24 hours old, so recent_spots
--    stays empty and the pgTAP suites, which assume that, are unaffected. The
--    rows bypass ingest, so mode_family is set here the way _shared/modes.ts
--    would set it.
-- 3. One stats snapshot, so the page shows at once instead of waiting for the
--    hourly cron.

-- 1. Reviewer account. GoTrue scans the token columns as strings, so they are
--    '' rather than null. handle_new_user() creates the profile from the
--    callsign in the metadata.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values (
  '00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'review@example.com', extensions.crypt('longlines', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"callsign":"N0SEED","name":"Reviewer"}', now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'email',
  jsonb_build_object('sub', '00000000-0000-4000-8000-000000000001', 'email', 'review@example.com', 'email_verified', true),
  now(), now(), now()
);

-- 2. Spots. setseed makes every reset produce the same week. Yesterday's rows
--    are folded into the hours that are already more than 24 hours old, so the
--    daily chart stays full whatever time the reset runs.
select setseed(0.42);

insert into raw_spots (
  source, source_spot_id, content_hash, ingested_at, spot_time, callsign, spotter,
  frequency_khz, band, mode, mode_family, comment,
  pota_reference, pota_park_name, pota_location, sota_summit_ref, raw_payload
)
with
  parks (ord, ref, name, loc) as (values
    (1,  'US-2763', 'Great Dismal Swamp National Wildlife Refuge', 'US-NC,US-VA'),
    (2,  'US-0817', 'Chattahoochee National Forest',               'US-GA'),
    (3,  'US-4576', 'Cumberland Gap National Historical Park',     'US-KY,US-TN,US-VA'),
    (4,  'US-0731', 'Shenandoah National Park',                    'US-VA'),
    (5,  'US-1218', 'Francis Marion National Forest',              'US-SC'),
    (6,  'US-0001', 'Acadia National Park',                        'US-ME'),
    (7,  'US-2175', 'Hocking Hills State Park',                    'US-OH'),
    (8,  'US-1736', 'Ludington State Park',                        'US-MI'),
    (9,  'US-4335', 'Garner State Park',                           'US-TX'),
    (10, 'US-0890', 'Joshua Tree National Park',                   'US-CA'),
    (11, 'US-3011', 'Pike National Forest',                        'US-CO'),
    (12, 'US-0654', 'Olympic National Park',                       'US-WA'),
    (13, 'US-2990', 'Itasca State Park',                           'US-MN'),
    (14, 'US-3486', 'Custer State Park',                           'US-SD'),
    (15, 'US-0045', 'Everglades National Park',                    'US-FL'),
    (16, 'US-5580', 'Myakka River State Park',                     'US-FL'),
    (17, 'US-0998', 'Pole Mountain Wildlife Management Area',      'US-WY'),
    (18, 'US-1122', 'Yellowstone National Park',                   'US-WY,US-MT,US-ID'),
    (19, 'US-2444', 'Theodore Roosevelt National Park',            'US-ND'),
    (20, 'CA-0032', 'Algonquin Provincial Park',                   'CA-ON')
  ),
  draw as (
    select i,
           -- Uniform over the week, with extra rows on two days so the daily chart is not flat.
           case when i <= 600 then floor(random() * 7)::int when i <= 690 then 2 else 5 end as day,
           -- Mostly North American daytime (UTC afternoon and evening), a little at any hour.
           case when random() < 0.15 then floor(random() * 24)::int
                else least(23, 11 + floor(random() * 8 + random() * 6)::int) end          as hour,
           floor(random() * 60)::int as minute,
           random() as r_src, power(random(), 1.6) as r_op, random() as r_ref,
           random() as r_band, random() as r_mode, random() as r_freq
    from generate_series(1, 760) as i
  ),
  shaped as (
    select d.*,
           case when d.r_src < 0.78 then 'pota' else 'sotawatch' end as source,
           case when d.r_band < 0.38 then '40m' when d.r_band < 0.72 then '20m' when d.r_band < 0.80 then '17m'
                when d.r_band < 0.86 then '15m' when d.r_band < 0.90 then '30m' when d.r_band < 0.94 then '80m'
                when d.r_band < 0.96 then '10m' when d.r_band < 0.98 then '2m'  when d.r_band < 0.99 then '12m'
                else '6m' end as band
    from draw d
  ),
  moded as (
    select s.*,
           case when s.band = '2m' then 'fm'
                when s.band = '30m' and s.r_mode < 0.6 then 'cw'
                when s.r_mode < 0.44 then 'ssb' when s.r_mode < 0.72 then 'cw' when s.r_mode < 0.86 then 'ft8'
                when s.r_mode < 0.89 then 'ft4' when s.r_mode < 0.93 then 'fm' when s.r_mode < 0.96 then 'usb'
                when s.r_mode < 0.985 then null else 'rtty' end as mode
    from shaped s
  ),
  timed as (
    select m.*,
           ((date_trunc('day', now() at time zone 'utc') - interval '7 days')
             + make_interval(days => m.day,
                             hours => case when m.day = 6
                                           then m.hour % greatest(1, extract(hour from now() at time zone 'utc')::int - 1)
                                           else m.hour end,
                             mins => m.minute)) at time zone 'utc' as spot_time,
           case m.band
             when '80m' then case when m.mode = 'cw' then 3530 + m.r_freq * 30 when m.mode in ('ft8', 'ft4') then 3573 else 3800 + m.r_freq * 60 end
             when '40m' then case when m.mode = 'cw' then 7030 + m.r_freq * 30 when m.mode = 'ft8' then 7074 when m.mode = 'ft4' then 7047.5
                                  when m.mode = 'rtty' then 7080 else 7180 + m.r_freq * 100 end
             when '30m' then case when m.mode = 'ft8' then 10136 else 10110 + m.r_freq * 15 end
             when '20m' then case when m.mode = 'cw' then 14030 + m.r_freq * 30 when m.mode = 'ft8' then 14074 when m.mode = 'ft4' then 14080
                                  when m.mode = 'rtty' then 14085 else 14240 + m.r_freq * 60 end
             when '17m' then case when m.mode = 'cw' then 18080 + m.r_freq * 15 when m.mode in ('ft8', 'ft4') then 18100 else 18130 + m.r_freq * 20 end
             when '15m' then case when m.mode = 'cw' then 21030 + m.r_freq * 30 when m.mode in ('ft8', 'ft4') then 21074 else 21280 + m.r_freq * 60 end
             when '12m' then case when m.mode = 'cw' then 24900 + m.r_freq * 15 when m.mode in ('ft8', 'ft4') then 24915 else 24950 + m.r_freq * 20 end
             when '10m' then case when m.mode = 'cw' then 28030 + m.r_freq * 30 when m.mode in ('ft8', 'ft4') then 28074 else 28400 + m.r_freq * 60 end
             when '6m'  then 50125
             else 146520
           end as freq,
           (array['KK4PWJ', 'N4DXX', 'W1AW', 'K4SWL', 'KC8SRM', 'N0ABC', 'W5EM', 'K7RLO', 'KM4ELJ', 'W9OBL',
                  'N2YCH', 'KD2XYZ', 'AC9ZH', 'W4VIM', 'KE8HSL', 'N1KYH', 'K0JBL', 'WB5RMG', 'W2JAN', 'K5TRI'])[1 + floor(m.r_op * 20)::int] as pota_call,
           (array['W4/G4OBK', 'KX0R', 'WW7D', 'N6AN', 'SQ1GPR/P', 'G4YSS', 'M0JLA/P', 'VK3ARR', 'OE5RTP', 'W1PTS'])[1 + floor(m.r_op * 10)::int] as sota_call,
           (array['W4C/CM-001', 'W4C/EM-010', 'W4V/SH-002', 'W7W/LC-015', 'W7O/CN-001', 'W0C/FR-004', 'W0C/PR-023', 'W6/NS-041',
                  'G/LD-001', 'G/SP-004', 'SP/SS-004', 'OE/TI-115', 'VK3/VC-001', 'W1/GM-006', 'W5N/SE-022'])[1 + floor(m.r_ref * 15)::int] as summit,
           1 + floor(m.r_ref * 20)::int as park_ord
    from moded m
  )
select t.source,
       'seed-' || t.i,
       md5(t.source || t.i),
       t.spot_time + interval '90 seconds',
       t.spot_time,
       case when t.source = 'pota' then t.pota_call else t.sota_call end,
       case when t.source = 'pota' then null else 'W4ABC' end,
       round(t.freq::numeric, 1),
       t.band,
       t.mode,
       case when t.mode = 'cw' then 'cw'
            when t.mode in ('ssb', 'usb', 'fm') then 'phone'
            when t.mode in ('ft8', 'ft4', 'rtty') then 'digital' end,
       case when t.mode = 'cw' then 'QRP 5W' when t.mode = 'ssb' and t.r_freq < 0.3 then 'Great signal' else '' end,
       case when t.source = 'pota' then p.ref  end,
       case when t.source = 'pota' then p.name end,
       case when t.source = 'pota' then p.loc  end,
       case when t.source = 'sotawatch' then t.summit end,
       jsonb_build_object('seed', true)
from timed t
join parks p on p.ord = t.park_ord
where t.spot_time <= now() - interval '24 hours'; -- safety net; normally drops nothing

-- 3. A snapshot now rather than at five past the hour.
select public.refresh_stats_snapshot();

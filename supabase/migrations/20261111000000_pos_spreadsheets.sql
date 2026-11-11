-- Accept spreadsheets as well as PDFs for end-of-night reports,
-- and keep the extra figures the Squirrel cashout report provides.

alter table public.pos_reports
  add column if not exists file_type text;

alter table public.pos_report_lines
  add column if not exists account_kind text,
  add column if not exists gross_cents integer,
  add column if not exists comps_cents integer not null default 0,
  add column if not exists cash_due_cents integer,
  add column if not exists tenders jsonb not null default '{}'::jsonb;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.apple.numbers',
  'application/vnd.ms-excel',
  'text/csv'
]
where id = 'pos-reports';

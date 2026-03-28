-- Users are handled by Supabase Auth automatically

-- Store meroshare credentials per user
create table meroshare_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  username text not null,
  password_encrypted text not null,
  dp_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Transactions scraped from meroshare
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  scrip text not null,
  transaction_date date not null,
  credit_quantity numeric,
  debit_quantity numeric,
  balance_after_transaction numeric,
  history_description text,
  scraped_at timestamptz not null,
  line_hash text not null,
  created_at timestamptz default now(),
  unique (user_id, line_hash)
);

-- Purchase source records
create table purchase_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  scrip text not null,
  transaction_date date not null,
  quantity numeric not null,
  rate numeric not null,
  purchase_source text not null,
  scraped_at timestamptz not null,
  line_hash text not null,
  created_at timestamptz default now(),
  unique (user_id, line_hash)
);

-- Enable Row Level Security on all tables
alter table meroshare_credentials enable row level security;
alter table transactions enable row level security;
alter table purchase_sources enable row level security;

-- Policies: users only see their own data
create policy "users manage own credentials"
  on meroshare_credentials for all
  using (auth.uid() = user_id);

create policy "users see own transactions"
  on transactions for all
  using (auth.uid() = user_id);

create policy "users see own purchase sources"
  on purchase_sources for all
  using (auth.uid() = user_id);
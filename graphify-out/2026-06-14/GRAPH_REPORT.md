# Graph Report - .  (2026-06-14)

## Corpus Check
- Corpus is ~18,617 words - fits in a single context window. You may not need a graph.

## Summary
- 362 nodes · 623 edges · 21 communities (17 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.74)
- Token cost: 8,000 input · 16,966 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth & Credentials UI|Auth & Credentials UI]]
- [[_COMMUNITY_Portfolio Holdings Views|Portfolio Holdings Views]]
- [[_COMMUNITY_Playwright Scraper Core|Playwright Scraper Core]]
- [[_COMMUNITY_Credential Crypto & DB Upsert|Credential Crypto & DB Upsert]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Project Config & Docs|Project Config & Docs]]
- [[_COMMUNITY_FastAPI Backend Endpoints|FastAPI Backend Endpoints]]
- [[_COMMUNITY_Transaction Parsing & Mapping|Transaction Parsing & Mapping]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Purchase Normalization Tests|Purchase Normalization Tests]]
- [[_COMMUNITY_Supabase Client|Supabase Client]]
- [[_COMMUNITY_Node TS Config|Node TS Config]]
- [[_COMMUNITY_Vite Env Types|Vite Env Types]]
- [[_COMMUNITY_Vercel Config|Vercel Config]]
- [[_COMMUNITY_Vite Config|Vite Config]]
- [[_COMMUNITY_README|README]]

## God Nodes (most connected - your core abstractions)
1. `async_run_scraper()` - 19 edges
2. `compilerOptions` - 16 edges
3. `_normalize_purchase_table_df()` - 11 edges
4. `scrape_purchase_sources()` - 10 edges
5. `ParsedTransaction` - 10 edges
6. `ScripAggregate` - 10 edges
7. `ScraperError` - 9 edges
8. `useAuth()` - 9 edges
9. `ParsedPurchaseLine` - 9 edges
10. `post_refresh()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `_fernet()` --calls--> `fernet()`  [INFERRED]
  api_app.py → meroshare_crypto.py
- `APIError` --uses--> `ScraperError`  [INFERRED]
  api_app.py → main.py
- `BackgroundTasks` --uses--> `ScraperError`  [INFERRED]
  api_app.py → main.py
- `Dependabot Config` --references--> `FastAPI App`  [INFERRED]
  .github/dependabot.yml → README.md
- `Dependabot Config` --references--> `React Dashboard`  [INFERRED]
  .github/dependabot.yml → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Manual Refresh Flow** — readme_react_dashboard, readme_fastapi, readme_playwright_scraper, readme_supabase_postgres [EXTRACTED 0.85]
- **Scheduled Scrape Flow** — workflows_meroshare_scrape, readme_main_py, readme_playwright_scraper, readme_supabase_postgres [EXTRACTED 0.85]
- **Portfolio Aggregation** — readme_dashboard_page_tsx, readme_aggregate_portfolio_ts, readme_apply_purchase_costs_ts, readme_portfolio_math [INFERRED 0.75]

## Communities (21 total, 4 thin omitted)

### Community 0 - "Auth & Credentials UI"
Cohesion: 0.07
Nodes (30): AuthContext, AuthContextValue, AuthProvider(), useAuth(), MeroshareCredentials(), SavedRow, PasswordInput(), PasswordInputProps (+22 more)

### Community 1 - "Portfolio Holdings Views"
Cohesion: 0.07
Nodes (29): HoldingsTable(), HoldingsTableProps, PlaceholderMoney(), SoldSections(), SoldSectionsProps, CATEGORY_COLORS, CATEGORY_ORDER, formatNpr() (+21 more)

### Community 2 - "Playwright Scraper Core"
Cohesion: 0.08
Nodes (48): DataFrame, async_run_scraper(), _canonical_purchase_source(), _clear_purchase_input(), _emit_progress(), finalize_purchase_sources_rows(), _find_purchase_result_tables(), _find_purchase_script_input() (+40 more)

### Community 3 - "Credential Crypto & DB Upsert"
Cohesion: 0.13
Nodes (29): Any, decrypt_password(), fernet(), Fernet decrypt for MeroShare passwords (same ENCRYPTION_KEY as api_app)., Decrypt Fernet token stored as ASCII in DB., _canonical_numeric_for_hash(), _dedupe_upsert_rows(), finalized_purchase_rows_to_payload() (+21 more)

### Community 4 - "Frontend Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, papaparse, react, react-dom, react-router-dom, recharts, @supabase/supabase-js, @tanstack/react-table (+21 more)

### Community 5 - "Project Config & Docs"
Cohesion: 0.10
Nodes (29): Dependabot Config, aggregatePortfolio.ts, api_app.py, applyPurchaseCosts.ts, Fernet Credential Encryption, DashboardPage.tsx, DB/main.sql Schema, Dockerfile (+21 more)

### Community 6 - "FastAPI Backend Endpoints"
Cohesion: 0.14
Nodes (25): _bearer_token(), create_scrape_job(), _fernet(), _format_postgrest_error(), health(), mark_job_complete(), mark_job_failed(), MeroshareCredentialsBody (+17 more)

### Community 7 - "Transaction Parsing & Mapping"
Cohesion: 0.18
Nodes (16): classifyTransaction(), buildPortfolioFromDb(), buildScripLtpMap(), dateStr(), DbPurchaseSourceRow, dbPurchaseSourcesToParsed(), DbScripLtpRow, DbTransactionRow (+8 more)

### Community 8 - "TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 9 - "Purchase Normalization Tests"
Cohesion: 0.13
Nodes (4): Tests for purchase source normalization and transaction date backfill., TestCanonicalPurchaseSource, TestNormalizePurchaseTableDf, TestPurchaseFillDates

### Community 10 - "Supabase Client"
Cohesion: 0.28
Nodes (7): Client, _create_client(), _jwt_role_without_verify(), _LazySupabase, Supabase client for server-side use (service role)., Read `role` from a Supabase JWT payload without verifying the signature., Defer create_client until first use so imports (e.g. unit tests) work without en

### Community 11 - "Node TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, lib, module, moduleResolution, skipLibCheck, target, include

## Knowledge Gaps
- **72 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+67 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Client` connect `Supabase Client` to `Auth & Credentials UI`?**
  _High betweenness centrality (0.258) - this node is a cross-community bridge._
- **Why does `ScripAggregate` connect `Portfolio Holdings Views` to `Auth & Credentials UI`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `FastAPI app: POST /api/meroshare/credentials, POST /refresh (background scraper)`, `Create a realtime-visible scrape job row using the service-role client.`, `Lightweight check for load balancers (e.g. Render health path).` to the rest of the system?**
  _106 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth & Credentials UI` be split into smaller, more focused modules?**
  _Cohesion score 0.06558441558441558 - nodes in this community are weakly interconnected._
- **Should `Portfolio Holdings Views` be split into smaller, more focused modules?**
  _Cohesion score 0.07294117647058823 - nodes in this community are weakly interconnected._
- **Should `Playwright Scraper Core` be split into smaller, more focused modules?**
  _Cohesion score 0.0824829931972789 - nodes in this community are weakly interconnected._
- **Should `Credential Crypto & DB Upsert` be split into smaller, more focused modules?**
  _Cohesion score 0.12903225806451613 - nodes in this community are weakly interconnected._
# Graph Report - nepse-portfolio  (2026-09-02)

## Corpus Check
- 73 files · ~21,335 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 412 nodes · 715 edges · 26 communities (20 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5340cc97`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]

## God Nodes (most connected - your core abstractions)
1. `async_run_scraper()` - 21 edges
2. `compilerOptions` - 16 edges
3. `nepse-portfolio` - 16 edges
4. `apply_asba_ipo_listings()` - 11 edges
5. `_normalize_purchase_table_df()` - 11 edges
6. `scrape_purchase_sources()` - 10 edges
7. `ScraperError` - 10 edges
8. `ParsedTransaction` - 10 edges
9. `ScripAggregate` - 10 edges
10. `async_run_asba_apply()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `_fernet()` --calls--> `fernet()`  [INFERRED]
  api_app.py → meroshare_crypto.py
- `Dependabot Config` --references--> `FastAPI App`  [INFERRED]
  .github/dependabot.yml → README.md
- `Dependabot Config` --references--> `React Dashboard`  [INFERRED]
  .github/dependabot.yml → README.md
- `CI Workflow` --references--> `React Dashboard`  [INFERRED]
  .github/workflows/ci.yml → README.md
- `Web Index HTML` --references--> `React Dashboard`  [INFERRED]
  web/index.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Manual Refresh Flow** — readme_react_dashboard, readme_fastapi, readme_playwright_scraper, readme_supabase_postgres [EXTRACTED 0.85]
- **Scheduled Scrape Flow** — workflows_meroshare_scrape, readme_main_py, readme_playwright_scraper, readme_supabase_postgres [EXTRACTED 0.85]
- **Portfolio Aggregation** — readme_dashboard_page_tsx, readme_aggregate_portfolio_ts, readme_apply_purchase_costs_ts, readme_portfolio_math [INFERRED 0.75]

## Communities (26 total, 6 thin omitted)

### Community 0 - "Auth & Credentials UI"
Cohesion: 0.17
Nodes (11): formatDateTime(), ScrapeProgressCard(), ScrapeProgressCardProps, Channel, useScrapeJobRealtime(), UseScrapeJobRealtimeResult, isTerminalScrapeJob(), RefreshResponse (+3 more)

### Community 1 - "Portfolio Holdings Views"
Cohesion: 0.06
Nodes (39): HoldingsTable(), HoldingsTableProps, PlaceholderMoney(), SoldSections(), SoldSectionsProps, CATEGORY_COLORS, CATEGORY_ORDER, formatNpr() (+31 more)

### Community 2 - "Playwright Scraper Core"
Cohesion: 0.06
Nodes (65): BrowserContext, DataFrame, apply_asba_ipo_listings(), _asba_progress_after_scrape(), async_run_asba_apply(), async_run_scraper(), _canonical_purchase_source(), _clear_purchase_input() (+57 more)

### Community 3 - "Credential Crypto & DB Upsert"
Cohesion: 0.11
Nodes (35): Any, decrypt_encrypted(), decrypt_password(), fernet(), Fernet decrypt for MeroShare passwords (same ENCRYPTION_KEY as api_app)., Decrypt Fernet token stored as ASCII in DB., Decrypt any Fernet token stored as ASCII in DB., NamedTuple (+27 more)

### Community 4 - "Frontend Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, papaparse, react, react-dom, react-router-dom, recharts, @supabase/supabase-js, @tanstack/react-table (+21 more)

### Community 5 - "Project Config & Docs"
Cohesion: 0.06
Nodes (44): Dependabot Config, aggregatePortfolio.ts, api_app.py, API Endpoints, applyPurchaseCosts.ts, Architecture, Fernet Credential Encryption, DashboardPage.tsx (+36 more)

### Community 6 - "FastAPI Backend Endpoints"
Cohesion: 0.14
Nodes (28): _bearer_token(), create_scrape_job(), _fernet(), _format_postgrest_error(), health(), mark_job_complete(), mark_job_failed(), MeroshareCredentialsBody (+20 more)

### Community 7 - "Transaction Parsing & Mapping"
Cohesion: 0.44
Nodes (6): canonicalPurchaseSource(), isBonusPurchaseSource(), isZeroCostPurchaseSource(), parsePurchaseCsv(), parseQty(), parseRate()

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

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (15): AuthContext, AuthContextValue, AuthProvider(), useAuth(), MeroshareCredentials(), SavedRow, PasswordInput(), PasswordInputProps (+7 more)

### Community 22 - "Community 22"
Cohesion: 0.70
Nodes (4): formatNpr(), formatSignedNpr(), SummaryCards(), SummaryCardsProps

### Community 24 - "Community 24"
Cohesion: 0.40
Nodes (4): 1. MeroShare portfolio scrape → Supabase, 2. Market-data CSV crons (launchd), Gotcha: launchd log path must be OUTSIDE `~/Desktop`, Operations Runbook

## Knowledge Gaps
- **90 isolated node(s):** `nepse-portfolio`, `name`, `private`, `version`, `type` (+85 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ScraperError` connect `FastAPI Backend Endpoints` to `Playwright Scraper Core`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `FastAPI app: POST /api/meroshare/credentials, POST /refresh (background scraper)`, `Create a realtime-visible scrape job row using the service-role client.`, `Lightweight check for load balancers (e.g. Render health path).` to the rest of the system?**
  _134 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Portfolio Holdings Views` be split into smaller, more focused modules?**
  _Cohesion score 0.05868544600938967 - nodes in this community are weakly interconnected._
- **Should `Playwright Scraper Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06433566433566433 - nodes in this community are weakly interconnected._
- **Should `Credential Crypto & DB Upsert` be split into smaller, more focused modules?**
  _Cohesion score 0.10810810810810811 - nodes in this community are weakly interconnected._
- **Should `Frontend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Project Config & Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
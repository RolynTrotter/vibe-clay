# Insight-Live API Integration — Draft Plan

> Status: **investigation / draft**. This documents what we know, what's blocked,
> and the concrete steps to connect a phone-friendly frontend to Alex's
> Insight-Live account. Last updated 2026-07-21.

## TL;DR

- There is **no publicly available Insight-Live API today.** Tony Hansen
  (Digitalfire) has built one internally since 2022 but it is not open for
  third-party subscription yet.
- The live webapp uses **session/cookie login**, not token auth. The recipe
  share URLs (`recipes.php?rz=...`) return a "Not Logged In" page to anyone
  without a session cookie.
- A site hosted **only** on GitHub Pages **cannot** talk to `insight-live.com`
  directly from the browser (CORS + no place to keep a secret). True live sync
  needs *either* the official API (with CORS) *or* a tiny serverless proxy.
- Therefore v1 is built **offline-first**: the glaze-chemistry engine, UI, and
  Claude skills all work with zero backend. Sync is designed for but deferred.

## The credential situation

The task described a username/password "in your environment variables." As of
this session **no such variables exist** in the container. Verified: there is no
`INSIGHT_LIVE_*`, no generic username/password pair (`PWD` is just the shell's
working directory). Nothing was leaked or logged.

**To move forward, one of:**

1. **Safest — paste artifacts.** Alex logs in on his phone/desktop and sends us
   the recipe page HTML + screenshots. Enough to reverse-engineer the data model
   and match it field-for-field. No live secret in the container.
2. **More capable — add env vars.** Set `INSIGHT_LIVE_USER` and
   `INSIGHT_LIVE_PASS` in the session so we can log in and inspect real
   endpoints. Trade-off: a live credential lives in the ephemeral container.
   Never commit it; it stays out of git.
3. **Official route.** Request early API access from Tony Hansen (see below).

## Three ways to actually reach the data

### Option A — Official Digitalfire API (best long-term, blocked now)

Per <https://digitalfire.com/glossary/digitalfire+api>:

- REST, HTTP, JSON or XML, stateless, full CRUD.
- Per-account metering ("meter and measure consumption of each account").
- Covers insight-live.com, the Digitalfire Reference Library, PlainsmanClays,
  RonGetty.
- **Not yet exposed for subscription.** No published base URL, endpoints, or auth
  scheme.

**Action:** draft an outreach to Tony asking (a) whether early/beta access is
possible, (b) whether it supports CORS for a browser SPA, (c) the auth model
(API key vs OAuth), (d) rate limits. If yes, this becomes the primary path and
most of Options B/C fall away. A draft message lives in
`docs/outreach-digitalfire.md` (to be written once we decide to send it).

### Option B — Reverse-engineer the webapp's session endpoints (works now, fragile)

The Web 1.0 app is driven by `*.php` pages that return HTML (and likely some
XHR/JSON under the hood). With a valid session cookie we could:

1. `POST` credentials to the login form on `index.php`, capture the session
   cookie.
2. Fetch `recipes.php` / recipe detail pages and parse the HTML into our data
   model.
3. Watch the browser Network tab (or replicate) to find any JSON XHR endpoints
   the app already calls — those are far more stable to parse than HTML.

**Caveats:**
- Check Insight-Live's Terms of Service before automating logins/scraping.
- HTML scraping is brittle; the page can change without notice.
- **CORS makes this impossible from a pure GitHub Pages browser app.** It only
  works from a server-side context (our container, or a proxy). See Option's
  "proxy" note below.

### Option C — Manual import/export bridge (works now, zero risk)

Until A or B is solid, let Alex move recipes by hand:

- **Import:** paste a recipe (text or the page HTML) into the app; we parse it.
- **Export:** the app emits a clean recipe format (JSON + human-readable) he can
  paste back or keep.

This needs no credentials, no proxy, no ToS questions — and it's genuinely
useful on day one.

## The GitHub-Pages / backend reality

```
                 CORS + no secret storage
   [ browser SPA on alex.github.io ] ──✗──> [ insight-live.com ]

   Fix 1 (official):   SPA ──> Digitalfire API (if it enables CORS)  ✅ future
   Fix 2 (proxy):      SPA ──> Cloudflare Worker ──> insight-live.com ✅ now-ish
   Fix 3 (offline):    SPA works standalone, manual import/export     ✅ today
```

A **Cloudflare Worker** (free tier) is the smallest possible backend: it holds
the session/login logic, adds `Access-Control-Allow-Origin`, and the static
GitHub Pages frontend calls it. Nothing else about the "hosted on GitHub Pages"
goal changes. This is the recommended bridge **if** live sync becomes a
requirement before the official API opens.

## Proposed data model (target: 1:1 with Insight-Live recipes)

A recipe in Insight-Live carries roughly:

| Field | Notes |
|---|---|
| `name`, `code` | recipe title + short code |
| `materials[]` | `{ name, amount, isAdditive }` — batch (usually to 100) + colorants/additives on top |
| `notes` | free text / development history |
| `firing` | firing schedule (segments: ramp °/hr, target, hold) |
| `photos[]` | image references |
| `project` | grouping |
| `links[]` | interlinked recipes |
| `analysis` | derived: UMF, %analysis, mole%, expansion, cost |

Our internal JSON (`data/` + app state) mirrors this so that when a real sync
path opens, mapping is a thin adapter, not a rewrite. See `js/chemistry.js` for
the analysis half, which is fully implemented offline.

## Milestones

- [x] Recon: API status, auth model, CORS constraint, credential check.
- [x] Offline glaze-chemistry engine (UMF, %analysis, expansion, cost).
- [x] Starter materials database (Digitalfire-style analyses).
- [x] Mobile-first UI (blue theme) on GitHub Pages.
- [x] Claude skill for navigating Insight-Live.
- [ ] Decide: official API outreach vs proxy vs offline-only (needs Alex).
- [ ] Recipe import parser (paste HTML/text → data model).
- [ ] Sync adapter (once a data path is chosen).

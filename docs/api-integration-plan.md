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

### Option C — Manual import/export bridge (IMPLEMENTED, zero risk)

Insight-Live has a built-in **Export** that produces an XML recipe library.
vibe-clay now imports it directly (`js/import.js`), so Alex can:

- Export his library from Insight-Live → open the XML in vibe-clay → every
  recipe, with full chemistry, on his phone. Parsing is 100% on-device; nothing
  is uploaded.
- Round-trip back out via `toInsightLiveXML()` (ready for when a write path
  exists).

Confirmed working against a real 11-recipe export — all materials resolved via
the alias system. This needs no credentials, no proxy, no ToS questions, and is
the recommended day-one bridge. The XML schema is documented in
`skills/insight-live-navigator/SKILL.md`.

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

## Data model (confirmed against a real export)

The Insight-Live export XML gives us the exact shape (see
`skills/insight-live-navigator/SKILL.md` for the XML). Each `<recipe>` carries
`name`, `id`, `key` (the share token), `codenum`, `keywords`, `date`, `notes`,
and `<recipeline material amount [added] [tolerance]>` rows. Our internal model
mirrors it 1:1 and additionally records `rawMaterial`/`matched` per line so a
future write-back preserves Insight-Live's own names. See `js/import.js` and
`js/chemistry.js`.

Still to confirm from Insight-Live (not present in the recipe-library export):
firing schedules, photos, and project grouping — likely separate exports or API
resources.

## Milestones

- [x] Recon: API status, auth model, CORS constraint, credential check.
- [x] Offline glaze-chemistry engine (UMF, %analysis, expansion, cost).
- [x] Starter materials database (Digitalfire-style analyses).
- [x] Mobile-first UI (blue theme) on GitHub Pages.
- [x] Claude skill for navigating Insight-Live.
- [ ] Decide: official API outreach vs proxy vs offline-only (needs Alex).
- [ ] Recipe import parser (paste HTML/text → data model).
- [ ] Sync adapter (once a data path is chosen).

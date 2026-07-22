---
name: make-issue
description: Turn a lay user's rough idea, bug, or feature request into a well-formed GitHub issue via a short interview. Use when the user wants to report a bug, request a feature, or "file an issue" for vibe-clay but doesn't want to write it up themselves. Runs a lightweight interview, maps answers to the repo's issue templates, and creates the issue directly.
---

# Make Issue

Help a non-developer (Alex) file a good GitHub issue by interviewing them, then
create it. Keep it light — a few plain questions, no jargon.

## Repo

`RolynTrotter/vibe-clay`. Templates live in `.github/ISSUE_TEMPLATE/`:
`bug_report.md` (label `bug`) and `feature_request.md` (label `enhancement`).

## Flow

1. **Figure out the type** from what they said, or ask once: "Is this something
   that's broken, or something new you'd like?" → bug vs feature.
2. **Interview** — ask only what's missing, one short question at a time. Don't
   interrogate; infer from context and confirm rather than re-ask.

   *Bug:* what happened → what you expected → which recipe/materials (if it's a
   chemistry issue, get the recipe or the numbers they compared against) →
   device/browser. A screenshot is a bonus, never required.

   *Feature:* what tool or change → if it's porting an Insight-Live feature, ask
   for a screenshot or description of how the original works → why it helps a
   potter.
3. **Compose** the issue body against the matching template's headings. Fill
   every section you can from the interview; write "Not provided" rather than
   leaving a heading empty. Give it a clear title: `[bug] …` or `[feature] …`.
4. **Create it directly** (the user has opted into no-confirmation creation)
   using the GitHub issue-creation tool (`mcp__github__issue_write`, method
   `create`) with owner `RolynTrotter`, repo `vibe-clay`, the title, the body,
   and the label (`bug` or `enhancement`). Then give the user the issue URL.

## Guardrails

- Before creating, do a quick check for an obvious duplicate (`search_issues`)
  and, if you find one, link it and ask whether to add a comment instead.
- Keep the user's own words for the "what happened / why" parts — don't
  over-formalise their voice away.
- Never put secrets, tokens, or credentials in an issue.
- If GitHub tooling isn't available in the session, fall back to handing them the
  finished markdown to paste, and say why.

## Example title/label mapping

| They said | Title | Label |
|---|---|---|
| "the numbers look wrong for my celadon" | `[bug] Unexpected UMF for <recipe>` | `bug` |
| "can it show a firing schedule graph" | `[feature] Firing-schedule editor + graph` | `enhancement` |

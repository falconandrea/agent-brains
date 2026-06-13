---
name: pagespeed-optimizer
description: "Expert skill for optimizing websites to achieve PageSpeed Insights 100/100 across all categories (Performance, Accessibility, Best Practices, SEO). Uses Playwright MCP to run automated PageSpeed diagnostics, extract real metrics, and then apply targeted fixes. This skill should be used when auditing, diagnosing, or fixing PageSpeed scores, Core Web Vitals (CLS, LCP, FCP, TBT, INP), or when optimizing web performance for React/Vite/Next.js sites deployed on Vercel. Triggers on keywords: PageSpeed, Lighthouse, Core Web Vitals, CLS, LCP, FCP, performance optimization, site speed, web vitals, otimizar site, nota do site."
---

# PageSpeed Optimizer

Expert guide for achieving PageSpeed Insights 100/100, based on 65+ battle-tested optimizations from real production sites. Uses Playwright MCP for automated diagnosis directly from pagespeed.web.dev.

## When to Use

- Auditing or improving PageSpeed Insights scores
- Fixing Core Web Vitals (CLS, LCP, FCP, TBT, INP)
- Optimizing site performance for any category
- Diagnosing why a score dropped or is below target
- Planning a performance optimization sprint

## Supported Stack

React 18+, Vite 5+, Next.js 14+, Tailwind CSS, Vercel, Shopify Storefront API, any SPA or SSR framework.

---

## Workflow: Diagnose-Fix-Validate

### Phase 0: Automated Diagnosis with Playwright

**MANDATORY FIRST STEP.** Before any code changes, run a full PageSpeed diagnosis using Playwright MCP to extract real metrics from pagespeed.web.dev.

#### Step 0.1: Run PageSpeed Analysis

Navigate to PageSpeed Insights and trigger the analysis:

```
mcp__playwright__browser_navigate -> https://pagespeed.web.dev/analysis?url={SITE_URL}
```

Wait for analysis to complete (10-30 seconds):

```
mcp__playwright__browser_wait_for -> text "Desempenho" or "Performance" (timeout 60s)
```

#### Step 0.2: Capture Scores (Mobile)

Take a screenshot of the scores section:

```
mcp__playwright__browser_take_screenshot -> filename: pagespeed-mobile-scores.png
```

Take a snapshot to extract the actual metric values:

```
mcp__playwright__browser_snapshot -> filename: pagespeed-mobile-snapshot.yml
```

Read the snapshot to extract: Performance score, FCP, LCP, TBT, CLS, Speed Index.

#### Step 0.3: Switch to Desktop and Capture

Click the "Desktop" / "Computador" tab:

```
mcp__playwright__browser_click -> ref for "Computador" or "Desktop" tab
```

Wait for desktop results, then screenshot + snapshot:

```
mcp__playwright__browser_take_screenshot -> filename: pagespeed-desktop-scores.png
mcp__playwright__browser_snapshot -> filename: pagespeed-desktop-snapshot.yml
```

#### Step 0.4: Capture Diagnostics (scroll down for details)

For EACH tab (mobile and desktop), scroll down and capture the diagnostic sections:

1. **INSIGHTS section** - "Melhorar entrega di imagens", "Causas da troca di layout", "Use ciclos di vida eficientes di cache"
2. **DIAGNOSTICO section** - "Reduza o JavaScript nao usado", "Reduza o CSS nao usato", "Evitar tarefas longas"

Take screenshots of each expanded diagnostic:

```
mcp__playwright__browser_take_screenshot -> fullPage: true, filename: pagespeed-mobile-diagnostics.png
```

#### Step 0.5: Build Baseline Report

From the extracted data, produce a structured baseline:

```markdown
## Baseline Report - {URL}
Date: {date}

### Scores
| Category | Mobile | Desktop |
|----------|--------|---------|
| Performance | X | X |
| Accessibility | X | X |
| Best Practices | X | X |
| SEO | X | X |

### Core Web Vitals
| Metric | Mobile | Desktop | Target | Status |
|--------|--------|---------|--------|--------|
| FCP | Xs | Xs | < 1.8s | OK/FAIL |
| LCP | Xs | Xs | < 2.5s | OK/FAIL |
| TBT | Xms | Xms | < 200ms | OK/FAIL |
| CLS | X | X | < 0.1 | OK/FAIL |
| SI | Xs | Xs | < 3.4s | OK/FAIL |

### Issues Found (by priority)
1. [CRITICAL] ...
2. [HIGH] ...
3. [MEDIUM] ...
```

### Phase 1: Prioritize by Impact

Fix in this order (highest impact first):

```
CLS > LCP > FCP > TBT > Speed Index
```

CLS and LCP are the two metrics that most heavily affect the Performance score. See `references/optimization-checklist.md` for specific fix patterns.

### Phase 2: Fix (one issue at a time)

Each fix = 1 atomic commit + rebuild + re-test. Never batch multiple unrelated fixes.

### Phase 3: Validate with Playwright

After deploying fixes, re-run the diagnosis:

```
mcp__playwright__browser_navigate -> https://pagespeed.web.dev/analysis?url={SITE_URL}
```

Compare new scores against baseline. Repeat until target is reached.

**Important:** Wait 1-2 minutes after deploy for CDN cache propagation before re-testing.

---

## Playwright Diagnosis Patterns

### Pattern: Full Automated Audit

```
1. Navigate to pagespeed.web.dev/analysis?url={URL}
2. Wait for "Performance" or "Desempenho" text
3. Screenshot scores (viewport)
4. Snapshot to extract metric values
5. Click "Desktop"/"Computador" tab
6. Wait, screenshot, snapshot again
7. Scroll to diagnostics, screenshot fullPage
8. Parse all data into baseline report
```

### Pattern: Quick Score Check

```
1. Navigate to pagespeed.web.dev/analysis?url={URL}
2. Wait for results
3. Snapshot only (no screenshots)
4. Extract Performance score + CLS + LCP from snapshot text
5. Compare against previous baseline
```

### Pattern: Verify Specific Fix

```
1. Navigate to pagespeed.web.dev/analysis?url={URL}
2. Wait for results
3. Scroll to specific diagnostic section (e.g., "Causas da troca di layout")
4. Screenshot that section
5. Verify the issue is resolved (element no longer listed)
```

### Pattern: Site Functionality Check

Before and after optimization, verify the site works:

```
1. Navigate to site URL
2. Console messages (level: error) - check for errors
3. Screenshot homepage (fullPage)
4. Navigate to key pages (/produtos, /assinatura, etc.)
5. Screenshot each + check console errors
6. Resize to mobile (375x812) and repeat
```

---

## Optimization Checklist

For the full checklist with code patterns, see `references/optimization-checklist.md`.

### Quick Reference (by category)

**Performance (CLS):**
- Explicit width/height on ALL images
- Skeleton grids matching real layout dimensions
- min-h on dynamic sections (carousels, API-loaded content)
- `contain: layout style` on sections that load async data
- Suspense fallbacks that replicate real DOM structure

**Performance (LCP):**
- Hero with `<picture>` AVIF+WebP + `fetchPriority="high"`
- Responsive srcSet (mobile 800px vs desktop 1920px)
- Preload with separate media queries for mobile/desktop
- Resize images to 2x retina of displayed size
- NEVER use `decoding="async"` on LCP image

**Performance (FCP):**
- Non-blocking font loading (media="print" + onload trick)
- Preconnect to CDN, API, font providers
- Code splitting with React.lazy() for below-the-fold

**Performance (Bundle):**
- Remove unused UI components (grep for imports before deleting)
- Manual chunks in Vite: react-vendor, ui-vendor, query-vendor
- Verify every package in manual chunks is actually imported

**Accessibility:**
- Contrast ratio minimum 4.5:1 (WCAG AA)
- Sequential heading hierarchy (h1, h2, h3 - no skipping)
- Never nest `<button>` inside `<a>`
- alt text on all images, aria-labels on interactive elements

**Best Practices:**
- 9 security headers in vercel.json (CSP, HSTS, X-Frame-Options, COOP, etc.)
- Zero console.log in production (conditional on `import.meta.env.DEV`)
- Explicit aspect-ratio via width/height + object-contain/cover

**SEO:**
- Complete meta tags (title, description, og:*, twitter:*)
- `<html lang="xx">` attribute
- Viewport meta tag

**Cache Strategy (vercel.json):**
- `/assets/(.*)` (Vite hashed): `public, max-age=31536000, immutable`
- `/images/backgrounds/(.*)`: `public, max-age=31536000, immutable`
- `/images/logos/(.*)`: `public, max-age=31536000, immutable`
- `/images/(.*)` (dynamic): `public, max-age=604800, stale-while-revalidate=86400`
- `/fonts/(.*)`: `public, max-age=31536000, immutable`
- Cache rules must be ordered specific-first, generic-last

---

## Common Pitfalls

1. **Vite does NOT interpolate variables in .env files** - Never use `${VAR}` inside .env values
2. **Vercel env vars must match .env** - Pull and compare with `vercel env pull`
3. **Lighthouse mobile uses 4x CPU throttling + slow 4G** - Scores will always be lower than desktop
4. **CrUX field data takes 28 days to update** - Lab data validates immediately, field data does not
5. **React SPA cannot reach 100 Performance mobile** without SSR - Document this as architectural limitation
6. **Cache headers require redeploy to take effect** - And CDN propagation takes 1-2 minutes
7. **Suspense fallback={null} causes CLS** - Always use a skeleton that matches real content dimensions
8. **Always check console errors after deploy** - Use Playwright to verify zero errors in production

---

## Commands

- `*audit URL` - Run full PageSpeed diagnosis via Playwright + produce baseline report
- `*quick-check URL` - Quick score check (scores only, no diagnostics)
- `*fix-cls` - Fix all CLS issues in the project
- `*fix-lcp` - Optimize LCP (hero, images, preload)
- `*fix-images` - Resize and optimize all images
- `*fix-headers` - Add security and cache headers to vercel.json
- `*fix-a11y` - Fix accessibility issues (contrast, headings, aria)
- `*fix-all` - Run all fixes in priority order
- `*verify URL` - Re-run PageSpeed after fixes and compare against baseline
- `*benchmark` - Generate before/after benchmark report
- `*check-site URL` - Verify site functionality via Playwright (console errors, screenshots, mobile)
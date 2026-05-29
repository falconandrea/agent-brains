# Design System

> **For agents**: Read this file entirely before writing or modifying any frontend code.
> Every value here is **non-negotiable**. Do not invent colors, fonts, or spacing outside of this system.

---

## Brand

- **Product name**: <!-- e.g. Itinerary AI -->
- **Tone**: <!-- e.g. modern, trustworthy, minimal, playful -->
- **Target feel**: <!-- e.g. "like Linear meets Airbnb" -->

---

## Color Palette

### Primary
| Token | Value | Usage |
|-------|-------|-------|
| `primary-50` | `#...` | Backgrounds, subtle fills |
| `primary-500` | `#...` | Main CTA, buttons |
| `primary-600` | `#...` | Hover state |
| `primary-700` | `#...` | Active / pressed state |

### Neutral / Gray
| Token | Value | Usage |
|-------|-------|-------|
| `gray-50` | `#...` | Page background |
| `gray-100` | `#...` | Card background |
| `gray-400` | `#...` | Placeholder text |
| `gray-700` | `#...` | Body text |
| `gray-900` | `#...` | Headings |

### Semantic
| Token | Value | Usage |
|-------|-------|-------|
| `success` | `#...` | Positive states |
| `warning` | `#...` | Caution |
| `danger` | `#...` | Destructive actions, errors |
| `info` | `#...` | Informational |

---

## Typography

- **Font family (headings)**: <!-- e.g. Inter, Outfit, Geist -->
- **Font family (body)**: <!-- e.g. Inter, system-ui -->
- **Font family (mono)**: <!-- e.g. JetBrains Mono, Fira Code -->

### Scale
| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| `display` | 3rem | 700 | 1.1 |
| `h1` | 2rem | 700 | 1.2 |
| `h2` | 1.5rem | 600 | 1.3 |
| `h3` | 1.25rem | 600 | 1.4 |
| `body-lg` | 1.125rem | 400 | 1.6 |
| `body` | 1rem | 400 | 1.6 |
| `body-sm` | 0.875rem | 400 | 1.5 |
| `caption` | 0.75rem | 400 | 1.4 |

---

## Spacing Scale

Base unit: **4px**. All spacing must be a multiple of 4.

| Token | Value |
|-------|-------|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-12` | 48px |
| `space-16` | 64px |
| `space-24` | 96px |

---

## Border & Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 4px | Badges, tags |
| `radius-md` | 8px | Inputs, buttons |
| `radius-lg` | 12px | Cards |
| `radius-xl` | 16px | Modals, panels |
| `radius-full` | 9999px | Pills, avatars |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,.05)` | Subtle cards |
| `shadow-md` | `0 4px 6px rgba(0,0,0,.07)` | Cards, dropdowns |
| `shadow-lg` | `0 10px 15px rgba(0,0,0,.1)` | Modals, popovers |
| `shadow-glow` | `0 0 0 3px <primary-200>` | Focus rings |

---

## Components

### Buttons
| Variant | Background | Text | Border | Hover |
|---------|-----------|------|--------|-------|
| `primary` | `primary-500` | white | — | `primary-600` |
| `secondary` | white | `gray-700` | `gray-300` | `gray-50` |
| `danger` | `danger` | white | — | darker |
| `ghost` | transparent | `primary-500` | — | `primary-50` |

> All buttons: height 36px (sm) / 40px (default) / 44px (lg), `radius-md`, font-weight 500.

### Form Inputs
- Border: `gray-300`, `radius-md`, height 40px
- Focus: border `primary-500`, `shadow-glow`
- Error: border `danger`, error message in `danger` below field

### Cards
- Background: white (light) / `gray-900` (dark)
- Border: `gray-200` 1px
- Radius: `radius-lg`
- Padding: `space-6`

---

## Dark Mode

<!-- Describe dark mode strategy if applicable -->
- [ ] Dark mode supported
- Background: `gray-950`
- Surface: `gray-900`
- Border: `gray-800`
- Text: `gray-100`

---

## Motion & Animation

- **Duration short**: 150ms (micro-interactions: hover, focus)
- **Duration medium**: 250ms (modals, drawers)
- **Duration long**: 400ms (page transitions)
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` (standard), `ease-out` (enter), `ease-in` (exit)

> Never use `transition: all`. Always target specific properties.

---

## Do / Don't

### ✅ Do
- Use only the colors and sizes defined above
- Maintain 4:1 minimum contrast for body text, 3:1 for large text
- Define hover, focus, active, and disabled states for every interactive element
- Use `gap` (not margins) for spacing between flex/grid children

### ❌ Don't
- Use arbitrary pixel values outside the spacing scale
- Use more than 2 font families
- Add drop shadows not in the shadow scale
- Mix different button sizes in the same row without justification

---
name: astro-framework
description: "Use this skill whenever working on Astro projects. Triggers on requests involving Astro components, routing, static site generation (SSG), Islands Architecture, client directives (client:load, client:visible, etc.), Tailwind CSS v4 integration, image optimization, or UI features like the Like Button and page transitions."
license: MIT
metadata:
  author: andreafalcon
---

# Astro Framework Guidelines

This skill defines the development standards and component architecture for projects built using Astro, Tailwind CSS v4, and an Islands-based structure.

## Core Stack

*   **Framework**: Astro (Static Site Generation / SSG + Islands Architecture).
*   **Styling**: Tailwind CSS v4 (native, high-performance styling).
*   **Icons**: Standard lightweight icon libraries or clean inline SVGs.

---

## Component Architecture & Islands

Astro renders HTML on the server by default. Client-side JavaScript must be kept to a minimum using Astro's **Islands Architecture**.

### 1. Client Directives
*   **Default**: Do NOT use client directives unless the component explicitly requires user interactivity (e.g. state changes, API calls on interaction).
*   **Sparingly**: Use directives like `client:load` or `client:visible` only where necessary.
*   **Candidate**: The `LikeButton` component is the primary candidate for `client:load`.
*   Avoid adding client directives to purely decorative, static, or informational components.

### 2. Image Optimization
Always use the native Astro Image component for automatic format conversion (AVIF/WebP), resizing, and caching:

```astro
---
import { Image } from 'astro:assets';
import myImage from '../assets/hero.png';
---

<Image 
  src={myImage} 
  alt="Detailed descriptive alt text" 
  width={800} 
  height={450} 
  loading="eager" 
  format="webp"
  class="rounded-lg shadow-md"
/>
```

---

## Design System

*   **Theme**: Minimalist, text-focused blog theme. Spacing, typography, and contrast must feel highly polished, premium, and clean.
*   **Typography**: Utilize the Tailwind CSS Typography plugin via the `prose` class for rich markdown-based layouts (blog articles, case studies).
*   **Responsive**: Strictly follow a **mobile-first** development approach. Ensure interactive components (like buttons) have comfortable touch targets (minimum 44x44px).

---

## Specific UI States & Components

### 1. Like Button (Interactive Island)
When implementing or modifying the `LikeButton` component, strictly follow these state transitions:

*   **Loading State**: Display a subtle, non-intrusive spinner or a faded opacity state while fetching the initial like count or processing the request.
*   **Default State**: Display an outline heart icon with the number of likes next to it.
*   **Liked State**: Display a filled red heart icon with the incremented number. Trigger a subtle micro-animation (e.g., scale-up pop effect) on click.
*   **Error State**: Trigger a toast notification or fail silently. **CRITICAL**: Never block the UI or let the button freeze if the backend request fails.

### 2. Page Transitions & Analytics
*   **Current Standard**: **Full Page Reloads Only**. Standard `astro:transitions` (View Transitions API) are explicitly **disabled or removed** to prevent breaking Google Tag Manager (GTM) event tracking and pageview triggers.
*   **Future Re-evaluation**: Re-evaluate the inclusion of `astro:transitions` only if GTM support and pageview listeners natively improve or custom wrapper integration is validated.

---

## Code Quality checklist for Astro

1. Is this component static? If yes, keep it a standard `.astro` file without client-side JS.
2. Are you optimizing images with `astro:assets` `<Image />`? Do not use plain `<img>` tags for local assets.
3. Are you using Tailwind CSS v4 classes properly? Keep color schemes curated and elegant.
4. If writing article/content wrappers, are you wrapping them in a `prose` class block?
5. Verify that Google Tag Manager compatibility is kept intact by ensuring NO client-side View Transitions bypass full page reloads.

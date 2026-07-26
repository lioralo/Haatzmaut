---
name: Clinical Clarity
colors:
  surface: '#fcf9f2'
  surface-dim: '#dcdad3'
  surface-bright: '#fcf9f2'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ec'
  surface-container: '#f1eee7'
  surface-container-high: '#ebe8e1'
  surface-container-highest: '#e5e2db'
  on-surface: '#1c1c18'
  on-surface-variant: '#3f484a'
  inverse-surface: '#31312c'
  inverse-on-surface: '#f3f0e9'
  outline: '#6f797a'
  outline-variant: '#bfc8c9'
  surface-tint: '#20686f'
  primary: '#0d5c63'
  on-primary: '#ffffff'
  primary-container: '#0d5c63'
  on-primary-container: '#90d2da'
  secondary: '#4b6264'
  on-secondary: '#ffffff'
  secondary-container: '#cbe4e6'
  on-secondary-container: '#506769'
  tertiary: '#283f49'
  tertiary-container: '#3f5661'
  error: '#ba1a1a'
  error-container: '#ffdad6'
  status-success: '#2E7D32'
  status-urgent: '#C62828'
  background: '#fcf9f2'
  clinical-white: '#FFFFFF'
  slate-dark: '#2D2D3A'
  text-main: '#333333'
typography:
  headings: 'Manrope' (sans-serif, weights 600-800, tight tracking)
  body: 'Inter' (sans-serif, weights 400-600, generous line-height 1.6)
  scale:
    display-lg: 48px/56px, weight 700, letterSpacing -0.02em
    headline-lg: 32px/40px, weight 600 (mobile: 24px/32px)
    headline-md: 24px/32px, weight 600
    title-lg: 20px/28px, weight 600
    body-lg: 18px/28px
    body-md: 16px/24px
    body-sm: 14px/20px
    label-md: 12px/16px, letterSpacing 0.05em
rounded:
  DEFAULT: 0.5rem (8px)
  lg: 0.5rem ~ 0.75rem
  xl: 1rem
  full: 9999px
spacing:
  base: 8px
  gutter-desktop: 24px
  gutter-mobile: 16px
  margin-desktop: 40px
  margin-mobile: 20px
---

## Brand & Style

This design system is built for high-stakes medical environments. The aesthetic merges Modern Minimalism with Corporate reliability, emphasizing a "calm-tech" philosophy. The target audience consists of medical practitioners and administrators who require a tool that feels professional yet approachable.

## Colors

- **Primary (#0d5c63):** Deep teal for primary actions, active navigation states, brand identifiers
- **Background (#fcf9f2):** Warm white background to reduce glare
- **Surface-container-low (#f6f3ec):** Light beige for cards and sidebars
- **On-surface (#1c1c18):** Dark grey primary text
- **Status:** success (#2E7D32), urgent (#C62828)

## Components

- **Buttons:** Solid teal primary, outline secondary. Minimum 44px touch target on mobile.
- **Cards:** White background, 1px light-gray border, no shadow except hover. Rounded 8px.
- **Chips:** High-contrast text on low-saturation backgrounds for tags/statuses.
- **Sidebar (Desktop):** Fixed 256px right side, beige background, light border.
- **TopAppBar:** 64px height, white background, bottom border.
- **Glass Cards:** White w/ 80% opacity, backdrop-blur 12px, subtle border for staff cards.

## Design System Notes for Stitch Generation

```
Use Tailwind CSS with RTL (dir="rtl"). Colors: primary #0d5c63, surface #fcf9f2, surface-container-low #f6f3ec, outline-variant #bfc8c9. Fonts: Manrope for headings, Inter for body (from Google Fonts). Icons: Material Symbols Outlined. Roundness: rounded-lg (8px) default. Cards: bg-white border border-outline-variant rounded-xl. Buttons: bg-primary text-on-primary rounded-xl px-6 py-3. Sidebar: fixed right, w-64, bg-surface-container-low. Main content: mr-64. Layout: flex flex-row-reverse. All spacing uses logical properties (ps-/pe-/ms-/me-) for RTL.
```


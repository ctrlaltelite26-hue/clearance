---
name: Clearance Design System
colors:
  surface: '#031426'
  surface-dim: '#031426'
  surface-bright: '#2a3a4e'
  surface-container-lowest: '#000f20'
  surface-container-low: '#0b1d2f'
  surface-container: '#0f2133'
  surface-container-high: '#1a2b3e'
  surface-container-highest: '#253649'
  on-surface: '#d3e4fd'
  on-surface-variant: '#bacac5'
  inverse-surface: '#d3e4fd'
  inverse-on-surface: '#213245'
  outline: '#859490'
  outline-variant: '#3c4a46'
  surface-tint: '#3cddc7'
  primary: '#57f1db'
  on-primary: '#003731'
  primary-container: '#2dd4bf'
  on-primary-container: '#00574d'
  inverse-primary: '#006b5f'
  secondary: '#c1c7d2'
  on-secondary: '#2b3139'
  secondary-container: '#464c55'
  on-secondary-container: '#b6bcc7'
  tertiary: '#ffd1aa'
  on-tertiary: '#4b2800'
  tertiary-container: '#ffac5a'
  on-tertiary-container: '#744000'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#62fae3'
  primary-fixed-dim: '#3cddc7'
  on-primary-fixed: '#00201c'
  on-primary-fixed-variant: '#005047'
  secondary-fixed: '#dde3ee'
  secondary-fixed-dim: '#c1c7d2'
  on-secondary-fixed: '#161c24'
  on-secondary-fixed-variant: '#414750'
  tertiary-fixed: '#ffdcc0'
  tertiary-fixed-dim: '#ffb875'
  on-tertiary-fixed: '#2d1600'
  on-tertiary-fixed-variant: '#6b3b00'
  background: '#031426'
  on-background: '#d3e4fd'
  surface-variant: '#253649'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
---

## Brand & Style
The design system is built for "Clearance," a high-performance B2B SaaS AI autopilot. The brand personality is **utilitarian, precise, and authoritative**. It avoids the "magical" tropes of AI in favor of a "co-pilot" aesthetic—stable, predictable, and exceptionally fast.

The style is **Refined Dark Mode**, drawing inspiration from professional productivity tools like Linear and Superhuman. It prioritizes information density and functional clarity over decorative elements. The visual language is defined by dark, matte surfaces, razor-sharp borders, and high-contrast typography to ensure long-term readability for support agents.

## Colors
The palette is engineered for a low-eye-strain environment. 
- **Primary (Teal):** Reserved for the most important actions (CTAs), active states, and focus indicators. 
- **Surfaces:** A three-tier depth system (Background, Surface, Border) provides structure without the need for heavy shadows.
- **Semantic Colors:** Warning, Danger, and Success colors are saturated to ensure they stand out against the dark backgrounds, used strictly for status badges and destructive actions.

## Typography
Typography follows a strict hierarchy to support scanning large volumes of text. **Geist** is the primary typeface for its neutral, technical character and excellent legibility at small sizes. **JetBrains Mono** is utilized exclusively for technical identifiers (Ticket IDs, Thread IDs, and Metadata) to distinguish them from natural language.

Headlines use slight negative letter-spacing for a tighter, more professional feel. Body text (14px) is the workhorse for email content, while 13px is used for interface labels and dense list views.

## Layout & Spacing
This design system uses an **8px grid system**. Spacing is "generous but dense," mimicking the efficiency of modern terminal or email clients. 

- **Layout Model:** A fluid grid for the main content area with a fixed-width sidebar (240px). 
- **Density:** Thread rows use a height of 48px to 56px to maximize vertical information.
- **Breakpoints:**
  - Mobile (< 768px): Single column, hidden sidebar (drawer).
  - Tablet (768px - 1280px): Compact sidebar, fluid content.
  - Desktop (> 1280px): Fixed sidebar, wide content with max-width of 1440px for readability.

## Elevation & Depth
Depth is achieved through **Tonal Layering** rather than traditional shadows. 
- **Level 0 (Base):** #0B0F14 (Background).
- **Level 1 (Cards/Sidebar):** #141A22 (Surface) with a 1px solid #243044 border.
- **Level 2 (Popovers/Modals):** #1C2530 with a slightly lighter border and a subtle 12px blur ambient shadow (0px 4px 12px rgba(0,0,0,0.5)).

Avoid all glassmorphism. Surfaces must feel solid and structural.

## Shapes
The shape language is **Soft/Technical**. 
- Standard UI elements (Buttons, Inputs, Cards) use a **4px (0.25rem)** corner radius.
- Large containers (Modals) use an **8px (0.5rem)** radius.
- Status Pills use a fully rounded/pill-shaped radius to differentiate them from interactive buttons.
- Indicators (like the pending accent border) are 1px straight vertical lines.

## Components
- **Buttons:** Primary buttons are Solid Teal (#2DD4BF) with Dark Text (#0B0F14). Secondary buttons use Ghost style (Border + Text).
- **Thread Rows:** Use 1px bottom border (#243044). Hover state increases surface brightness to #1C2530. Use a 2px vertical teal bar on the far left for "Unread" or "Active" states.
- **Sidebar:** Active items use a subtle Teal text color and a background of #1C2530. Icons are 16px.
- **Badges:** Small font (11px or 12px), semi-transparent background of the semantic color (15% opacity) with a solid text color.
- **Approval Cards:** Features a 4px solid Teal left border for "Pending" status to draw immediate attention.
- **Inputs:** Darker than the surface (#0B0F14) with a #243044 border. Focus state: Teal border with 0px offset, 2px glow.
- **Toasts:** Positioned bottom-right. Dark surface (#141A22), high-contrast border, and icon indicating the event type.
# Mobile touch and layout conventions (Reserve NI)

Short reference for responsive UI work. Prefer matching existing Tailwind patterns in `src/components/` and `src/app/`.

## Viewport

- Root layout exports Next.js `viewport` (`width: device-width`, `initialScale: 1`, `interactiveWidget: resizes-content`) so mobile browsers resize the layout when the on-screen keyboard opens. See [`src/app/layout.tsx`](../src/app/layout.tsx).

## Safe areas

- Fixed dashboard chrome (mobile top bar, drawer footer) uses `env(safe-area-inset-*)` so content clears notches and the home indicator.
- Global helpers in [`globals.css`](../src/app/globals.css): `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`.

## Touch targets

- Aim for at least **44×44px** for primary navigation and actions (e.g. menu toggle, tab switches, main form submit).
- Public booking flows use **`text-base` (16px) on inputs** where possible so iOS Safari does not auto-zoom on focus.

## Tables and wide grids

- When a table is wider than the viewport, wrap it in `overflow-x-auto` and optionally `touch-pan-x` for clearer horizontal scrolling.
- Use [`HorizontalScrollHint`](../src/components/ui/HorizontalScrollHint.tsx) below the `sm` breakpoint so users know they can swipe for more columns.

## Full-height shells

- Dashboard shell uses `h-[100dvh]` / `max-h-[100dvh]` with a scrollable `main` that has `min-h-0` so nested flex children can shrink and scroll correctly.

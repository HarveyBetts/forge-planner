# DESIGN — "Slate" (carried over from legacy Forge) + finance-specific rules

## Tokens
bg `#F3F5F8` · surface `#FFFFFF` · ink `#0F172A` · accent `#2F6BFF` · success `#10B981` · warn `#F59E0B` · danger `#EF4444`.
Define as CSS variables on `:root`, with a dark set under `@media (prefers-color-scheme: dark)`.
Fonts: **Sora** (display + big numbers), **Inter** (body) via Google Fonts with system fallbacks.
Motion: `--e-out: cubic-bezier(.22,.61,.36,1)` · `--e-slide: cubic-bezier(.22,.9,.3,1)` · `--e-spring: cubic-bezier(.34,1.56,.64,1)`. Use these; don't invent curves.

## Hard rules (each fixed a real complaint — do not regress)
1. Every input/select/textarea ≥ **16px** font (iOS focus-zoom).
2. Hover transforms only inside `@media (hover:hover) and (pointer:fine)` (iOS sticky-hover).
3. `user-select:none` only for `(hover:none) and (pointer:coarse)`; desktop keeps text selection.
4. `prefers-reduced-motion: reduce` collapses all animation.
5. New tappables: `:active` scale ≈ .97–.985 and `touch-action: manipulation`.
6. Stagger entrances only on navigation, never on data refresh.
7. No infinitely animating `filter: blur()`/`backdrop-filter` (iOS lag).
8. Flex children that hold text/numbers get `min-width:0` (no horizontal "bleed").
9. Never `position:fixed` inside a transformed ancestor; mount viewport overlays on `body`.
10. Setting `transition` and the target `transform` in the same frame gets skipped on iOS: force a reflow (`void el.offsetWidth`) between.
11. Safe areas: `viewport-fit=cover` + `env(safe-area-inset-*)` on fixed bars.

## Finance-specific
- **Hero number** (Sora, large) with count-up on first load only. Status chip: green *Ahead*, blue *On track*, amber *Behind* — never rely on colour alone (icon + word).
- **Progress ring** = pot ÷ coast number, capped at 100% visually with a "Coasting 🎉 +£X surplus" state beyond it.
- **Chart**: SVG fan (low/mid/high), dashed glide path, solid actuals, vertical marker at the coast date; labelled axes in today's money; tooltips on tap, not hover.
- **Timeline**: horizontal scrub with spring-eased marker; reduced-motion = jump, no tween.
- **Tone**: plain, calm, honest. "On current assumptions you'd reach about £X–£Y (today's money)". Never "you will", never "guaranteed". Footer: "Estimates, not financial advice."
- **Sheets** (event editor etc.): Apple-style bottom sheet, grip `::before`, drag-to-dismiss on grip zone or when `scrollTop<=2`.
- Empty states are designed screens, not blanks. Skeletons, not spinners.
- Benchmark: native iOS / Linear / Stripe. If it looks like a default form, it's wrong.

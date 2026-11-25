---
name: sudoku-animations
description: Design, implement, and review UI motion in this Sudoku app, especially transitions that change panel or puzzle layout.
---

# Sudoku animations

Use this skill when adding or changing UI motion in the Sudoku app. Read the [animation guidelines](../../../docs/animation-guidelines.md) for the shared motion tokens, pointer gesture lifecycle, FLIP handoff, and mobile resize reference.

## Plan the transition

- Identify the state owner and the exact start and destination geometry before choosing an animation. React or the feature store owns application state; DOM attributes describe rendered state. Use refs and Web Animations API (WAAPI) only for transient playback, not as a second source of truth.
- Keep one component responsible for each animated surface and its cleanup. Avoid using layout effects, resize observers, CSS transitions, and WAAPI to independently animate or fit the same geometry.
- Prefer the shared motion tokens and `motionDuration()` helper. The tabs token is 160 ms for opening or closing input tabs and hint panels across mobile and desktop, including their related layout motion. Mobile and standard desktop hint slots collapse to zero height on exit; advanced dock hint content collapses inside its fixed dock area. The panel token remains 240 ms for other panel transitions; ordinary tab-slide motion uses the standard 150 ms token. Respect reduced-motion behavior in both CSS and JavaScript.
- Use transforms and opacity for visual movement when surrounding layout does not need to change. If layout must respond, commit and measure the layout change, then animate from the currently visible geometry to the actual destination. Keep hit targets aligned with what is visible.

## Panels that change layout

When tabs or panel content appear, decide whether the panel grows or its existing contents shrink. Preserve intentional natural sizes, such as the mobile keypad body, while new toolbar content grows. Make the puzzle fitter respond to the same intermediate card geometry that is animated. Include padding and borders in that geometry; otherwise removing a temporary constraint can cause a second jump at the end.
When inserting a panel between existing panels, animate the inserted panel's block size and let layout move the siblings. Do not also FLIP-scale those siblings from their old positions during that size animation; that duplicates the displacement and can make a sibling appear to shrink or snap back.
For a mobile hint exit, keep the retained hint host in normal layout flow until its block size reaches zero. The fitter must continue observing that host through the exit; removing it from flow at the start makes the puzzle fit as if the hint has already closed. On entry, set the inserted host to zero and synchronously fit the puzzle to that geometry before the first visible frame. Keep the fit mode active until the exit host is unmounted, so removing temporary layout constraints does not create a second destination.

When a hint host collapses its block size on exit, keep that hint surface opaque and stationary until the collapse finishes. Override the shared `motion-surface` exit fade and translation for the hint host; combining them makes the panel look like it fades away instead of closing by collapsing. Unmount it after the same tabs-token duration.

Use matching timing and easing for related layout properties in both directions. Entering and exiting opacity or translation may use their dedicated easing tokens. Track WAAPI animations and temporary inline styles. On finish, cancellation, rapid reopen, and unmount, cancel or clear filled effects, timers, listeners, and temporary dimensions so a reused DOM node starts from a clean state.

## Pointer-driven motion

For dragging, derive preview position and size from the initial geometry plus the latest pointer delta. Schedule at most one animation-frame update at a time, avoid React state updates and repeated layout reads in the pointer loop, and keep dependent surfaces in sync. On release, pass the visible preview position directly into the settled transition. Handle pointer cancellation, lost capture, interruption, and reduced motion.

## Review the result

Inspect the real interaction at a narrow viewport and desktop when both are affected. Review opening, closing, reversing direction, rapid reopen, interruption, resize or drag release, and reduced motion. Compare visible start, intermediate, and final geometry. Look for a second jump after cleanup, a fitter that responds only at the end, stale inline styles, shifted hit targets, or unrelated page scrolling. Follow the relevant project check and interaction-review guidance; do not judge the motion from its duration or from a fast desktop alone.

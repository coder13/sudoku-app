# UI animation guidelines

Use motion to explain a change of state or position. The motion should stay attached to the element the player is following, begin at its current visible position, and end at the actual destination. Keep animation logic close to the component that owns the state; share helpers when more than one feature needs the same behavior.

## Existing motion system

Global durations and easing curves live in `src/styles.css` as `--motion-*` custom properties. The current tokens cover fast (110 ms), standard (150 ms), overlay and panel (240 ms), snap (320 ms), and press (60 ms) motion. Use these tokens for ordinary interface transitions. Use a feature-specific duration only when the interaction needs a distinct, measured settling time, and keep its easing consistent with the motion system.

`src/components/Presence.tsx` contains shared behavior:

- `motionDuration()` reads a duration token and returns zero for reduced motion.
- `animatePanelLayout()` measures before and after layout, then uses the Web Animations API to animate an inverse transform back to the new layout. This is the app's FLIP pattern for panel reordering and related layout changes.
- `MotionSurface` keeps exiting content mounted briefly, marks it inert and hidden from assistive technology, and removes it after the transition window.

The global reduced-motion rule in `src/styles.css` disables CSS transitions and animations. JavaScript-driven motion must also honor `prefers-reduced-motion`; set the final state directly when reduction is requested.

## Choose the right property

- Prefer `transform`, individual `scale`, and `opacity` for movement and fades. These can usually update without recalculating the surrounding layout.
- Avoid animating `top`, `left`, width, height, margins, or other layout properties on every frame. If layout must change, commit it once and animate a transform between the old and new geometry.
- Animate the shared visual group when the player understands several elements as one object. For the mobile puzzle, scale the whole `.puzzle` surface so the board and its controls stay together.
- Set the transform origin deliberately. The mobile puzzle uses its bottom center so shrinking keeps the puzzle visually attached to the input card below it.
- Keep interaction targets available during motion. A visual transition should not move the hit area away from the visible control or make a control temporarily unusable.

## Pointer-driven motion

For a gesture that follows the pointer:

1. Capture the pointer and record the starting pointer coordinate and starting visual geometry once.
2. Store the latest pointer coordinate on move. Schedule at most one `requestAnimationFrame` update at a time, then derive the preview from the original start and the latest pointer position. This avoids dropped intermediate work and accumulated rounding error.
3. Write only the necessary CSS custom properties during the preview. Avoid React state updates and repeated layout reads on every pointer event.
4. Keep all dependent visual elements in the same preview update. Do not defer headers, controls, timers, or other parts of the moving object until release.
5. On release, compute one target, commit its real layout state, and make the current visual position the transition's start before enabling the transition.
6. Finish on `transitionend`, with a bounded fallback for a missing event. Clear temporary attributes and styles on completion, cancellation, a new gesture, and unmount.

Use pointer cancellation and lost pointer capture as real cancellation paths. Preserve taps and horizontal scrolling where the gesture only owns vertical movement. Provide enough hit area around the content so the player can begin the gesture without targeting a small handle.

## Snap animation handoff

The mobile puzzle gesture in `src/components/MobilePanelLayout.tsx` is the reference for a layout-changing snap:

- Dragging down first uses the free gap above the input card, then shrinks the puzzle. Dragging up reverses shrink before moving the puzzle toward the top boundary.
- Preview movement and scale are derived from one continuous pointer delta. On release, the displacement rounds to the nearest 32 px anchor from the current settled position. The top and minimum-size boundaries clamp to their limits.
- The puzzle card's page spacing is committed before animation. Measure the panel's visible top before that commit and its new layout top afterward. The second measurement includes the live drag transform, so remove that contribution when calculating the corrected start offset:

  ```ts
  const liveTranslate = current.space - current.startSpace
  const correctedTranslate = liveTranslate + visualTop - committedTop
  ```

- Write the corrected offset while transitions are disabled, then force layout so the browser applies it. Enable the locking transition and force style resolution again. Only then set the translation to zero and the scale to its target. Without the first flush, the browser can coalesce the corrected offset with the destination and animate from the old drag offset, which can make a snap appear to reverse.
- The panel translation and puzzle scale use the same 320 ms easing. The preview and snap use the same `.puzzle` scale origin and target calculation.

`MobileInputResizeHandle` uses the same 32 px step and `--motion-snap-duration`. Its live content scale is the input height relative to its natural height, applied with CSS `zoom` so text, padding, icons, and button hit areas resize together. The CSS height is divided by that scale so the card still occupies the requested height in the surrounding layout. The minimum content scale is 65%. On release, `animatePanelLayout()` uses the card's live rectangle as the FLIP start and eases the input card to the snapped target rectangle.

Nearest-anchor snapping can move opposite the finger for the final few pixels when the finger has passed the selected anchor. That is expected: the animation must still travel from the release position to the selected anchor. If the product requirement is that release motion always continues in the finger's direction, change the anchor selection rule explicitly; do not hide that difference by reversing or offsetting the animation.

## Verify motion

Test the actual interaction at a narrow mobile viewport and, when possible, on a touch device. Check:

- Both directions from an unchanged anchor, including cases where the target is above or below the release position.
- The first and last anchors, minimum scale, and the point where free gap changes into shrinking.
- Gestures that begin above, below, and beside the moving object, plus taps and horizontal gestures nearby.
- A second gesture that interrupts an active snap, pointer cancellation, and reduced-motion mode.
- The position shortly after release and after the transition ends. Compare the visible element's start and destination rectangles; do not infer direction from the finger direction alone.
- That every related element stays aligned, the input card remains usable, no page scroll or release jump appears, and temporary styles are removed.

For performance work, record a browser performance trace on a representative phone viewport. Look for long frames and layout or paint work inside the pointer loop. Measure frame gaps and release cost; do not rely on how the transition looks on a fast desktop alone.

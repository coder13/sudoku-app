---
name: sudoku-components
description: Choose, build, and maintain React components for the Sudoku app. Use when implementing UI, auditing controls, adding shared patterns, or updating the component catalog and Storybook usage examples.
---

# Sudoku components

Find the intended interaction in the [component catalog](references/components.md). Each entry links to its owning module. Use exported components across features. A private component belongs to the surrounding screen and may depend on its state, layout, or keyboard behavior.

## Choose a button

- Use `Button` for a labeled action. Choose `primary` for the main commit or next step, `secondary` for supporting actions, `quiet` for low-emphasis controls, and `danger` to confirm a destructive change. Form submissions need `type="submit"`.
- Use `IconButton` for a familiar compact action such as closing a dialog or opening a row menu. Supply a contextual `aria-label`. Use `ChoiceButton` when a person needs an icon, title, and optional description to choose between paths.
- Use `buttonClassName` or `iconButtonClassName` on a router link or file-picker label when that element needs button styling. Keep the native element’s navigation or file-selection behavior.
- The keypad, grid candidates, swatches, tabs, menu items and drag handles have specialized sizing or keyboard interactions. Extend their owning component when changing those patterns.

## Place actions on a screen

Give each step its own route so the browser's Back and Forward controls work on phones. Put Back at the leading edge of the heading and use the same history as the browser. Provide a parent destination for someone who opens the page directly. Move keyboard focus to the new heading when the step changes.

Put a dismissible card’s close control in its top-right corner. Align its heading, content, and supporting text to the leading edge. Supporting text and its action can share a row below the content. When a player closes the card, return focus to the control that opens it.

## Interaction states

Raised controls get a subtle shadow on hover-capable pointers. Quiet controls get a surface tint. Keep the hit target in place in every state. Preserve the visible keyboard focus ring, pressed selection, disabled state, and reduced-motion support. Make every action available to touch and keyboard users. State guidance follows [MDN’s hover media feature](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/hover), [WCAG Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), and [Carbon’s button states](https://carbondesignsystem.com/components/button/style/).

## Add or change a component

1. Check the catalog for an interaction that already matches. Reuse it when semantics, keyboard behavior, and state ownership fit. Compose existing components for a new screen.
2. Keep a one-screen behavior near its owner. Extract a shared component when multiple callers need the same interaction, or when centralizing a behavior such as dialog focus management gives callers a clear contract. Give it props that describe the action or state.
3. Document when to use a new shared component on its export. Add a Storybook usage example showing the decision a caller must make, plus the relevant disabled, selected, error, or narrow-screen state. Keep explanatory text in these materials unless players need it in the product.
4. In the same change, update the [catalog](references/components.md) for additions, removals, renames and behavior changes. Revise this guide when a design-system decision changes. Run `npm run check` from the repository root to verify catalog coverage and types. Review the story using keyboard, pointer and a narrow viewport.

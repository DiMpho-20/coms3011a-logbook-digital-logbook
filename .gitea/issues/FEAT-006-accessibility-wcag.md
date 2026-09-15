# FEAT-006: Accessibility (WCAG) Compliance Improvements

**Priority:** Medium
**Status:** Open
**Component:** Frontend — all components
**Labels:** feature, accessibility, ux

## Feature Description
Audit and improve the frontend for WCAG 2.1 AA compliance. The current implementation has not undergone formal accessibility testing. The client specifically requested this as a future improvement.

## User Story
As a user with a disability (visual impairment, motor difficulty, etc.), I want the app to be fully usable with assistive technologies so that I can manage my logbook independently.

## Acceptance Criteria
- [ ] All form inputs have associated `<label>` elements
- [ ] All interactive elements are keyboard-navigable
- [ ] Focus indicators are visible on all interactive elements
- [ ] Colour contrast meets WCAG AA (4.5:1 for text, 3:1 for large text)
- [ ] All images have meaningful `alt` text
- [ ] ARIA roles and labels are used where needed (modals, dropdowns, etc.)
- [ ] Screen reader testing passes for core flows (login, create entry, view dashboard)

## Current Behaviour
The app uses Tailwind CSS for styling with glass-morphism effects that may have contrast issues. No formal accessibility audit has been performed. Some components may lack proper ARIA attributes.

## Proposed Solution
1. Run automated audit with `axe-core` or Lighthouse accessibility report
2. Fix all critical and serious violations
3. Add ARIA labels to navigation, modals, and form elements
4. Test with a screen reader (NVDA or VoiceOver)
5. Document accessibility conformance in docs

## Evidence
- `docs/client-interactions.md` — listed as a future improvement
- Glass-morphism UI (`GlassCard.tsx`, `AnimatedBackground.tsx`) may have contrast issues

## Related
- `apps/frontend/src/components/GlassCard.tsx` — glass effect may fail contrast
- `apps/frontend/src/components/Modal.tsx` — needs focus trap and ARIA
- `apps/frontend/src/components/Sidebar.tsx` — needs ARIA navigation role

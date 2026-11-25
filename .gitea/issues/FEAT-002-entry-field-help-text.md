# FEAT-002: Entry-Field Help Text and Inline Guidance

**Priority:** High
**Status:** Open (filed from Sprint 2 user feedback)
**Component:** Frontend — `apps/frontend/src/components/EntryForm.tsx`
**Labels:** feature, ux, user-feedback

## Feature Description
Add inline help text, tooltips, or placeholder hints to entry form fields so that users understand what format each field expects (text, number, date, formula, etc.). Two out of six SUS testers found the entry-field format confusing when adding entries.

## User Story
As a new user, I want to see hints next to each entry field so that I know what type of data to enter without guessing.

## Acceptance Criteria
- [ ] Each entry field shows a type icon or label (e.g. "Text", "Number", "Date")
- [ ] Formula fields show an example formula or tooltip explaining syntax
- [ ] Required fields are clearly marked with an asterisk
- [ ] A "?" tooltip explains what computed fields do
- [ ] Help text is visible on both desktop and mobile

## Current Behaviour
Entry fields are rendered with only their name as a label. Users must infer the expected format from the field name or from error messages after submitting invalid data.

## Proposed Solution
1. Read the field type from the project's entry field definitions
2. Render a type badge next to each input
3. Add placeholder text appropriate to the field type (e.g. "YYYY-MM-DD" for dates)
4. Show a tooltip on hover for formula fields explaining the syntax

## Evidence
- SUS Round 1: Testers R1 and R2 found entry-field format confusing
- `docs/project/feedback/user-feedback.md` integration table: "Entry-field help text" filed for Sprint 3
- `docs/project/feedback/round1.csv` raw responses

## Related
- `apps/frontend/src/components/EntryForm.tsx` — the component to modify
- `apps/frontend/src/pages/__tests__/EntryForm.test.tsx` — existing 8 tests to extend

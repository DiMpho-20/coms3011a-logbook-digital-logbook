# FEAT-005: Advanced Notification System

**Priority:** Low
**Status:** Planned (future improvement)
**Component:** Frontend + Backend
**Labels:** feature, notifications

## Feature Description
Extend the current deadline reminder system with more advanced notifications: configurable reminder schedules, email notifications (when email provider is configured), and notification preferences per project.

## User Story
As a student, I want to receive timely reminders about upcoming deadlines so that I never miss a submission.

## Acceptance Criteria
- [ ] Users can configure reminder timing (e.g. 1 day before, 3 days before)
- [ ] Email notifications are sent when an email provider is configured
- [ ] In-app notification bell shows unread count
- [ ] Users can mark notifications as read
- [ ] Overdue entries generate a daily reminder

## Current Behaviour
The `DeadlineReminders` component shows upcoming deadlines in the UI. Notifications are passive (user must visit the app to see them). No email notifications are sent for deadlines.

## Proposed Solution
1. Add a `notification_preferences` table with user-level settings
2. Create a background job (cron) that checks for upcoming/overdue deadlines
3. Send email notifications via the configured email provider (Resend)
4. Add a notification bell icon in the app header with unread count

## Evidence
- `docs/project/client-interactions.md` — listed as a future improvement
- `apps/frontend/src/components/DeadlineReminders.tsx` — existing passive reminder component

## Related
- `apps/backend/src/utils/email.ts` — email utility already supports Resend
- Commit `125d770` — wired up Resend email API with graceful provider fallback

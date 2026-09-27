import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Reminder } from "@logbook/shared";

import {
  disableReminderNotifications,
  enableReminderNotifications,
  notifyNewDueReminders,
  reminderNotificationsEnabled,
} from "../reminderNotifications";

function reminder(id: string, title = `Reminder ${id}`): Reminder {
  return {
    id,
    title,
    note: null,
    source: "MANUAL",
    status: "PENDING",
    remindAt: "2026-09-27T08:00:00.000Z",
    completedAt: null,
    dismissedAt: null,
    createdAt: "2026-09-26T08:00:00.000Z",
    entry: null,
  };
}

const shown: { title: string; options?: NotificationOptions }[] = [];

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  constructor(title: string, options?: NotificationOptions) {
    shown.push({ title, options });
  }
}

beforeEach(() => {
  localStorage.clear();
  shown.length = 0;
  FakeNotification.permission = "granted";
  vi.stubGlobal("Notification", FakeNotification);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reminder notifications", () => {
  it("are off until turned on", async () => {
    expect(reminderNotificationsEnabled()).toBe(false);
    expect(await notifyNewDueReminders([reminder("a")])).toEqual([]);
    expect(shown).toHaveLength(0);
  });

  it("don't announce reminders that were already due when turned on", async () => {
    expect(await enableReminderNotifications([reminder("a")])).toBe(true);
    await notifyNewDueReminders([reminder("a"), reminder("b", "Submit report")]);
    expect(shown.map((n) => n.title)).toEqual(["Submit report"]);
  });

  it("announce each reminder only once", async () => {
    await enableReminderNotifications([]);
    await notifyNewDueReminders([reminder("a")]);
    await notifyNewDueReminders([reminder("a")]);
    expect(shown).toHaveLength(1);
  });

  it("summarise when many fall due at once", async () => {
    await enableReminderNotifications([]);
    await notifyNewDueReminders(["a", "b", "c", "d"].map((id) => reminder(id)));
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("4 reminders are due");
  });

  it("stay off when the browser refuses permission", async () => {
    FakeNotification.permission = "denied";
    expect(await enableReminderNotifications([])).toBe(false);
    expect(reminderNotificationsEnabled()).toBe(false);
  });

  it("can be turned off", async () => {
    await enableReminderNotifications([]);
    disableReminderNotifications();
    await notifyNewDueReminders([reminder("a")]);
    expect(shown).toHaveLength(0);
  });
});

import { Bell, BookOpen, Database, Download, Lock, Palette, User } from "lucide-react";

/**
 * The settings sections, in nav order.
 *
 * `keywords` is what the search box matches on: the words someone would
 * actually type are rarely the words on the label — "dark" is in Appearance,
 * "2fa" is in Security — so each section carries its own vocabulary rather
 * than relying on the heading alone.
 */
export const SECTIONS = [
  { id: "account", label: "Account", icon: User,
    keywords: "name display email address password reset delete close account" },
  { id: "appearance", label: "Appearance", icon: Palette,
    keywords: "theme dark light system colour color accent density compact comfortable spacing" },
  { id: "logbook", label: "Logbook", icon: BookOpen,
    keywords: "default project view timeline list sort order week starts monday sunday time format 12 24 hour" },
  { id: "notifications", label: "Notifications", icon: Bell,
    keywords: "reminders due overdue stalled daily browser desktop permission alerts" },
  { id: "security", label: "Security", icon: Lock,
    keywords: "two factor 2fa authenticator totp google recovery codes verification sign in" },
  { id: "privacy", label: "Data & privacy", icon: Database,
    keywords: "storage local browser server what is stored privacy clear cached offline" },
  { id: "export", label: "Export / import", icon: Download,
    keywords: "export import backup json download upload restore copy" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

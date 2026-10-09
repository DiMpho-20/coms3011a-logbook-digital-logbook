import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Public, so it can be linked from Google's OAuth consent screen. Keep it in
// step with what the app actually stores and sends: the Google Calendar
// section is what Google's reviewers and users read before connecting.

const CONTACT_EMAIL = "khumalowendy126@gmail.com";
const UPDATED = "6 October 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <article className="mx-auto max-w-2xl space-y-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-10">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Digital Logbook
        </Link>

        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
          <p className="text-sm text-slate-500">Last updated {UPDATED}</p>
        </header>

        <p className="text-sm leading-relaxed text-slate-600">
          Digital Logbook is a student project built for COMS3011A at the University of the
          Witwatersrand. It helps students record their projects, the work they do and the time it
          takes. This page explains what it stores, why, and what control you have over it.
        </p>

        <Section title="What we store">
          <ul className="list-disc space-y-1 pl-5">
            <li>Your account: name, email address, and a securely hashed password (never the password itself).</li>
            <li>What you choose to add to your profile, such as a photo, bio, student number or degree.</li>
            <li>Your logbook: projects, the fields you define, entries, tags, reminders, saved filters, dashboard layout and grades you record.</li>
            <li>If you turn on two-factor sign-in or push notifications, the settings needed for them to work.</li>
          </ul>
          <p>
            We use this only to run the logbook for you. We do not sell it, show you advertising, or
            share it with anyone except the services listed below that the app runs on.
          </p>
        </Section>

        <Section title="Google Calendar">
          <p>
            Connecting Google Calendar is optional. If you connect it, the app asks for permission to
            manage calendar events (<code className="text-xs">calendar.events</code>) and uses it only to:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>add an all-day event to your primary calendar for each unfinished logbook entry that has a due date, named after its project and entry;</li>
            <li>update those events when the due date changes, and remove them when the entry is finished, undated or deleted.</li>
          </ul>
          <p>
            The app only reads and changes events it created itself. It does not read, change or delete
            any of your other events, and it does not access any other Google data.
          </p>
          <p>
            The access token Google gives us is stored encrypted. Disconnecting Google Calendar on the
            Calendar page deletes it and revokes the app's access at Google. You can also remove access
            at any time from your Google Account under Security, Third-party apps. Information received
            from Google APIs is used in accordance with the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including its Limited Use requirements.
          </p>
        </Section>

        <Section title="The help assistant">
          <p>
            If you use the in-app help assistant, the messages you type, together with the page you are
            on, are sent to Google's Gemini service to produce a reply. Your logbook entries are not
            sent. Don't type anything into the assistant you would not want processed by that service.
          </p>
        </Section>

        <Section title="Where it is kept">
          <p>
            The app's data is stored in a hosted PostgreSQL database and served by a hosted backend.
            Connections to the app are encrypted (HTTPS). Some data is also kept in your browser so the
            app works offline; you can clear it from Settings, Data &amp; Privacy.
          </p>
        </Section>

        <Section title="Your choices">
          <ul className="list-disc space-y-1 pl-5">
            <li>Export your whole logbook at any time from Settings, Export / Import.</li>
            <li>Disconnect Google Calendar at any time from the Calendar page.</li>
            <li>
              Delete your account from Settings. It is removed 30 days later, together with everything in
              it. Signing in before then lets you cancel the deletion.
            </li>
          </ul>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </article>
    </div>
  );
}

/**
 * The dashboard's daily note: a short, calm line, the same all day and a
 * different one tomorrow. A fixed list in the bundle — no request, no
 * database, no AI, nothing scheduled — chosen from the date alone, so it
 * never reacts to marks or performance.
 *
 * Tone: plain and kind, never cheerleading. No exclamation marks, no emoji.
 */
export const ENCOURAGEMENTS = [
  "Small steps still count.",
  "Keep going. Progress doesn't have to be perfect.",
  "One assessment doesn't define your whole semester.",
  "You don't have to figure everything out today.",
  "Be proud of the effort you're putting in.",
  "Rest is part of the work, not a break from it.",
  "Starting is often the hardest part. You've done it before.",
  "A little every day adds up to a lot.",
  "It's fine to ask for help. That's what it's there for.",
  "Done is a good place to start from.",
  "You're allowed to go at your own pace.",
  "Focus on the next step, not the whole staircase.",
  "Messy notes still count as notes.",
  "Twenty focused minutes is a real session.",
  "You've handled hard weeks before.",
  "Check in with yourself, not just your to-do list.",
  "Good enough today beats perfect someday.",
  "Your worth isn't a mark.",
  "Write down one thing you finished today.",
  "Drink some water. Then carry on.",
  "Questions are a sign you're learning.",
  "Every expert was once where you are.",
  "A short walk can untangle a long problem.",
  "Consistency matters more than intensity.",
  "Try the smallest version of the task first.",
  "You can come back to it with fresh eyes.",
  "It's okay if today is a slower day.",
  "Learning feels uncomfortable because it's working.",
  "Celebrate the work, not just the result.",
  "Mistakes are information, not verdicts.",
  "Break it down until the first step is obvious.",
  "One page is still progress.",
  "Keep your future self in mind. They'll thank you.",
  "You don't need to feel ready to begin.",
  "Effort you can't see yet still counts.",
  "Plan the next hour, not the whole week.",
  "You're building something, one entry at a time.",
  "Notice how far you've come this semester.",
  "It's normal not to understand everything the first time.",
  "Take the break before you need it.",
  "Clear the small things to make space for the big one.",
  "Your pace is still progress.",
  "Some days are for maintenance. That's okay.",
  "Explain it to yourself out loud. It helps.",
  "Sleep is a study tool too.",
  "Be as patient with yourself as you'd be with a friend.",
  "Showing up counts.",
  "A clear desk, a clear next step.",
  "Revisit, don't restart.",
  "The hardest part of a draft is the first sentence.",
  "Progress is rarely a straight line.",
  "Pick one thing. Finish it. Then pick the next.",
  "Keep a note of what worked. It'll work again.",
  "You've learned harder things than this.",
  "It's a semester, not a single day.",
  "Ask early. It saves time later.",
  "A plan you can follow beats a perfect one you can't.",
  "Give yourself credit for the quiet work.",
  "You're more prepared than you feel.",
  "Today's effort is tomorrow's head start.",
  "Slow and steady still gets there.",
  "You don't have to do it all at once.",
  "Make it easier to start than to avoid.",
  "Good questions matter more than quick answers.",
  "Look after yourself. The work will keep.",
  "Every logged hour is proof you showed up.",
  "Leave a note for tomorrow-you before you stop.",
  "You can always improve a draft. You can't improve a blank page.",
  "Steady effort, steady progress.",
  "Whatever today looks like, it's one day.",
] as const;

/** Days since 1 January 1970 for the viewer's local calendar date. */
function localDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** Today's message: the same for the whole local day, the next one tomorrow. */
export function dailyEncouragement(date: Date = new Date()): string {
  return ENCOURAGEMENTS[localDayNumber(date) % ENCOURAGEMENTS.length];
}

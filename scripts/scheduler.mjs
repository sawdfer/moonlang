// Scheduler service (ADR-004): replaces the Vercel crons. Every minute it checks
// the schedules below (UTC) and calls the job routes of the web service over the
// internal Docker network, with `Authorization: Bearer $CRON_SECRET`.
// Plain Node, no dependencies, so it runs from the same image as the web service.

const JOBS = [
  // 06:00 in São Paulo.
  { name: "billing", path: "/api/cron/billing", schedule: "0 9 * * *" },
  { name: "reminders", path: "/api/cron/reminders", schedule: "*/10 * * * *" },
  { name: "maintenance", path: "/api/cron/maintenance", schedule: "5 * * * *" },
];

const TARGET = process.env.SCHEDULER_TARGET_URL ?? "http://web:3000";
const SECRET = process.env.CRON_SECRET;
const TIMEOUT_MS = 5 * 60_000;

/** Does one cron field ("*", "*\/10", "5", "1,15", "1-5") match the value? */
function fieldMatches(field, value) {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    let low;
    let high;
    if (range === "*") {
      low = 0;
      high = Number.MAX_SAFE_INTEGER;
    } else if (range.includes("-")) {
      [low, high] = range.split("-").map(Number);
    } else {
      low = Number(range);
      high = stepText ? Number.MAX_SAFE_INTEGER : low;
    }
    return value >= low && value <= high && (value - low) % step === 0;
  });
}

/** Five-field cron expression, evaluated in UTC. */
export function cronMatches(expression, date) {
  const [minute, hour, day, month, weekday] = expression.trim().split(/\s+/);
  return (
    fieldMatches(minute, date.getUTCMinutes()) &&
    fieldMatches(hour, date.getUTCHours()) &&
    fieldMatches(day, date.getUTCDate()) &&
    fieldMatches(month, date.getUTCMonth() + 1) &&
    fieldMatches(weekday, date.getUTCDay())
  );
}

const running = new Set();

async function run(job) {
  if (running.has(job.name)) {
    console.warn(`[scheduler] ${job.name} is still running; skipped this turn.`);
    return;
  }
  running.add(job.name);
  const started = Date.now();
  try {
    const response = await fetch(new URL(job.path, TARGET), {
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    const level = response.ok ? "info" : "error";
    console[level](`[scheduler] ${job.name} ${response.status} in ${Date.now() - started}ms ${body.slice(0, 500)}`);
  } catch (error) {
    console.error(`[scheduler] ${job.name} failed:`, error instanceof Error ? error.message : error);
  } finally {
    running.delete(job.name);
  }
}

function tick() {
  const now = new Date();
  for (const job of JOBS) {
    if (cronMatches(job.schedule, now)) void run(job);
  }
}

function scheduleNextTick() {
  // Align to the start of the next minute so each schedule fires once.
  const delay = 60_000 - (Date.now() % 60_000) + 500;
  setTimeout(() => {
    tick();
    scheduleNextTick();
  }, delay);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (!SECRET || SECRET.length < 32) {
    console.error("[scheduler] CRON_SECRET must be set (at least 32 characters).");
    process.exit(1);
  }
  console.info(`[scheduler] started; target ${TARGET}; jobs: ${JOBS.map((j) => `${j.name} (${j.schedule})`).join(", ")}`);
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => process.exit(0));
  scheduleNextTick();
}

import { requireUser } from "@/server/auth/session";

// Placeholder for the student area (F-004, F-006).
export default async function StudentHomePage() {
  const user = await requireUser(["student", "trial"]);
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Hi, {user.name}! 👋</h1>
    </main>
  );
}

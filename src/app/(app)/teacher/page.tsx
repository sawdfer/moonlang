import { requireStaff } from "@/server/auth/session";

// Placeholder for the teacher dashboard (F-009).
export default async function TeacherHomePage() {
  const user = await requireStaff();
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Olá, {user.name} 🌙</h1>
    </main>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Termos e privacidade" };

// TODO(F-001): final text of the recording term and privacy policy (RN-023), versioned.
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-3xl font-semibold">Termos e privacidade</h1>
      <p className="mt-4 text-muted-foreground">
        As aulas podem ser gravadas e ficam disponíveis por 6 meses só para quem participou.
      </p>
    </main>
  );
}

"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { homePathFor } from "@/server/auth/roles";
import { requireSignedIn } from "@/server/auth/session";
import { recordConsent } from "@/server/people/store";
import { TERMS_VERSION } from "@/server/people/terms";

export type ConsentState = { error?: string };

/** RN-023: stores the acceptance of the current terms version. */
export async function acceptTermsAction(_prev: ConsentState, formData: FormData): Promise<ConsentState> {
  const user = await requireSignedIn();
  if (formData.get("acceptTerms") !== "on") return { error: "termsRequired" };
  await recordConsent(db, user.id, TERMS_VERSION, new Date());
  redirect(homePathFor(user.role));
}

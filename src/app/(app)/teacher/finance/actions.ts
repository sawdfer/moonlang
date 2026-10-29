"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toDateString } from "@/lib/dates";
import { requireStaff } from "@/server/auth/session";
import {
  BillingError,
  markChargePaid,
  registerDropout,
  startPlan,
  undoChargePayment,
} from "@/server/billing";
import { parseReaisToCents } from "@/server/billing/form";

export type ActionResult = { ok: true } | { ok: false; error: BillingError["code"] | "unknown" } | null;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function run(work: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await work();
  } catch (error) {
    if (error instanceof BillingError) return { ok: false, error: error.code };
    console.error(error);
    return { ok: false, error: "unknown" };
  }
  revalidatePath("/teacher/finance");
  revalidatePath("/student/finance");
  return { ok: true };
}

export async function markPaidAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  const receivedCents = parseReaisToCents(String(form.get("received") ?? ""));
  const paidOn = day.safeParse(form.get("paidOn"));
  if (receivedCents === null || !paidOn.success || paidOn.data > toDateString(new Date())) {
    return { ok: false, error: "invalid_amount" };
  }
  return run(() =>
    markChargePaid(actor, {
      chargeId: String(form.get("chargeId")),
      receivedCents,
      paidOn: paidOn.data,
      note: String(form.get("note") ?? "").slice(0, 500),
    }),
  );
}

export async function undoPaymentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => undoChargePayment(actor, { chargeId: String(form.get("chargeId")) }));
}

export async function startPlanAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  const startDate = day.safeParse(form.get("startDate"));
  const dueDay = Number(form.get("dueDay"));
  if (!startDate.success || !Number.isInteger(dueDay)) return { ok: false, error: "invalid_due_day" };
  return run(() =>
    startPlan(actor, {
      enrollmentId: String(form.get("enrollmentId")),
      dueDay,
      startDate: startDate.data,
      existingStudent: form.get("existingStudent") === "on",
    }),
  );
}

export async function dropoutAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() =>
    registerDropout(actor, {
      enrollmentId: String(form.get("enrollmentId")),
      reason: String(form.get("reason") ?? "").slice(0, 500),
    }),
  );
}

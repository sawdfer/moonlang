"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toDateString } from "@/lib/dates";
import { requireStaff } from "@/server/auth/session";
import {
  addCharge,
  BillingError,
  cancelCharge,
  editCharge,
  manualUnblock,
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

const reasonOf = (form: FormData) => String(form.get("reason") ?? "").slice(0, 500);

/** Staff unblock despite overdue charges, with a required reason (RN-012, RN-015, V7). */
export async function unblockAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => manualUnblock(actor, { enrollmentId: String(form.get("enrollmentId")), reason: reasonOf(form) }));
}

// Charge management below is admin/root only; the billing service enforces it (V7).

export async function cancelChargeAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  return run(() => cancelCharge(actor, { chargeId: String(form.get("chargeId")), reason: reasonOf(form) }));
}

export async function editChargeAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  const amountCents = parseReaisToCents(String(form.get("amount") ?? ""));
  const dueDate = day.safeParse(form.get("dueDate"));
  if (amountCents === null) return { ok: false, error: "invalid_amount" };
  if (!dueDate.success) return { ok: false, error: "invalid_date" };
  return run(() =>
    editCharge(actor, { chargeId: String(form.get("chargeId")), amountCents, dueDate: dueDate.data, reason: reasonOf(form) }),
  );
}

export async function addChargeAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  const amountCents = parseReaisToCents(String(form.get("amount") ?? ""));
  const dueDate = day.safeParse(form.get("dueDate"));
  const optionalDay = (name: string) => {
    const value = String(form.get(name) ?? "");
    return value ? value : undefined;
  };
  if (amountCents === null) return { ok: false, error: "invalid_amount" };
  if (!dueDate.success) return { ok: false, error: "invalid_date" };
  return run(() =>
    addCharge(actor, {
      enrollmentId: String(form.get("enrollmentId")),
      kind: form.get("kind") === "monthly" ? "monthly" : "extra_lesson",
      amountCents,
      dueDate: dueDate.data,
      periodStart: optionalDay("periodStart"),
      periodEnd: optionalDay("periodEnd"),
      reason: reasonOf(form),
    }),
  );
}

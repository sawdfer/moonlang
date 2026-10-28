"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireStaff } from "@/server/auth/session";
import { setWhatsAppStatus } from "@/server/notifications/queries";

const messageId = z.string().min(1).max(64);

async function update(id: string, status: "sent" | "discarded") {
  const staff = await requireStaff();
  await setWhatsAppStatus(db, { id: messageId.parse(id), status, staffId: staff.id, now: new Date() });
  revalidatePath("/teacher/whatsapp");
}

export async function markWhatsAppSent(id: string) {
  await update(id, "sent");
}

export async function discardWhatsApp(id: string) {
  await update(id, "discarded");
}

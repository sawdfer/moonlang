"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/server/auth/session";
import { type AnnouncementAudience, sendAnnouncement } from "@/server/notifications";
import { AnnouncementError } from "@/server/notifications/service";

export type AnnouncementFormState =
  | { status: "idle" }
  | { status: "sent"; recipients: number; whatsapp: number }
  | { status: "error"; code: AnnouncementError["code"] };

const ids = z.array(z.string().min(1).max(64)).max(500);

function readAudience(form: FormData): AnnouncementAudience {
  switch (form.get("audience")) {
    case "classGroups":
      return { classGroupIds: ids.parse(form.getAll("classGroupIds")) };
    case "students":
      return { userIds: ids.parse(form.getAll("userIds")) };
    default:
      return {
        all: true,
        includeFormer: form.get("includeFormer") === "on",
        includeTrials: form.get("includeTrials") === "on",
      };
  }
}

export async function sendAnnouncementAction(
  _previous: AnnouncementFormState,
  form: FormData,
): Promise<AnnouncementFormState> {
  const staff = await requireStaff();
  try {
    const result = await sendAnnouncement({
      authorId: staff.id,
      authorName: staff.name,
      body: String(form.get("body") ?? ""),
      audience: readAudience(form),
    });
    revalidatePath("/teacher/announcements");
    revalidatePath("/teacher/whatsapp");
    return { status: "sent", recipients: result.recipients, whatsapp: result.whatsapp };
  } catch (error) {
    if (error instanceof AnnouncementError) return { status: "error", code: error.code };
    throw error;
  }
}

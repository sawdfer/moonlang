// RN-024: meeting links only live on the lesson page inside the platform.
// Nothing the notifications domain stores or sends may contain one.

/** Hosts of the meeting tools the teacher may use (Google Meet, Zoom) and their short links. */
const MEETING_HOST_PATTERN =
  /(?:^|[^a-z0-9.-])(?:[a-z0-9-]+\.)*(?:meet\.google\.com|g\.co\/meet|zoom\.us|zoom\.com|zoomgov\.com|zoom\.link)\b/i;

/** True when the text contains a Google Meet or Zoom address, with or without "https://". */
export function containsMeetingLink(text: string): boolean {
  return MEETING_HOST_PATTERN.test(text);
}

/** Links in notifications must be paths inside the platform, e.g. "/student/lessons/123". */
export function isPlatformPath(link: string): boolean {
  return link.startsWith("/") && !link.startsWith("//") && !link.includes("\\");
}

export class UnsafeNotificationError extends Error {
  constructor(reason: string) {
    super(`Notification rejected (RN-024): ${reason}`);
    this.name = "UnsafeNotificationError";
  }
}

/** Throws when any text contains a meeting link or the link leaves the platform. */
export function assertSafeContent(input: { texts: string[]; link?: string | null }): void {
  for (const text of input.texts) {
    if (containsMeetingLink(text)) throw new UnsafeNotificationError("meeting link in text");
  }
  if (input.link != null) {
    if (!isPlatformPath(input.link)) throw new UnsafeNotificationError("link outside the platform");
    if (containsMeetingLink(input.link)) throw new UnsafeNotificationError("meeting link");
  }
}

import { redirect } from "next/navigation";

// The student area starts at the lessons page (links in reminders point there too).
export default function StudentHomePage() {
  redirect("/student/lessons");
}

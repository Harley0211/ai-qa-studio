import { useToast } from "../../components/ui/Toast.jsx";

// What happened to the emails a change sent, in one short sentence.
export function emailOutcome(emails = []) {
  if (!emails.length) return { note: "", problem: null };
  const sent = emails.filter((e) => e.status === "SENT");
  const failed = emails.filter((e) => e.status === "FAILED");
  const skipped = emails.filter((e) => e.status === "SKIPPED");

  if (failed.length) {
    const who = [...new Set(failed.map((e) => e.to))].join(", ");
    return {
      note: sent.length ? `${sent.length} email${sent.length === 1 ? "" : "s"} sent.` : "",
      problem: `The email to ${who} couldn't be sent (${failed[0].error || "unknown error"}). Retry it from Admin → Emails.`,
    };
  }
  if (skipped.length) {
    return { note: "No email was sent: email isn't set up yet (see Admin → Emails).", problem: null };
  }
  const recipients = [...new Set(sent.map((e) => e.to))];
  return {
    note:
      sent.length === 1 ? `Email sent to ${sent[0].to}.` : `${sent.length} emails sent to ${recipients.join(", ")}.`,
    problem: null,
  };
}

// toast.success with the email result added; a failure gets its own error toast.
export function useEmailToast() {
  const toast = useToast();
  return (message, emails) => {
    const { note, problem } = emailOutcome(emails);
    toast.success(note ? `${message} ${note}` : message);
    if (problem) toast.error(problem);
  };
}

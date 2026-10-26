import { Action, ActionPanel, Detail, LaunchProps } from "@raycast/api";
import { useEffect, useState } from "react";

const API = "https://nimble-answers.trommatic.workers.dev/";

type Reply = { answer: string; source?: string; refs?: { title: string; url: string }[]; resting?: boolean };

export default function Command(props: LaunchProps<{ arguments: { question: string } }>) {
  const q = props.arguments.question;
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) })
      .then((r) => (r.ok ? (r.json() as Promise<Reply>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setReply)
      .catch((e: Error) => setError(e.message));
  }, [q]);

  const answer = reply?.answer === "UNKNOWN" ? "No model knew that one." : reply?.answer;
  const markdown = error
    ? `Could not reach Nimble: ${error}`
    : reply?.resting
      ? "The free AI is out of answers for the day. Try again after 17:00 Pacific."
      : reply
        ? `# ${q}\n\n${answer}`
        : "Asking...";

  return (
    <Detail
      isLoading={!reply && !error}
      markdown={markdown}
      actions={
        <ActionPanel>
          {answer && <Action.CopyToClipboard title="Copy Answer" content={answer} />}
          {reply?.refs?.map((r) => <Action.OpenInBrowser key={r.url} title={`Open ${r.title}`} url={r.url} />)}
        </ActionPanel>
      }
    />
  );
}

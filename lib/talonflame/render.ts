import type {
  PinnedTalonflameRequest,
  ResolvedTalonflameIdentity,
} from "./contracts";

export interface PlainTextEmail {
  from: string;
  to: string;
  subject: string;
  body: string;
  contentType: "text/plain; charset=utf-8";
}

export function renderPlainTextEmail(input: {
  request: PinnedTalonflameRequest;
  sender: ResolvedTalonflameIdentity;
  recipient: ResolvedTalonflameIdentity;
}): PlainTextEmail {
  return {
    from: input.sender.email,
    to: input.recipient.email,
    subject: normalizePlainText(input.request.subject),
    body: normalizePlainText(input.request.body),
    contentType: "text/plain; charset=utf-8",
  };
}

function normalizePlainText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

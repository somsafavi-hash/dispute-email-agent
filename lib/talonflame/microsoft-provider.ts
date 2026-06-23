import type { PinnedTalonflameRequest, ResolvedTalonflameIdentity } from "./contracts";
import type { PlainTextEmail } from "./render";

export interface MicrosoftEmailDeliveryActivity {
  specialist: "chatot";
  action: "manage-communication-activity";
  channel: "email";
  provider: "microsoft";
  idempotencyKey: string;
  requestId: string;
  message: {
    from: string;
    to: string;
    subject: string;
    body: string;
    contentType: PlainTextEmail["contentType"];
  };
  identities: {
    sender: ResolvedTalonflameIdentity;
    recipient: ResolvedTalonflameIdentity;
    approver: ResolvedTalonflameIdentity;
  };
}

export interface MicrosoftCommunicationProvider {
  send(activity: MicrosoftEmailDeliveryActivity): Promise<{ providerMessageId?: string }>;
}

export function buildMicrosoftDeliveryActivity(input: {
  request: PinnedTalonflameRequest;
  renderedEmail: PlainTextEmail;
  sender: ResolvedTalonflameIdentity;
  recipient: ResolvedTalonflameIdentity;
  approver: ResolvedTalonflameIdentity;
}): MicrosoftEmailDeliveryActivity {
  return {
    specialist: "chatot",
    action: "manage-communication-activity",
    channel: "email",
    provider: "microsoft",
    idempotencyKey: input.request.requestId,
    requestId: input.request.requestId,
    message: {
      from: input.renderedEmail.from,
      to: input.renderedEmail.to,
      subject: input.renderedEmail.subject,
      body: input.renderedEmail.body,
      contentType: input.renderedEmail.contentType,
    },
    identities: {
      sender: input.sender,
      recipient: input.recipient,
      approver: input.approver,
    },
  };
}

export class HttpMicrosoftCommunicationProvider implements MicrosoftCommunicationProvider {
  constructor(
    private readonly endpoint: string,
    private readonly bearerToken?: string,
  ) {}

  async send(activity: MicrosoftEmailDeliveryActivity): Promise<{ providerMessageId?: string }> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": activity.idempotencyKey,
        ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}),
      },
      body: JSON.stringify(activity),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`chatot Microsoft delivery failed (${response.status}): ${body}`);
    }

    const data = (await response.json().catch(() => ({}))) as {
      providerMessageId?: string;
      messageId?: string;
    };

    return { providerMessageId: data.providerMessageId ?? data.messageId };
  }
}

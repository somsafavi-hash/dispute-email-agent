import type { PinnedTalonflameRequest, ResolvedTalonflameIdentity } from "./contracts";

export interface TalonflameRuntimeAssembly {
  stateMachineArn: string;
  asanaProjectGid: string;
  chatotManageCommunicationActivityUrl?: string;
  chatotConnectionArn?: string;
  meowthAsanaApprovalLambdaArn?: string;
}

export interface CommunicationRuntimeAssembler {
  assemble(input: {
    request: PinnedTalonflameRequest;
    sender: ResolvedTalonflameIdentity;
    recipient: ResolvedTalonflameIdentity;
    approver: ResolvedTalonflameIdentity;
  }): Promise<TalonflameRuntimeAssembly>;
}

export class StaticCommunicationRuntimeAssembler implements CommunicationRuntimeAssembler {
  constructor(private readonly assembly: TalonflameRuntimeAssembly) {}

  async assemble(): Promise<TalonflameRuntimeAssembly> {
    return this.assembly;
  }
}

export class HttpCommunicationRuntimeAssembler implements CommunicationRuntimeAssembler {
  constructor(
    private readonly endpoint: string,
    private readonly bearerToken?: string,
  ) {}

  async assemble(input: {
    request: PinnedTalonflameRequest;
    sender: ResolvedTalonflameIdentity;
    recipient: ResolvedTalonflameIdentity;
    approver: ResolvedTalonflameIdentity;
  }): Promise<TalonflameRuntimeAssembly> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}),
      },
      body: JSON.stringify({
        specialist: "oranguru",
        action: "assemble-communication-runtime",
        workflow: "talonflame-email-approval-send",
        requestId: input.request.requestId,
        channel: "email",
        provider: "microsoft",
        approvalProvider: "asana",
        identities: {
          sender: input.sender,
          recipient: input.recipient,
          approver: input.approver,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`oranguru runtime assembly failed (${response.status}): ${body}`);
    }

    return (await response.json()) as TalonflameRuntimeAssembly;
  }
}

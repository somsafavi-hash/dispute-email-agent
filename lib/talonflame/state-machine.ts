import type {
  PinnedTalonflameRequest,
  ResolvedTalonflameIdentity,
} from "./contracts";
import type { MicrosoftEmailDeliveryActivity } from "./microsoft-provider";
import type { PlainTextEmail } from "./render";
import type { TalonflameRuntimeAssembly } from "./runtime";

export interface TalonflameStateMachineInput {
  workflow: "talonflame-email-approval-send";
  request: PinnedTalonflameRequest;
  renderedEmail: PlainTextEmail;
  approval: {
    provider: "asana";
    projectGid: string;
    approver: ResolvedTalonflameIdentity;
  };
  delivery: MicrosoftEmailDeliveryActivity;
  runtime: TalonflameRuntimeAssembly;
}

export function buildStateMachineInput(input: {
  request: PinnedTalonflameRequest;
  sender: ResolvedTalonflameIdentity;
  recipient: ResolvedTalonflameIdentity;
  approver: ResolvedTalonflameIdentity;
  renderedEmail: PlainTextEmail;
  delivery: MicrosoftEmailDeliveryActivity;
  runtime: TalonflameRuntimeAssembly;
}): TalonflameStateMachineInput {
  return {
    workflow: "talonflame-email-approval-send",
    request: input.request,
    renderedEmail: input.renderedEmail,
    approval: {
      provider: "asana",
      projectGid: input.runtime.asanaProjectGid,
      approver: input.approver,
    },
    delivery: input.delivery,
    runtime: input.runtime,
  };
}

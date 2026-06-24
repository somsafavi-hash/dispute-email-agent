import {
  executionNameForRequestId,
  pinTalonflameRequestContract,
  type PinnedTalonflameRequest,
  type ResolvedTalonflameIdentity,
} from "./contracts";
import type { AsanaDirectory } from "./asana";
import { buildMicrosoftDeliveryActivity } from "./microsoft-provider";
import { renderPlainTextEmail, type PlainTextEmail } from "./render";
import type { CommunicationRuntimeAssembler, TalonflameRuntimeAssembly } from "./runtime";
import { buildStateMachineInput, type TalonflameStateMachineInput } from "./state-machine";
import type { StartApprovalExecutionResult, StepFunctionsGateway } from "./step-functions";

export interface TalonflameStartOptions {
  executionNamePrefix?: string;
}

export interface TalonflameStartDependencies {
  asana: AsanaDirectory;
  runtimeAssembler: CommunicationRuntimeAssembler;
  stepFunctions: StepFunctionsGateway;
}

export interface TalonflameStartResult {
  request: PinnedTalonflameRequest;
  sender: ResolvedTalonflameIdentity;
  recipient: ResolvedTalonflameIdentity;
  approver: ResolvedTalonflameIdentity;
  renderedEmail: PlainTextEmail;
  runtime: TalonflameRuntimeAssembly;
  executionName: string;
  execution: StartApprovalExecutionResult;
  stateMachineInput: TalonflameStateMachineInput;
}

export async function startTalonflameRequest(
  input: unknown,
  deps: TalonflameStartDependencies,
  options: TalonflameStartOptions = {},
): Promise<TalonflameStartResult> {
  const request = pinTalonflameRequestContract(input);
  const sender = await deps.asana.resolveIdentity(request.sender);
  const recipient = await deps.asana.resolveIdentity(request.recipient);
  const approver = await deps.asana.resolveIdentity(request.approver);
  const runtime = await deps.runtimeAssembler.assemble({ request, sender, recipient, approver });

  await deps.asana.assertProjectAccess(approver, runtime.asanaProjectGid);

  const renderedEmail = renderPlainTextEmail({ request, sender, recipient });
  const delivery = buildMicrosoftDeliveryActivity({
    request,
    renderedEmail,
    sender,
    recipient,
    approver,
  });
  const stateMachineInput = buildStateMachineInput({
    request,
    sender,
    recipient,
    approver,
    renderedEmail,
    delivery,
    runtime,
  });
  const executionName = executionNameForRequestId(request.requestId, options.executionNamePrefix);
  const execution = await deps.stepFunctions.startApprovalExecution({
    stateMachineArn: runtime.stateMachineArn,
    name: executionName,
    payload: stateMachineInput,
  });

  return {
    request,
    sender,
    recipient,
    approver,
    renderedEmail,
    runtime,
    executionName,
    execution,
    stateMachineInput,
  };
}

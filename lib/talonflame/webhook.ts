import { normalizeEmail, TalonflameError } from "./contracts";
import type { AsanaDirectory, AsanaUser } from "./asana";
import { isTaskTokenReplayError, type StepFunctionsGateway } from "./step-functions";

export interface PendingApproval {
  requestId: string;
  taskGid: string;
  taskToken: string;
  approver: {
    asanaGid?: string;
    email?: string;
  };
}

export interface ApprovalTokenStore {
  getPendingApproval(taskGid: string): Promise<PendingApproval | undefined>;
}

export interface AsanaWebhookPayload {
  events?: AsanaWebhookEvent[];
}

export interface AsanaWebhookEvent {
  action?: string;
  type?: string;
  resource?: {
    gid?: string;
    resource_type?: string;
  };
  user?: AsanaUser;
  created_at?: string;
}

export interface AsanaWebhookEventResult {
  taskGid?: string;
  requestId?: string;
  status: "approved" | "rejected_non_approver" | "ignored" | "replay_ignored";
  reason?: string;
}

export class HttpApprovalTokenStore implements ApprovalTokenStore {
  constructor(
    private readonly lookupEndpoint: string,
    private readonly bearerToken?: string,
  ) {}

  async getPendingApproval(taskGid: string): Promise<PendingApproval | undefined> {
    const url = new URL(this.lookupEndpoint);
    url.searchParams.set("taskGid", taskGid);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}),
      },
    });

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new TalonflameError(
        "approval_lookup_failed",
        `Approval token lookup failed (${response.status})`,
        response.status,
        { body },
      );
    }

    return (await response.json()) as PendingApproval;
  }
}

export async function handleAsanaWebhookPayload(
  payload: AsanaWebhookPayload,
  deps: {
    asana: AsanaDirectory;
    tokenStore: ApprovalTokenStore;
    stepFunctions: StepFunctionsGateway;
  },
): Promise<AsanaWebhookEventResult[]> {
  const events = payload.events ?? [];
  const results: AsanaWebhookEventResult[] = [];

  for (const event of events) {
    results.push(await handleAsanaWebhookEvent(event, deps));
  }

  return results;
}

async function handleAsanaWebhookEvent(
  event: AsanaWebhookEvent,
  deps: {
    asana: AsanaDirectory;
    tokenStore: ApprovalTokenStore;
    stepFunctions: StepFunctionsGateway;
  },
): Promise<AsanaWebhookEventResult> {
  const taskGid = event.resource?.gid;
  if (!taskGid || event.resource?.resource_type !== "task" || !isPotentialCompletionEvent(event)) {
    return { taskGid, status: "ignored", reason: "not_a_task_completion_event" };
  }

  const approval = await deps.tokenStore.getPendingApproval(taskGid);
  if (!approval) {
    return { taskGid, status: "ignored", reason: "no_pending_approval" };
  }

  const task = await deps.asana.getTask(taskGid);
  if (!task.completed) {
    return {
      taskGid,
      requestId: approval.requestId,
      status: "ignored",
      reason: "task_not_completed",
    };
  }

  const actor = task.completed_by ?? event.user;
  if (!isApprover(actor, approval.approver)) {
    return sendFailureOnce(deps.stepFunctions, approval, "NonApproverCompletion", {
      taskGid,
      requestId: approval.requestId,
      actor,
      expectedApprover: approval.approver,
    });
  }

  try {
    await deps.stepFunctions.sendTaskSuccess(approval.taskToken, {
      approved: true,
      requestId: approval.requestId,
      taskGid,
      approvedBy: {
        asanaGid: actor?.gid,
        email: actor?.email ? normalizeEmail(actor.email) : undefined,
        name: actor?.name,
      },
      approvedAt: new Date().toISOString(),
    });

    return { taskGid, requestId: approval.requestId, status: "approved" };
  } catch (error) {
    if (isTaskTokenReplayError(error)) {
      return { taskGid, requestId: approval.requestId, status: "replay_ignored" };
    }
    throw error;
  }
}

function isPotentialCompletionEvent(event: AsanaWebhookEvent): boolean {
  return event.action === "changed" || event.action === "completed";
}

function isApprover(actor: AsanaUser | null | undefined, approver: PendingApproval["approver"]): boolean {
  if (!actor) {
    return false;
  }

  if (approver.asanaGid && actor.gid === approver.asanaGid) {
    return true;
  }

  if (approver.email && actor.email) {
    return normalizeEmail(actor.email) === normalizeEmail(approver.email);
  }

  return false;
}

async function sendFailureOnce(
  stepFunctions: StepFunctionsGateway,
  approval: PendingApproval,
  error: string,
  cause: unknown,
): Promise<AsanaWebhookEventResult> {
  try {
    await stepFunctions.sendTaskFailure(approval.taskToken, error, JSON.stringify(cause));
    return {
      taskGid: approval.taskGid,
      requestId: approval.requestId,
      status: "rejected_non_approver",
    };
  } catch (sendError) {
    if (isTaskTokenReplayError(sendError)) {
      return {
        taskGid: approval.taskGid,
        requestId: approval.requestId,
        status: "replay_ignored",
      };
    }
    throw sendError;
  }
}

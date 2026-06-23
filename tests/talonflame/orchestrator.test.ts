import { describe, expect, it } from "vitest";

import type { AsanaDirectory, AsanaTask } from "../../lib/talonflame/asana";
import {
  pinTalonflameRequestContract,
  type ParsedTalonflameIdentity,
  type ResolvedTalonflameIdentity,
} from "../../lib/talonflame/contracts";
import { startTalonflameRequest } from "../../lib/talonflame/orchestrator";
import type { CommunicationRuntimeAssembler } from "../../lib/talonflame/runtime";
import type {
  StartApprovalExecutionInput,
  StartApprovalExecutionResult,
  StepFunctionsGateway,
} from "../../lib/talonflame/step-functions";
import {
  handleAsanaWebhookPayload,
  type ApprovalTokenStore,
  type PendingApproval,
} from "../../lib/talonflame/webhook";

describe("Talonflame request contract", () => {
  it("requires the pinned runtime contract", () => {
    expect(() => pinTalonflameRequestContract({})).toThrow(/requestId is required/);
  });

  it("treats identity strings without @ as Asana gids", () => {
    const request = pinTalonflameRequestContract({
      requestId: "req-1",
      sender: "saman.safavi@elephant-labs.xyz",
      recipient: "gthomas@springoakscapital.com",
      approver: "120000000000001",
      subject: "Subject",
      body: "Body",
    });

    expect(request.approver).toMatchObject({ role: "approver", asanaGid: "120000000000001" });
  });
});

describe("startTalonflameRequest", () => {
  it("resolves identities, validates approver access, renders plain text, and starts one execution", async () => {
    const asana = new FakeAsanaDirectory({
      projectUsers: [
        { role: "approver", asanaGid: "120000000000001", email: "saman.safavi@elephant-labs.xyz" },
      ],
    });
    const stepFunctions = new FakeStepFunctionsGateway();

    const result = await startTalonflameRequest(
      {
        requestId: "Bush/email/001",
        sender: "saman.safavi@elephant-labs.xyz",
        recipient: "gthomas@springoakscapital.com",
        approver: "120000000000001",
        subject: " Document request ",
        body: "Line one\r\nLine two",
      },
      {
        asana,
        runtimeAssembler: new FakeRuntimeAssembler(),
        stepFunctions,
      },
    );

    expect(result.execution.status).toBe("started");
    expect(result.executionName).toMatch(/^talonflame-Bush-email-001-/);
    expect(result.renderedEmail).toMatchObject({
      from: "saman.safavi@elephant-labs.xyz",
      to: "gthomas@springoakscapital.com",
      subject: "Document request",
      body: "Line one\nLine two",
      contentType: "text/plain; charset=utf-8",
    });
    expect(result.stateMachineInput.delivery).toMatchObject({
      provider: "microsoft",
      specialist: "chatot",
      idempotencyKey: "Bush/email/001",
    });
    expect(stepFunctions.started).toHaveLength(1);
    expect(stepFunctions.successes).toHaveLength(0);
    expect(stepFunctions.failures).toHaveLength(0);
  });

  it("returns an idempotent already_started result for the same requestId", async () => {
    const stepFunctions = new FakeStepFunctionsGateway();
    const deps = {
      asana: new FakeAsanaDirectory({
        projectUsers: [
          { role: "approver", asanaGid: "120000000000001", email: "saman.safavi@elephant-labs.xyz" },
        ],
      }),
      runtimeAssembler: new FakeRuntimeAssembler(),
      stepFunctions,
    };
    const input = {
      requestId: "same-request",
      sender: "saman.safavi@elephant-labs.xyz",
      recipient: "gthomas@springoakscapital.com",
      approver: "120000000000001",
      subject: "Subject",
      body: "Body",
    };

    const first = await startTalonflameRequest(input, deps);
    const second = await startTalonflameRequest(input, deps);

    expect(first.execution.status).toBe("started");
    expect(second.execution.status).toBe("already_started");
    expect(second.executionName).toBe(first.executionName);
  });
});

describe("handleAsanaWebhookPayload", () => {
  it("approves the Step Functions task token only for the configured approver", async () => {
    const stepFunctions = new FakeStepFunctionsGateway();
    const approval = pendingApproval();

    const results = await handleAsanaWebhookPayload(
      { events: [asanaChangedEvent(approval.taskGid, "120000000000001")] },
      {
        asana: new FakeAsanaDirectory({
          task: {
            gid: approval.taskGid,
            completed: true,
            completed_by: {
              gid: "120000000000001",
              email: "saman.safavi@elephant-labs.xyz",
            },
          },
        }),
        tokenStore: new FakeApprovalTokenStore(approval),
        stepFunctions,
      },
    );

    expect(results).toEqual([
      { taskGid: approval.taskGid, requestId: approval.requestId, status: "approved" },
    ]);
    expect(stepFunctions.successes).toHaveLength(1);
    expect(stepFunctions.failures).toHaveLength(0);
  });

  it("rejects task completion by a non-approver", async () => {
    const stepFunctions = new FakeStepFunctionsGateway();
    const approval = pendingApproval();

    const results = await handleAsanaWebhookPayload(
      { events: [asanaChangedEvent(approval.taskGid, "999")] },
      {
        asana: new FakeAsanaDirectory({
          task: {
            gid: approval.taskGid,
            completed: true,
            completed_by: {
              gid: "999",
              email: "other@example.com",
            },
          },
        }),
        tokenStore: new FakeApprovalTokenStore(approval),
        stepFunctions,
      },
    );

    expect(results).toEqual([
      {
        taskGid: approval.taskGid,
        requestId: approval.requestId,
        status: "rejected_non_approver",
      },
    ]);
    expect(stepFunctions.successes).toHaveLength(0);
    expect(stepFunctions.failures).toEqual([
      expect.objectContaining({ error: "NonApproverCompletion" }),
    ]);
  });

  it("treats duplicate webhook callbacks as replays", async () => {
    const stepFunctions = new FakeStepFunctionsGateway({ successErrorName: "InvalidToken" });
    const approval = pendingApproval();

    const results = await handleAsanaWebhookPayload(
      { events: [asanaChangedEvent(approval.taskGid, "120000000000001")] },
      {
        asana: new FakeAsanaDirectory({
          task: {
            gid: approval.taskGid,
            completed: true,
            completed_by: {
              gid: "120000000000001",
              email: "saman.safavi@elephant-labs.xyz",
            },
          },
        }),
        tokenStore: new FakeApprovalTokenStore(approval),
        stepFunctions,
      },
    );

    expect(results).toEqual([
      { taskGid: approval.taskGid, requestId: approval.requestId, status: "replay_ignored" },
    ]);
  });
});

class FakeAsanaDirectory implements AsanaDirectory {
  constructor(
    private readonly options: {
      projectUsers?: ResolvedTalonflameIdentity[];
      task?: AsanaTask;
    },
  ) {}

  async resolveIdentity(identity: ParsedTalonflameIdentity): Promise<ResolvedTalonflameIdentity> {
    if (identity.asanaGid === "120000000000001") {
      return {
        ...identity,
        email: "saman.safavi@elephant-labs.xyz",
        name: "Saman Safavi",
      };
    }

    if (!identity.email) {
      throw new Error(`No fake identity for ${identity.asanaGid}`);
    }

    return identity;
  }

  async assertProjectAccess(identity: ResolvedTalonflameIdentity): Promise<void> {
    const hasAccess = this.options.projectUsers?.some(
      (user) => user.asanaGid === identity.asanaGid || user.email === identity.email,
    );

    if (!hasAccess) {
      throw new Error("missing fake project access");
    }
  }

  async getTask(taskGid: string): Promise<AsanaTask> {
    if (!this.options.task || this.options.task.gid !== taskGid) {
      throw new Error(`No fake task for ${taskGid}`);
    }
    return this.options.task;
  }
}

class FakeRuntimeAssembler implements CommunicationRuntimeAssembler {
  async assemble() {
    return {
      stateMachineArn: "arn:aws:states:us-east-1:123456789012:stateMachine:talonflame",
      asanaProjectGid: "bush-project-gid",
      chatotManageCommunicationActivityUrl: "https://chatot.example.test/activity",
      chatotConnectionArn: "arn:aws:events:us-east-1:123456789012:connection/chatot/abc",
      meowthAsanaApprovalLambdaArn:
        "arn:aws:lambda:us-east-1:123456789012:function:meowth-asana-approval",
    };
  }
}

class FakeStepFunctionsGateway implements StepFunctionsGateway {
  readonly started: StartApprovalExecutionInput[] = [];
  readonly successes: Array<{ taskToken: string; output: unknown }> = [];
  readonly failures: Array<{ taskToken: string; error: string; cause: string }> = [];

  constructor(private readonly options: { successErrorName?: string } = {}) {}

  async startApprovalExecution(
    input: StartApprovalExecutionInput,
  ): Promise<StartApprovalExecutionResult> {
    const duplicate = this.started.some((started) => started.name === input.name);
    this.started.push(input);

    return duplicate
      ? { status: "already_started" }
      : { status: "started", executionArn: `${input.stateMachineArn}:${input.name}` };
  }

  async sendTaskSuccess(taskToken: string, output: unknown): Promise<void> {
    if (this.options.successErrorName) {
      const error = new Error(this.options.successErrorName);
      error.name = this.options.successErrorName;
      throw error;
    }

    this.successes.push({ taskToken, output });
  }

  async sendTaskFailure(taskToken: string, error: string, cause: string): Promise<void> {
    this.failures.push({ taskToken, error, cause });
  }
}

class FakeApprovalTokenStore implements ApprovalTokenStore {
  constructor(private readonly approval: PendingApproval) {}

  async getPendingApproval(taskGid: string): Promise<PendingApproval | undefined> {
    return taskGid === this.approval.taskGid ? this.approval : undefined;
  }
}

function pendingApproval(): PendingApproval {
  return {
    requestId: "req-approval-1",
    taskGid: "task-1",
    taskToken: "step-functions-token",
    approver: {
      asanaGid: "120000000000001",
      email: "saman.safavi@elephant-labs.xyz",
    },
  };
}

function asanaChangedEvent(taskGid: string, userGid: string) {
  return {
    action: "changed",
    resource: { gid: taskGid, resource_type: "task" },
    user: { gid: userGid },
  };
}

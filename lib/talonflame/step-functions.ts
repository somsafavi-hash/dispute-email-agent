import {
  SendTaskFailureCommand,
  SendTaskSuccessCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";

export interface StartApprovalExecutionInput {
  stateMachineArn: string;
  name: string;
  payload: unknown;
}

export interface StartApprovalExecutionResult {
  status: "started" | "already_started";
  executionArn?: string;
  startDate?: Date;
}

export interface StepFunctionsGateway {
  startApprovalExecution(input: StartApprovalExecutionInput): Promise<StartApprovalExecutionResult>;
  sendTaskSuccess(taskToken: string, output: unknown): Promise<void>;
  sendTaskFailure(taskToken: string, error: string, cause: string): Promise<void>;
}

export class AwsStepFunctionsGateway implements StepFunctionsGateway {
  private readonly client: SFNClient;

  constructor(client = new SFNClient({})) {
    this.client = client;
  }

  async startApprovalExecution(
    input: StartApprovalExecutionInput,
  ): Promise<StartApprovalExecutionResult> {
    try {
      const response = await this.client.send(
        new StartExecutionCommand({
          stateMachineArn: input.stateMachineArn,
          name: input.name,
          input: JSON.stringify(input.payload),
        }),
      );

      return {
        status: "started",
        executionArn: response.executionArn,
        startDate: response.startDate,
      };
    } catch (error) {
      if (errorName(error) === "ExecutionAlreadyExists") {
        return { status: "already_started" };
      }
      throw error;
    }
  }

  async sendTaskSuccess(taskToken: string, output: unknown): Promise<void> {
    await this.client.send(
      new SendTaskSuccessCommand({
        taskToken,
        output: JSON.stringify(output),
      }),
    );
  }

  async sendTaskFailure(taskToken: string, error: string, cause: string): Promise<void> {
    await this.client.send(
      new SendTaskFailureCommand({
        taskToken,
        error,
        cause,
      }),
    );
  }
}

export function isTaskTokenReplayError(error: unknown): boolean {
  return ["InvalidToken", "TaskDoesNotExist", "TaskTimedOut"].includes(errorName(error));
}

function errorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name)
    : "";
}

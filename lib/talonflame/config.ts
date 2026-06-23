import { TalonflameError } from "./contracts";
import {
  HttpCommunicationRuntimeAssembler,
  StaticCommunicationRuntimeAssembler,
  type CommunicationRuntimeAssembler,
} from "./runtime";

export interface TalonflameConfig {
  asanaAccessToken: string;
  asanaProjectGid: string;
  asanaWorkspaceGid?: string;
  stateMachineArn: string;
  executionNamePrefix: string;
  oranguruAssemblyUrl?: string;
  oranguruBearerToken?: string;
  approvalTokenLookupUrl?: string;
  approvalTokenLookupBearerToken?: string;
  chatotManageCommunicationActivityUrl?: string;
  chatotConnectionArn?: string;
  meowthAsanaApprovalLambdaArn?: string;
}

export function loadTalonflameConfig(env: NodeJS.ProcessEnv = process.env): TalonflameConfig {
  return {
    asanaAccessToken: requiredEnv(env, "TALONFLAME_ASANA_ACCESS_TOKEN"),
    asanaProjectGid: requiredEnv(env, "TALONFLAME_ASANA_PROJECT_GID"),
    asanaWorkspaceGid: optionalEnv(env, "TALONFLAME_ASANA_WORKSPACE_GID"),
    stateMachineArn: requiredEnv(env, "TALONFLAME_STATE_MACHINE_ARN"),
    executionNamePrefix: optionalEnv(env, "TALONFLAME_EXECUTION_NAME_PREFIX") ?? "talonflame-",
    oranguruAssemblyUrl: optionalEnv(env, "ORANGURU_ASSEMBLE_COMMUNICATION_RUNTIME_URL"),
    oranguruBearerToken: optionalEnv(env, "ORANGURU_BEARER_TOKEN"),
    approvalTokenLookupUrl: optionalEnv(env, "MEOWTH_APPROVAL_TOKEN_LOOKUP_URL"),
    approvalTokenLookupBearerToken: optionalEnv(env, "MEOWTH_APPROVAL_TOKEN_LOOKUP_BEARER_TOKEN"),
    chatotManageCommunicationActivityUrl: optionalEnv(
      env,
      "CHATOT_MANAGE_COMMUNICATION_ACTIVITY_URL",
    ),
    chatotConnectionArn: optionalEnv(env, "CHATOT_STEP_FUNCTIONS_CONNECTION_ARN"),
    meowthAsanaApprovalLambdaArn: optionalEnv(env, "MEOWTH_ASANA_APPROVAL_LAMBDA_ARN"),
  };
}

export function buildRuntimeAssembler(config: TalonflameConfig): CommunicationRuntimeAssembler {
  if (config.oranguruAssemblyUrl) {
    return new HttpCommunicationRuntimeAssembler(
      config.oranguruAssemblyUrl,
      config.oranguruBearerToken,
    );
  }

  return new StaticCommunicationRuntimeAssembler({
    stateMachineArn: config.stateMachineArn,
    asanaProjectGid: config.asanaProjectGid,
    chatotManageCommunicationActivityUrl: config.chatotManageCommunicationActivityUrl,
    chatotConnectionArn: config.chatotConnectionArn,
    meowthAsanaApprovalLambdaArn: config.meowthAsanaApprovalLambdaArn,
  });
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = optionalEnv(env, key);
  if (!value) {
    throw new TalonflameError("missing_environment", `${key} is required`, 500, { key });
  }
  return value;
}

function optionalEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

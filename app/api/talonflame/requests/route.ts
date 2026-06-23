import { NextRequest, NextResponse } from "next/server";

import { AsanaClient } from "@/lib/talonflame/asana";
import { buildRuntimeAssembler, loadTalonflameConfig } from "@/lib/talonflame/config";
import { isTalonflameError } from "@/lib/talonflame/contracts";
import { startTalonflameRequest } from "@/lib/talonflame/orchestrator";
import { AwsStepFunctionsGateway } from "@/lib/talonflame/step-functions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const config = loadTalonflameConfig();
    const result = await startTalonflameRequest(
      await req.json(),
      {
        asana: new AsanaClient(config.asanaAccessToken, config.asanaWorkspaceGid),
        runtimeAssembler: buildRuntimeAssembler(config),
        stepFunctions: new AwsStepFunctionsGateway(),
      },
      { executionNamePrefix: config.executionNamePrefix },
    );

    return NextResponse.json(
      {
        requestId: result.request.requestId,
        status: result.execution.status,
        executionName: result.executionName,
        executionArn: result.execution.executionArn,
        sender: result.sender,
        recipient: result.recipient,
        approver: result.approver,
        renderedEmail: result.renderedEmail,
      },
      { status: result.execution.status === "already_started" ? 202 : 201 },
    );
  } catch (error) {
    if (isTalonflameError(error)) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { error: "talonflame_start_failed", message: "Unable to start Talonflame request" },
      { status: 500 },
    );
  }
}

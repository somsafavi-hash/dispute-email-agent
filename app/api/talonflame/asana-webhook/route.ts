import { NextRequest, NextResponse } from "next/server";

import { AsanaClient } from "@/lib/talonflame/asana";
import { loadTalonflameConfig } from "@/lib/talonflame/config";
import { isTalonflameError, TalonflameError } from "@/lib/talonflame/contracts";
import { AwsStepFunctionsGateway } from "@/lib/talonflame/step-functions";
import {
  handleAsanaWebhookPayload,
  HttpApprovalTokenStore,
  type AsanaWebhookPayload,
} from "@/lib/talonflame/webhook";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const hookSecret = req.headers.get("x-hook-secret");
  if (hookSecret) {
    return new NextResponse(null, {
      status: 200,
      headers: { "X-Hook-Secret": hookSecret },
    });
  }

  try {
    const config = loadTalonflameConfig();
    if (!config.approvalTokenLookupUrl) {
      throw new TalonflameError(
        "missing_environment",
        "MEOWTH_APPROVAL_TOKEN_LOOKUP_URL is required for Asana webhook callbacks",
        500,
      );
    }

    const payload = (await req.json()) as AsanaWebhookPayload;
    const results = await handleAsanaWebhookPayload(payload, {
      asana: new AsanaClient(config.asanaAccessToken, config.asanaWorkspaceGid),
      tokenStore: new HttpApprovalTokenStore(
        config.approvalTokenLookupUrl,
        config.approvalTokenLookupBearerToken,
      ),
      stepFunctions: new AwsStepFunctionsGateway(),
    });

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    if (isTalonflameError(error)) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { error: "talonflame_webhook_failed", message: "Unable to process Asana webhook" },
      { status: 500 },
    );
  }
}

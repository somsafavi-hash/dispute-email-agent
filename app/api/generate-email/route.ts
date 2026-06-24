import { NextResponse } from "next/server";

import { generateStaticV1DraftEmail } from "@/lib/generate-email/static-v1";

export async function POST() {
  return NextResponse.json(generateStaticV1DraftEmail());
}

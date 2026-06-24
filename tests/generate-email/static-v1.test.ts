import { describe, expect, it } from "vitest";

import { generateStaticV1DraftEmail } from "../../lib/generate-email/static-v1";

describe("generateStaticV1DraftEmail", () => {
  it("returns the hard-coded V1 subject and body", () => {
    expect(generateStaticV1DraftEmail()).toEqual({
      subject: "Document Request",
      body: [
        "Hello,",
        "",
        "We are reviewing the account documentation related to this matter and need your help confirming the available records.",
        "",
        "Please provide any outstanding documents or let us know if there are no additional materials available. If a call would be easier, please reply with a few times that work for your team.",
        "",
        "Thank you.",
      ].join("\n"),
    });
  });
});

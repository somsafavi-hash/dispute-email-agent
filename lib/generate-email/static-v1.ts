export interface DraftEmail {
  subject: string;
  body: string;
}

export const V1_STATIC_DRAFT_EMAIL: DraftEmail = {
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
};

export function generateStaticV1DraftEmail(): DraftEmail {
  return V1_STATIC_DRAFT_EMAIL;
}

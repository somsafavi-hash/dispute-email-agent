import { createHash } from "node:crypto";

export type TalonflameIdentityInput =
  | string
  | {
      asanaGid?: string;
      email?: string;
      name?: string;
    };

export interface TalonflameRequestContract {
  requestId: string;
  sender: TalonflameIdentityInput;
  recipient: TalonflameIdentityInput;
  approver: TalonflameIdentityInput;
  subject: string;
  body: string;
}

export type TalonflameIdentityRole = "sender" | "recipient" | "approver";

export interface ParsedTalonflameIdentity {
  role: TalonflameIdentityRole;
  asanaGid?: string;
  email?: string;
  name?: string;
}

export interface ResolvedTalonflameIdentity extends ParsedTalonflameIdentity {
  email: string;
}

export interface PinnedTalonflameRequest {
  requestId: string;
  sender: ParsedTalonflameIdentity;
  recipient: ParsedTalonflameIdentity;
  approver: ParsedTalonflameIdentity;
  subject: string;
  body: string;
}

export class TalonflameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "TalonflameError";
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ASANA_GID_RE = /^\d+$/;

export function isTalonflameError(error: unknown): error is TalonflameError {
  return error instanceof TalonflameError;
}

export function pinTalonflameRequestContract(input: unknown): PinnedTalonflameRequest {
  const record = asRecord(input, "request");
  const requestId = requiredString(record, "requestId", 256);
  const subject = requiredString(record, "subject", 998);
  const body = requiredString(record, "body", 100_000);

  return {
    requestId,
    sender: parseIdentity(record.sender, "sender"),
    recipient: parseIdentity(record.recipient, "recipient"),
    approver: parseIdentity(record.approver, "approver"),
    subject,
    body,
  };
}

export function assertResolvedIdentity(
  identity: ParsedTalonflameIdentity,
): asserts identity is ResolvedTalonflameIdentity {
  if (!identity.email) {
    throw new TalonflameError(
      "identity_unresolved",
      `${identity.role} must resolve to a real email address before orchestration starts`,
      422,
      { role: identity.role, asanaGid: identity.asanaGid },
    );
  }
}

export function executionNameForRequestId(requestId: string, prefix = "talonflame-"): string {
  const hash = createHash("sha256").update(requestId).digest("hex").slice(0, 12);
  const safeRequestId = requestId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 52);
  return `${prefix}${safeRequestId}-${hash}`.slice(0, 80);
}

export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    throw new TalonflameError("invalid_email", "Expected a valid email address", 400, {
      email,
    });
  }
  return trimmed;
}

function parseIdentity(value: unknown, role: TalonflameIdentityRole): ParsedTalonflameIdentity {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new TalonflameError("missing_identity", `${role} is required`, 400, { role });
    }

    if (trimmed.includes("@")) {
      return { role, email: normalizeEmail(trimmed) };
    }

    return { role, asanaGid: validateAsanaGid(trimmed, role) };
  }

  const record = asRecord(value, role);
  const email = optionalString(record, "email");
  const asanaGid = optionalString(record, "asanaGid");
  const name = optionalString(record, "name");

  if (!email && !asanaGid) {
    throw new TalonflameError(
      "missing_identity_locator",
      `${role} must include either email or asanaGid`,
      400,
      { role },
    );
  }

  return {
    role,
    email: email ? normalizeEmail(email) : undefined,
    asanaGid: asanaGid ? validateAsanaGid(asanaGid, role) : undefined,
    name,
  };
}

function validateAsanaGid(value: string, role: TalonflameIdentityRole): string {
  const trimmed = value.trim();
  if (!ASANA_GID_RE.test(trimmed)) {
    throw new TalonflameError(
      "invalid_asana_gid",
      `${role} Asana gid must be numeric`,
      400,
      { role, asanaGid: value },
    );
  }
  return trimmed;
}

function requiredString(
  record: Record<string, unknown>,
  key: keyof TalonflameRequestContract,
  maxLength: number,
): string {
  const value = optionalString(record, key);
  if (!value) {
    throw new TalonflameError("missing_field", `${String(key)} is required`, 400, {
      field: key,
    });
  }

  if (value.length > maxLength) {
    throw new TalonflameError("field_too_long", `${String(key)} is too long`, 400, {
      field: key,
      maxLength,
    });
  }

  return value;
}

function optionalString(record: Record<string, unknown>, key: string | number | symbol): string | undefined {
  const value = record[String(key)];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new TalonflameError("invalid_field_type", `${String(key)} must be a string`, 400, {
      field: key,
    });
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TalonflameError("invalid_contract", `${label} must be an object`, 400);
  }

  return value as Record<string, unknown>;
}

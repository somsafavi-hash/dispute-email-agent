import {
  assertResolvedIdentity,
  normalizeEmail,
  TalonflameError,
  type ParsedTalonflameIdentity,
  type ResolvedTalonflameIdentity,
} from "./contracts";
import type { PlainTextEmail } from "./render";

export interface AsanaUser {
  gid: string;
  name?: string;
  email?: string;
}

export interface AsanaTask {
  gid: string;
  completed: boolean;
  completed_by?: AsanaUser | null;
  permalink_url?: string;
}

interface AsanaResponse<T> {
  data: T;
}

interface AsanaPage<T> {
  data: T[];
  next_page?: {
    uri?: string;
  } | null;
}

export interface AsanaDirectory {
  resolveIdentity(identity: ParsedTalonflameIdentity): Promise<ResolvedTalonflameIdentity>;
  assertProjectAccess(identity: ResolvedTalonflameIdentity, projectGid: string): Promise<void>;
  getTask(taskGid: string): Promise<AsanaTask>;
}

export class AsanaClient implements AsanaDirectory {
  private readonly baseUrl = "https://app.asana.com/api/1.0";

  constructor(
    private readonly accessToken: string,
    private readonly workspaceGid?: string,
  ) {}

  async resolveIdentity(identity: ParsedTalonflameIdentity): Promise<ResolvedTalonflameIdentity> {
    if (identity.asanaGid) {
      const user = await this.getUser(identity.asanaGid);
      if (!user.email) {
        throw new TalonflameError(
          "asana_user_missing_email",
          `${identity.role} Asana user does not expose an email address`,
          422,
          { role: identity.role, asanaGid: identity.asanaGid },
        );
      }

      return {
        ...identity,
        asanaGid: user.gid,
        email: normalizeEmail(user.email),
        name: identity.name ?? user.name,
      };
    }

    assertResolvedIdentity(identity);

    if (!this.workspaceGid) {
      return identity;
    }

    const user = await this.findWorkspaceUserByEmail(identity.email);
    return user
      ? {
          ...identity,
          asanaGid: user.gid,
          name: identity.name ?? user.name,
        }
      : identity;
  }

  async assertProjectAccess(identity: ResolvedTalonflameIdentity, projectGid: string): Promise<void> {
    const users = await this.listProjectUsers(projectGid);
    const email = normalizeEmail(identity.email);
    const hasAccess = users.some((user) => {
      const userEmail = user.email ? normalizeEmail(user.email) : undefined;
      return user.gid === identity.asanaGid || userEmail === email;
    });

    if (!hasAccess) {
      throw new TalonflameError(
        "approver_missing_project_access",
        "Approver must have Asana access to the approval project",
        403,
        { projectGid, approver: identity },
      );
    }
  }

  async getTask(taskGid: string): Promise<AsanaTask> {
    const response = await this.get<AsanaResponse<AsanaTask>>(
      `/tasks/${encodeURIComponent(taskGid)}`,
      {
        opt_fields: "gid,completed,completed_by.gid,completed_by.name,completed_by.email,permalink_url",
      },
    );

    return response.data;
  }

  async createApprovalTask(input: {
    requestId: string;
    projectGid: string;
    approver: ResolvedTalonflameIdentity;
    sender: ResolvedTalonflameIdentity;
    recipient: ResolvedTalonflameIdentity;
    renderedEmail: PlainTextEmail;
  }): Promise<AsanaTask> {
    const response = await this.post<AsanaResponse<AsanaTask>>("/tasks", {
      data: {
        name: `Approve email send: ${input.renderedEmail.subject}`,
        assignee: input.approver.asanaGid ?? input.approver.email,
        projects: [input.projectGid],
        completed: false,
        notes: [
          `Talonflame request: ${input.requestId}`,
          `Sender: ${input.sender.email}`,
          `Recipient: ${input.recipient.email}`,
          "",
          `Subject: ${input.renderedEmail.subject}`,
          "",
          input.renderedEmail.body,
        ].join("\n"),
      },
    });

    return response.data;
  }

  private async getUser(gid: string): Promise<AsanaUser> {
    const response = await this.get<AsanaResponse<AsanaUser>>(`/users/${encodeURIComponent(gid)}`, {
      opt_fields: "gid,name,email",
    });

    return response.data;
  }

  private async findWorkspaceUserByEmail(email: string): Promise<AsanaUser | undefined> {
    const users = await this.listWorkspaceUsers();
    const normalized = normalizeEmail(email);
    return users.find((user) => (user.email ? normalizeEmail(user.email) : undefined) === normalized);
  }

  private async listWorkspaceUsers(): Promise<AsanaUser[]> {
    if (!this.workspaceGid) {
      return [];
    }

    return this.getAllPages<AsanaUser>("/users", {
      workspace: this.workspaceGid,
      opt_fields: "gid,name,email",
      limit: "100",
    });
  }

  private async listProjectUsers(projectGid: string): Promise<AsanaUser[]> {
    return this.getAllPages<AsanaUser>(`/projects/${encodeURIComponent(projectGid)}/users`, {
      opt_fields: "gid,name,email",
      limit: "100",
    });
  }

  private async getAllPages<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const values: T[] = [];
    let url: URL | undefined = this.buildUrl(path, query);

    while (url) {
      const page: AsanaPage<T> = await this.requestUrl<AsanaPage<T>>(url);
      values.push(...page.data);
      url = page.next_page?.uri ? new URL(page.next_page.uri) : undefined;
    }

    return values;
  }

  private async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.requestUrl<T>(this.buildUrl(path, query));
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.requestUrl<T>(this.buildUrl(path), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  private buildUrl(path: string, query: Record<string, string> = {}): URL {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    return url;
  }

  private async requestUrl<T>(url: URL, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new TalonflameError(
        "asana_request_failed",
        `Asana request failed (${response.status})`,
        response.status,
        { body },
      );
    }

    return (await response.json()) as T;
  }
}

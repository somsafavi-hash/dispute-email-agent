# Talonflame email approval-and-send workflow

Talonflame is the composition layer for approval-gated Microsoft email sends. It does not send directly during request intake. The only send path is:

1. Pin the request contract: `sender`, `recipient`, `approver`, `subject`, `body`, `requestId`.
2. Resolve any Asana gids to real users and email addresses.
3. Validate the approver has access to the configured Asana approval project.
4. Render one plain-text email through `renderPlainTextEmail`.
5. Start one Step Functions execution named from `requestId`.
6. Let meowth's `WaitForTaskToken` + Asana task pattern wait for approval.
7. After the configured approver completes the task, hand the rendered email to chatot's Microsoft provider activity.

## Runtime configuration

Required:

- `TALONFLAME_ASANA_ACCESS_TOKEN`
- `TALONFLAME_ASANA_PROJECT_GID`
- `TALONFLAME_STATE_MACHINE_ARN`

Required for webhook callbacks:

- `MEOWTH_APPROVAL_TOKEN_LOOKUP_URL`

Optional:

- `TALONFLAME_ASANA_WORKSPACE_GID`
- `TALONFLAME_EXECUTION_NAME_PREFIX`
- `ORANGURU_ASSEMBLE_COMMUNICATION_RUNTIME_URL`
- `ORANGURU_BEARER_TOKEN`
- `MEOWTH_APPROVAL_TOKEN_LOOKUP_BEARER_TOKEN`
- `MEOWTH_ASANA_APPROVAL_LAMBDA_ARN`
- `CHATOT_MANAGE_COMMUNICATION_ACTIVITY_URL`
- `CHATOT_STEP_FUNCTIONS_CONNECTION_ARN`

The v1 identities should be configured through the request and environment, not hardcoded: Saman Safavi as approver/sender, Greg Thomas as test recipient, and the Asana project "Bush" via its project gid.

## API

`POST /api/talonflame/requests`

```json
{
  "requestId": "example-001",
  "sender": "saman.safavi@elephant-labs.xyz",
  "recipient": "gthomas@springoakscapital.com",
  "approver": "saman.safavi@elephant-labs.xyz",
  "subject": "Document request",
  "body": "Plain-text body to send after approval."
}
```

Each identity may also be `{ "asanaGid": "123", "email": "name@example.com", "name": "Name" }`. If a string does not contain `@`, it is treated as an Asana gid.

`POST /api/talonflame/asana-webhook`

Handles the Asana webhook handshake and completion events. Non-approver completions fail the Step Functions task token with `NonApproverCompletion`; duplicate or expired task-token callbacks are treated as replays.

## Verification plan

- Dry-run: submit a request against fake Asana and Step Functions adapters and assert the rendered email and state-machine input match the contract.
- Approval then send: complete the Asana approval task as the configured approver and confirm Step Functions advances to `SendViaMicrosoftProvider`.
- No-send-before-approval: assert request intake only starts the execution and never calls chatot directly.
- Non-approver rejection: complete the task as another Asana user and confirm the task token receives `NonApproverCompletion`.
- Webhook replay: replay the same Asana completion event and confirm `InvalidToken`, `TaskDoesNotExist`, or `TaskTimedOut` is reported as `replay_ignored`.
- Timeout: let the wait state exceed `TimeoutSeconds` and confirm the execution fails with `ApprovalTimedOut` and chatot is not invoked.
- Redrive: redrive from a failed state and confirm chatot receives the same `Idempotency-Key` (`requestId`) so provider delivery is not duplicated.

Sending as `saman.safavi@elephant-labs.xyz` requires the Microsoft app registration in the `elephant-labs.xyz` tenant with `Mail.Send`.

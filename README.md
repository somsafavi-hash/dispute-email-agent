# Dispute Email Agent

V1 debt dispute email draft tool. Upload a seller CSV and prepare a fixed document-request email for each seller row.

This repo also includes **Talonflame**, an approval-gated email send orchestrator. Talonflame renders a plain-text email, opens an Asana approval task, waits for the configured approver to complete it, and only then delegates delivery to the Microsoft email provider through the communication runtime.

## Getting Started

1. Clone the repo
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000)

## CSV Draft Email Generator

### How It Works

- Upload any CSV with seller data (column names are auto-detected)
- Optionally add context for future versions
- V1 returns the same hard-coded subject and body for each row
- Copy each draft individually

## Talonflame Approval-Gated Sending

Talonflame provides a repeatable server-side workflow for email approval and delivery:

1. Accept a pinned request contract: `sender`, `recipient`, `approver`, `subject`, `body`, and `requestId`.
2. Resolve Asana gids to real identities and email addresses.
3. Validate the approver has access to the configured Asana approval project.
4. Render one plain-text email.
5. Start one Step Functions execution keyed by `requestId`.
6. Wait for Asana approval through the Step Functions task-token flow.
7. Send through the Microsoft provider only after approval.

API routes:

- `POST /api/talonflame/requests` starts an approval-gated send request.
- `POST /api/talonflame/asana-webhook` handles Asana webhook handshakes and approval callbacks.

Required Talonflame environment variables:

- `TALONFLAME_ASANA_ACCESS_TOKEN`
- `TALONFLAME_ASANA_PROJECT_GID`
- `TALONFLAME_STATE_MACHINE_ARN`
- `MEOWTH_APPROVAL_TOKEN_LOOKUP_URL` for webhook callbacks

See [`docs/talonflame/README.md`](docs/talonflame/README.md) for the full runtime configuration, request example, state-machine notes, and verification plan.

## Development Checks

```bash
npm run ci
```

`npm run ci` runs tests, lint, and the production build.

## Container Runtime

The app is built as a standalone Next.js container for AWS:

```bash
npm run docker:build
npm run docker:run
```

`GET /api/health` is used by the AWS load balancer health check.

## CI/CD

GitHub Actions is configured in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).

The pipeline runs on pull requests, pushes to `main`, and manual dispatch:

1. Install dependencies with `npm ci`.
2. Run `npm test`.
3. Run `npm run lint`.
4. Run `npm run build`.
5. On pushes to `main`, authenticate to AWS with GitHub OIDC.
6. Build and push the container image to ECR.
7. Deploy the ECS/Fargate, ALB, IAM, and Step Functions stack with CloudFormation.

Required GitHub secrets:

- `AWS_ROLE_ARN`
- `TALONFLAME_ASANA_ACCESS_TOKEN_SECRET_ARN`

Optional GitHub secrets:

- `MEOWTH_APPROVAL_TOKEN_LOOKUP_BEARER_TOKEN_SECRET_ARN`
- `ORANGURU_BEARER_TOKEN_SECRET_ARN`

Required GitHub variables:

- `AWS_REGION`
- `AWS_VPC_ID`
- `AWS_PUBLIC_SUBNET_IDS`
- `AWS_APP_SUBNET_IDS`
- `AWS_CERTIFICATE_ARN`
- `TALONFLAME_ASANA_PROJECT_GID`
- `MEOWTH_ASANA_APPROVAL_LAMBDA_ARN`
- `MEOWTH_APPROVAL_TOKEN_LOOKUP_URL`
- `CHATOT_MANAGE_COMMUNICATION_ACTIVITY_URL`
- `CHATOT_STEP_FUNCTIONS_CONNECTION_ARN`

Optional GitHub variables:

- `AWS_ECR_REPOSITORY`
- `AWS_ECR_STACK_NAME`
- `AWS_APP_STACK_NAME`
- `TALONFLAME_ASANA_WORKSPACE_GID`
- `ORANGURU_ASSEMBLE_COMMUNICATION_RUNTIME_URL`

## Deploy to AWS

AWS infrastructure lives in [`infra/aws`](infra/aws):

- `ecr.yml` creates the immutable ECR repository with image scanning and retention.
- `app.yml` deploys ECS/Fargate behind an HTTPS ALB, CloudWatch logs, IAM roles, and the Talonflame Step Functions state machine.

Runtime secrets should be stored in AWS Secrets Manager or SSM Parameter Store and referenced by ARN. Do not commit secret values. See [`.env.example`](.env.example) for local variable names.

The Asana webhook URL should point at the AWS load-balanced route:

```text
https://<aws-domain>/api/talonflame/asana-webhook
```

See [`docs/aws/deployment.md`](docs/aws/deployment.md) for the deployment model and SOCAPITAL-style engineering guardrails.

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Docker
- Amazon ECS/Fargate
- Amazon ECR
- AWS CloudFormation
- AWS Step Functions
- Asana API
- Microsoft Graph email delivery via the communication provider

# AWS deployment

`dispute-email-agent` deploys to AWS as a standalone Next.js container on ECS/Fargate.

## Architecture

```text
GitHub Actions -> ECR -> ECS/Fargate -> ALB -> Next.js
                                      -> Step Functions
```

The CloudFormation templates are in `infra/aws`:

- `ecr.yml`: ECR repository with immutable tags, scan-on-push, AES256 encryption, and lifecycle cleanup.
- `app.yml`: HTTPS ALB, ECS cluster/service/task definition, IAM roles, CloudWatch logs, and the Talonflame Step Functions state machine.

## SOCAPITAL-style engineering guardrails

- Use GitHub OIDC to assume an AWS deploy role. Do not store AWS access keys in GitHub.
- Store runtime secrets in AWS Secrets Manager or SSM Parameter Store. GitHub stores secret ARNs, not secret values.
- Require HTTPS at the load balancer with ACM. HTTP redirects to HTTPS.
- Use ECS task roles for AWS SDK calls. The app does not need static AWS credentials.
- Keep ECR tags immutable and scan images on push.
- Keep the Asana webhook stable at `/api/talonflame/asana-webhook`.
- Emit application logs to CloudWatch with a 30-day default retention period.
- Deploy Step Functions from infrastructure, not by hand from the console.

## GitHub configuration

Required secrets:

- `AWS_ROLE_ARN`
- `TALONFLAME_ASANA_ACCESS_TOKEN_SECRET_ARN`

Optional secrets:

- `MEOWTH_APPROVAL_TOKEN_LOOKUP_BEARER_TOKEN_SECRET_ARN`
- `ORANGURU_BEARER_TOKEN_SECRET_ARN`

Required variables:

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

Optional variables:

- `AWS_ECR_REPOSITORY`
- `AWS_ECR_STACK_NAME`
- `AWS_APP_STACK_NAME`
- `TALONFLAME_ASANA_WORKSPACE_GID`
- `ORANGURU_ASSEMBLE_COMMUNICATION_RUNTIME_URL`

`AWS_PUBLIC_SUBNET_IDS` and `AWS_APP_SUBNET_IDS` should be comma-separated subnet IDs. Prefer private app subnets with NAT for ECS tasks and public subnets for the ALB.

## Production deploy

Merging to `main` runs:

1. `npm ci`
2. `npm test`
3. `npm run lint`
4. `npm run build`
5. ECR stack deploy
6. Docker image build and push
7. ECS/Fargate and Step Functions stack deploy

The production workflow uses `infra/aws/app.yml` and passes the just-built image URI into the ECS task definition.

## Local container verification

```bash
npm run docker:build
npm run docker:run
```

Then check:

```bash
curl http://localhost:3000/api/health
```

## Talonflame runtime notes

The app task role starts the Talonflame state machine and resumes task tokens from the Asana webhook route. The Step Functions role invokes meowth and uses the configured EventBridge Connection for chatot Microsoft delivery.

The Asana webhook URL should be:

```text
https://<aws-domain>/api/talonflame/asana-webhook
```

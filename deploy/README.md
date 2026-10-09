# Nightly refresh on Nebius

Every place with a published briefing is followed. Each night, `.github/workflows/nightly.yml`
builds the pipeline image (`deploy/Dockerfile.refresh`) and starts it as a **Nebius Serverless
AI job** on a CPU VM (`cpu-d3`, `2vcpu-8gb`). The job runs `npm run pipeline -- refresh`:
unchanged agendas cost no model call, new agendas are sorted and explained, and the briefings
in Upstash are updated in place. The VM is billed only while the job runs.

Nothing runs until the setup below is done: the workflow skips itself while
`NEBIUS_PROJECT_ID` is not set.

## Current setup (October 2026)

The hackathon tenant does not let us attach a key to a service account (`permission_denied`
without the tenant admin role), so GitHub cannot start Nebius jobs by itself. The nightly
refresh therefore runs on the GitHub Actions runner (`REFRESH_RUNNER=github`), and the same
image has been run as a Nebius Serverless AI job started from the console:

1. GitHub, Settings, Secrets and variables, Actions: secrets `NEBIUS_API_KEY`, `TAVILY_API_KEY`,
   `KV_REST_API_URL`, `KV_REST_API_TOKEN` (the production values), variable
   `REFRESH_RUNNER=github`.
2. Actions, Nightly refresh, Run workflow: builds and publishes
   `ghcr.io/chinorab/townwatch-refresh:latest` (public, like the repository: anyone can pull it),
   then runs the refresh. First run, 9 October 2026: 4 places, unchanged, $0, 25 s.
3. Nebius console, Create resource, Job: image `ghcr.io/chinorab/townwatch-refresh:latest`,
   no GPU (CPU platform, `2vcpu-8gb`), timeout 1 hour, four secret environment variables with
   the names above (Create secret in the job form), Create job. The job log ends with
   `Refreshed N places`. Done on 9 October 2026: the job refreshed the 4 followed places.
   The variable name field only takes letters, digits and `_`; secrets created outside the
   job form are not attached to it.

## Fully automatic setup (needs a tenant admin)

## One-time setup

1. **Service account** (web console only, no Nebius CLI needed, it does not exist for Windows):
   - Create resource, Service account, name `townwatch-ci`, in the project of the Token Factory key.
   - Administration, IAM, Groups, `editors`, Add members: add `townwatch-ci`.
   - Create a key pair outside the repository (Git Bash has openssl):

     ```bash
     mkdir -p ~/townwatch-keys && cd ~/townwatch-keys
     openssl genrsa -out private.pem 4096
     openssl rsa -in private.pem -pubout -out public.pem
     ```

   - On the service account page, Authorized keys, upload `public.pem` (set an expiry, for example
     31 January 2027), then copy the key ID and the service account ID.

2. **Secrets for the job (MysteryBox).** Create four secrets in the project, each with one
   payload key named like the environment variable:

   | Secret name | Payload key |
   |---|---|
   | `townwatch-nebius-api-key` | `NEBIUS_API_KEY` |
   | `townwatch-tavily-api-key` | `TAVILY_API_KEY` |
   | `townwatch-kv-url` | `KV_REST_API_URL` |
   | `townwatch-kv-token` | `KV_REST_API_TOKEN` |

3. **GitHub repository settings** (Settings, Secrets and variables, Actions):
   - secret `NEBIUS_SA_PRIVATE_KEY`: the whole content of `private.pem` (then delete the file);
   - variables `NEBIUS_SA_ID`, `NEBIUS_PUBLIC_KEY_ID` and `NEBIUS_PROJECT_ID`.

4. **Image visibility.** After the first run, open the `townwatch-refresh` package on GitHub
   and make it public (it contains the open-source code only, no key), so the job can pull it
   without registry credentials.

5. Run the workflow once by hand (Actions, Nightly refresh, Run workflow) and check the job
   in the Nebius console under Serverless AI, Jobs.

## Fallback without Nebius

Set the repository variable `REFRESH_RUNNER=github` and the secrets `NEBIUS_API_KEY`,
`TAVILY_API_KEY`, `KV_REST_API_URL` and `KV_REST_API_TOKEN`: the same command then runs on
the GitHub Actions runner.

## Before a manual refresh

```bash
npx tsx --env-file-if-exists=.env.local scripts/backup-briefings.ts
npm run pipeline -- refresh
```

The backup goes to `.cache/backup/`; restore with `scripts/backup-briefings.ts --restore <file>`.

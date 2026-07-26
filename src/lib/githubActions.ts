const REPO_KEY = 'musicpocket.github.repo'
const TOKEN_KEY = 'musicpocket.github.token'
const REF_KEY = 'musicpocket.github.ref'

export interface GithubCredentials {
  repo: string
  token: string
  ref: string
}

export function loadGithubCredentials(): GithubCredentials | null {
  try {
    const repo = localStorage.getItem(REPO_KEY)?.trim() || ''
    const token = localStorage.getItem(TOKEN_KEY)?.trim() || ''
    const ref = localStorage.getItem(REF_KEY)?.trim() || 'main'
    if (!repo || !token) return null
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null
    return { repo, token, ref }
  } catch {
    return null
  }
}

export function saveGithubCredentials(creds: GithubCredentials): void {
  localStorage.setItem(REPO_KEY, creds.repo.trim())
  localStorage.setItem(TOKEN_KEY, creds.token.trim())
  localStorage.setItem(REF_KEY, (creds.ref || 'main').trim())
}

export function clearGithubToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function actionsWorkflowUrl(repo: string, workflowFile: string): string {
  return `https://github.com/${repo}/actions/workflows/${workflowFile}`
}

interface DispatchOptions {
  workflowFile: string
  inputs: Record<string, string>
}

async function githubFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  })
  return response
}

export async function dispatchWorkflow(
  creds: GithubCredentials,
  { workflowFile, inputs }: DispatchOptions,
): Promise<void> {
  const [owner, repo] = creds.repo.split('/')
  const response = await githubFetch(
    `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
    creds.token,
    {
      method: 'POST',
      body: JSON.stringify({
        ref: creds.ref || 'main',
        inputs,
      }),
    },
  )

  if (response.status === 204) return

  let detail = `GitHub API ${response.status}`
  try {
    const body = (await response.json()) as { message?: string }
    if (body.message) detail = body.message
  } catch {
    // ignore
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`${detail} — check that your PAT can run Actions on ${creds.repo}.`)
  }
  if (response.status === 404) {
    throw new Error(`${detail} — workflow ${workflowFile} not found on ${creds.ref}.`)
  }
  throw new Error(detail)
}

export type WorkflowConclusion = 'success' | 'failure' | 'cancelled' | 'timed_out' | 'neutral' | 'skipped' | string

export interface WorkflowRunSummary {
  id: number
  status: string
  conclusion: WorkflowConclusion | null
  htmlUrl: string
  createdAt: string
}

export async function waitForLatestWorkflowRun(
  creds: GithubCredentials,
  workflowFile: string,
  startedAfterIso: string,
  options?: { timeoutMs?: number; pollMs?: number; onUpdate?: (run: WorkflowRunSummary | null) => void },
): Promise<WorkflowRunSummary> {
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000
  const pollMs = options?.pollMs ?? 4000
  const [owner, repo] = creds.repo.split('/')
  const startedAfter = Date.parse(startedAfterIso)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const response = await githubFetch(
      `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=5&event=workflow_dispatch`,
      creds.token,
    )
    if (!response.ok) {
      throw new Error(`Failed to list workflow runs (${response.status})`)
    }
    const data = (await response.json()) as {
      workflow_runs?: Array<{
        id: number
        status: string
        conclusion: string | null
        html_url: string
        created_at: string
      }>
    }
    const run = (data.workflow_runs ?? []).find((r) => Date.parse(r.created_at) >= startedAfter - 5000)
    const summary: WorkflowRunSummary | null = run
      ? {
          id: run.id,
          status: run.status,
          conclusion: run.conclusion,
          htmlUrl: run.html_url,
          createdAt: run.created_at,
        }
      : null

    options?.onUpdate?.(summary)

    if (summary && summary.status === 'completed') {
      return summary
    }

    await sleep(pollMs)
  }

  throw new Error('Timed out waiting for the GitHub Actions run to finish')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

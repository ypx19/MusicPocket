import type { GithubCredentials } from './githubActions'

interface PublicKeyResponse {
  key_id: string
  key: string
}

async function githubFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  })
}

async function encryptSecret(publicKeyBase64: string, plainText: string): Promise<string> {
  const sodium = (await import('libsodium-wrappers')).default
  await sodium.ready
  const keyBytes = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL)
  const messageBytes = sodium.from_string(plainText)
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes)
  return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL)
}

export async function upsertRepositorySecret(
  creds: GithubCredentials,
  secretName: string,
  plainValue: string,
): Promise<void> {
  const [owner, repo] = creds.repo.split('/')
  const keyRes = await githubFetch(`/repos/${owner}/${repo}/actions/secrets/public-key`, creds.token)
  if (!keyRes.ok) {
    const body = await keyRes.text()
    throw new Error(
      `Failed to read Actions public key (${keyRes.status}). PAT needs Secrets: Read and write. ${body}`,
    )
  }
  const { key_id, key } = (await keyRes.json()) as PublicKeyResponse
  const encrypted_value = await encryptSecret(key, plainValue)

  const putRes = await githubFetch(`/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(secretName)}`, creds.token, {
    method: 'PUT',
    body: JSON.stringify({ encrypted_value, key_id }),
  })
  if (putRes.status !== 201 && putRes.status !== 204) {
    const body = await putRes.text()
    throw new Error(`Failed to upsert secret ${secretName} (${putRes.status}). ${body}`)
  }
}

/** Save both raw and base64 cookie secrets for Actions fallback. */
export async function syncYoutubeCookieSecrets(
  creds: GithubCredentials,
  cookiesTxt: string,
): Promise<{ rawBytes: number; b64Length: number }> {
  let normalized = cookiesTxt.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '')
  if (!normalized.includes('youtube.com')) {
    throw new Error('Paste Netscape cookies.txt that includes youtube.com rows.')
  }
  if (!normalized.includes('\t')) {
    throw new Error(
      'Cookie rows look like they lost TAB characters. Re-export as Netscape cookies.txt (not JSON).',
    )
  }

  const first = normalized.split('\n', 1)[0]?.trim() ?? ''
  if (!first.startsWith('# Netscape HTTP Cookie File') && !first.startsWith('# HTTP Cookie File')) {
    normalized = `# Netscape HTTP Cookie File\n${normalized}`
  }
  if (!normalized.endsWith('\n')) normalized += '\n'

  const b64 = btoa(unescape(encodeURIComponent(normalized)))
  await upsertRepositorySecret(creds, 'YTDLP_COOKIES_B64', b64)
  await upsertRepositorySecret(creds, 'YTDLP_COOKIES', normalized)
  return { rawBytes: normalized.length, b64Length: b64.length }
}

export function openYoutubeLogin(): void {
  window.open('https://www.youtube.com/', '_blank', 'noopener,noreferrer')
}

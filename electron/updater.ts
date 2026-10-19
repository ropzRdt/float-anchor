const RELEASE_ROOT = 'https://github.com/swordrada/float-anchor/releases'
const RELEASE_API = 'https://api.github.com/repos/swordrada/float-anchor/releases/latest'

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  version?: string
  error?: string
}

export interface ReleaseUpdateResult extends UpdateCheckResult {
  assetName?: string
  downloadUrl?: string
}

export type UpdateFetcher = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'text' | 'json'>>

interface UpdateCheckOptions {
  currentVersion: string
  platform: string
  arch: string
  fetch: UpdateFetcher
  signal?: AbortSignal
}

interface ReleaseDownload {
  version: string
  assetName: string
  downloadUrl: string
}

function stableVersion(value: unknown, allowTagPrefix = false): string {
  if (typeof value !== 'string') throw new Error('版本号无效')
  const version = allowTagPrefix ? value.replace(/^v/, '') : value
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
    || !version.split('.').every(part => Number.isSafeInteger(Number(part)))) {
    throw new Error('版本号无效，必须是正式版本')
  }
  return version
}

function isNewer(version: string, currentVersion: string): boolean {
  const latest = version.split('.').map(Number)
  const current = currentVersion.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (latest[i] !== current[i]) return latest[i] > current[i]
  }
  return false
}

function assetNameFor(version: string, platform: string, arch: string): string {
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    return `FloatAnchor-${version}-mac-${arch}.dmg`
  }
  if (platform === 'win32' && arch === 'x64') return `FloatAnchor-${version}-win-setup.exe`
  throw new Error(`暂不支持 ${platform}/${arch} 自动更新`)
}

// electron-builder emits plain scalars and a files list. Read only that small
// subset; do not interpret YAML aliases, tags, paths or arbitrary URLs.
function metadataScalar(value: string): string {
  const trimmed = value.trim()
  const unquoted = (/^(['"])(.*)\1$/.exec(trimmed)?.[2]) ?? trimmed
  if (!/^[A-Za-z0-9._-]+$/.test(unquoted)) throw new Error('更新元数据格式无效')
  return unquoted
}

function fromMetadata(text: string, platform: string, arch: string): ReleaseDownload {
  if (text.length > 128_000 || text.includes('\t')) throw new Error('更新元数据格式无效')
  let version: string | undefined
  let inFiles = false
  let sawFiles = false
  const files: string[] = []
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (/^version:/.test(line)) {
      if (version !== undefined) throw new Error('更新元数据中版本号重复')
      version = stableVersion(metadataScalar(line.slice('version:'.length)))
      inFiles = false
    } else if (/^files:\s*$/.test(line)) {
      if (sawFiles) throw new Error('更新元数据中文件列表重复')
      sawFiles = true
      inFiles = true
    } else if (/^\S/.test(line)) {
      inFiles = false
    } else if (inFiles) {
      const file = /^  - url:\s*(.+)$/.exec(line)
      if (file) files.push(metadataScalar(file[1]))
      else if (!/^    [A-Za-z][A-Za-z0-9]*:\s*\S.*$/.test(line)) {
        throw new Error('更新元数据中文件列表无效')
      }
    }
  }
  if (!version || !sawFiles || !files.length) throw new Error('更新元数据不完整')
  const assetName = assetNameFor(version, platform, arch)
  if (files.filter(file => file === assetName).length !== 1) {
    throw new Error(`更新元数据缺少 ${platform}/${arch} 安装包`)
  }
  return {
    version,
    assetName,
    downloadUrl: `${RELEASE_ROOT}/download/v${version}/${assetName}`,
  }
}

function fromReleaseApi(value: unknown, platform: string, arch: string): ReleaseDownload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('发布信息无效')
  const release = value as Record<string, unknown>
  if (release.draft === true || release.prerelease === true) throw new Error('发布尚非正式版本')
  const version = stableVersion(release.tag_name, true)
  const assetName = assetNameFor(version, platform, arch)
  if (!Array.isArray(release.assets)) throw new Error('发布信息缺少安装包')
  const matches = release.assets.filter(asset => asset && typeof asset === 'object' && asset.name === assetName)
  if (matches.length !== 1) throw new Error(`发布缺少 ${platform}/${arch} 安装包`)
  const downloadUrl = `${RELEASE_ROOT}/download/${release.tag_name}/${assetName}`
  if (matches[0].browser_download_url !== downloadUrl) throw new Error('安装包下载地址无效')
  return { version, assetName, downloadUrl }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function checkForReleaseUpdate(options: UpdateCheckOptions): Promise<ReleaseUpdateResult> {
  const { currentVersion, platform, arch, fetch: fetchUpdate, signal } = options
  const noUpdate: UpdateCheckResult = { hasUpdate: false, currentVersion }
  try {
    stableVersion(currentVersion)
    assetNameFor(currentVersion, platform, arch)
    const request = async (url: string, accept: string) => {
      const response = await fetchUpdate(url, {
        signal,
        cache: 'no-store',
        headers: {
          'User-Agent': 'FloatAnchor-Updater',
          Accept: accept,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response
    }

    let release: ReleaseDownload
    try {
      const metadataName = platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml'
      const response = await request(`${RELEASE_ROOT}/latest/download/${metadataName}`, 'text/plain')
      release = fromMetadata(await response.text(), platform, arch)
    } catch (metadataError) {
      if (signal?.aborted) throw new Error('检查更新超时，请稍后重试')
      try {
        const response = await request(RELEASE_API, 'application/vnd.github+json')
        release = fromReleaseApi(await response.json(), platform, arch)
      } catch (apiError) {
        if (signal?.aborted) throw new Error('检查更新超时，请稍后重试')
        throw new Error(`无法检查更新（更新元数据：${errorMessage(metadataError)}；GitHub API：${errorMessage(apiError)}）`)
      }
    }
    if (!isNewer(release.version, currentVersion)) return noUpdate
    return { hasUpdate: true, currentVersion, ...release }
  } catch (error) {
    return { ...noUpdate, error: errorMessage(error) }
  }
}

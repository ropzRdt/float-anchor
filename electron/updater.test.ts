import { describe, expect, it, vi } from 'vitest'
import { checkForReleaseUpdate, type UpdateFetcher } from './updater'

const releaseRoot = 'https://github.com/swordrada/float-anchor/releases'
const metadataUrl = `${releaseRoot}/latest/download/latest-mac.yml`
const apiUrl = 'https://api.github.com/repos/swordrada/float-anchor/releases/latest'
const armAsset = 'FloatAnchor-1.0.22-mac-arm64.dmg'
const x64Asset = 'FloatAnchor-1.0.22-mac-x64.dmg'

function metadata(version = '1.0.22', files = [armAsset, x64Asset]) {
  return `version: ${version}\nfiles:\n${files.map(file => `  - url: ${file}\n    sha512: abc+/=\n    size: 123`).join('\n')}\npath: ${files[0]}\nreleaseDate: '2026-10-15T01:00:00.000Z'\n`
}

function response(body: string | object, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
    json: async () => typeof body === 'string' ? JSON.parse(body) : body,
  }
}

function releaseApi(assetName = armAsset, tag = 'v1.0.22') {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [{ name: assetName, browser_download_url: `${releaseRoot}/download/${tag}/${assetName}` }],
  }
}

function check(fetchUpdate: UpdateFetcher, overrides = {}) {
  return checkForReleaseUpdate({ currentVersion: '1.0.21', platform: 'darwin', arch: 'arm64', fetch: fetchUpdate, ...overrides })
}

describe('release update discovery', () => {
  it('finds v1.0.22 in public release metadata without using the rate-limited API', async () => {
    const fetchUpdate = vi.fn<UpdateFetcher>().mockResolvedValue(response(metadata()))
    expect(await check(fetchUpdate)).toEqual({
      hasUpdate: true,
      currentVersion: '1.0.21',
      version: '1.0.22',
      assetName: armAsset,
      downloadUrl: `${releaseRoot}/download/v1.0.22/${armAsset}`,
    })
    expect(fetchUpdate).toHaveBeenCalledTimes(1)
    expect(fetchUpdate).toHaveBeenCalledWith(metadataUrl, expect.objectContaining({
      cache: 'no-store',
      headers: expect.objectContaining({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' }),
    }))
  })

  it('selects the complete macOS Intel asset name', async () => {
    const fetchUpdate = vi.fn<UpdateFetcher>().mockResolvedValue(response(metadata()))
    expect(await check(fetchUpdate, { arch: 'x64' })).toMatchObject({ hasUpdate: true, assetName: x64Asset })
  })

  it('reads latest.yml and selects the Windows x64 installer', async () => {
    const assetName = 'FloatAnchor-1.0.22-win-setup.exe'
    const fetchUpdate = vi.fn<UpdateFetcher>().mockResolvedValue(response(metadata('1.0.22', [assetName])))
    expect(await check(fetchUpdate, { platform: 'win32', arch: 'x64' })).toMatchObject({ hasUpdate: true, assetName })
    expect(fetchUpdate.mock.calls[0][0]).toBe(`${releaseRoot}/latest/download/latest.yml`)
  })

  it.each(['1.0.22', '1.0.23'])('reports no update for an installed %s with no error', async currentVersion => {
    const fetchUpdate = vi.fn<UpdateFetcher>().mockResolvedValue(response(metadata()))
    expect(await check(fetchUpdate, { currentVersion })).toEqual({ hasUpdate: false, currentVersion })
    expect(fetchUpdate).toHaveBeenCalledTimes(1)
  })

  it('compares version components numerically', async () => {
    const assetName = 'FloatAnchor-1.0.100-mac-arm64.dmg'
    const fetchUpdate = vi.fn<UpdateFetcher>().mockResolvedValue(response(metadata('1.0.100', [assetName])))
    expect(await check(fetchUpdate, { currentVersion: '1.0.99' })).toMatchObject({ hasUpdate: true, version: '1.0.100' })
  })

  it('falls back to official REST release assets when public metadata is unavailable', async () => {
    const fetchUpdate = vi.fn<UpdateFetcher>()
      .mockResolvedValueOnce(response('not found', 404))
      .mockResolvedValueOnce(response(releaseApi()))
    expect(await check(fetchUpdate)).toMatchObject({ hasUpdate: true, version: '1.0.22', assetName: armAsset })
    expect(fetchUpdate.mock.calls.map(call => call[0])).toEqual([metadataUrl, apiUrl])
  })

  it('returns an explicit error when metadata fails and the REST API is rate limited', async () => {
    const fetchUpdate = vi.fn<UpdateFetcher>()
      .mockResolvedValueOnce(response('not found', 404))
      .mockResolvedValueOnce(response({ message: 'API rate limit exceeded' }, 403))
    const result = await check(fetchUpdate)
    expect(result).toMatchObject({ hasUpdate: false, currentVersion: '1.0.21' })
    expect(result.error).toContain('HTTP 404')
    expect(result.error).toContain('HTTP 403')
  })

  it.each([
    ['missing the matching architecture', metadata('1.0.22', [x64Asset])],
    ['a blockmap instead of the installer', metadata('1.0.22', [`${armAsset}.blockmap`])],
    ['a malformed version', metadata('1.0')],
    ['a prerelease version', metadata('1.0.22-beta.1')],
    ['a leading-zero version', metadata('1.00.22')],
    ['an incomplete YAML document', 'version: 1.0.22\nfiles:\n'],
    ['duplicate versions', `${metadata()}version: 1.0.23\n`],
    ['an external download URL', metadata('1.0.22', [`https://example.com/${armAsset}`])],
    ['a parent-directory path', metadata('1.0.22', [`../${armAsset}`])],
  ])('does not treat %s as an up-to-date check', async (_name, body) => {
    const fetchUpdate = vi.fn<UpdateFetcher>()
      .mockResolvedValueOnce(response(body))
      .mockResolvedValueOnce(response({ message: 'API rate limit exceeded' }, 403))
    expect(await check(fetchUpdate)).toMatchObject({ hasUpdate: false, error: expect.any(String) })
    expect(fetchUpdate).toHaveBeenCalledTimes(2)
  })

  it('accepts quoted metadata scalars from electron-builder', async () => {
    const body = metadata('"1.0.22"', [`'${armAsset}'`, `"${x64Asset}"`])
    const fetchUpdate = vi.fn<UpdateFetcher>().mockResolvedValue(response(body))
    expect(await check(fetchUpdate)).toMatchObject({ hasUpdate: true, version: '1.0.22', assetName: armAsset })
  })

  it('rejects REST releases with a download URL outside the official repository', async () => {
    const release = releaseApi()
    release.assets[0].browser_download_url = `https://example.com/${armAsset}`
    const fetchUpdate = vi.fn<UpdateFetcher>()
      .mockResolvedValueOnce(response('not found', 404))
      .mockResolvedValueOnce(response(release))
    expect(await check(fetchUpdate)).toMatchObject({ hasUpdate: false, error: expect.stringContaining('下载地址无效') })
  })

  it('rejects a prerelease from the REST fallback', async () => {
    const fetchUpdate = vi.fn<UpdateFetcher>()
      .mockResolvedValueOnce(response('not found', 404))
      .mockResolvedValueOnce(response({ ...releaseApi(), prerelease: true }))
    expect(await check(fetchUpdate)).toMatchObject({ hasUpdate: false, error: expect.stringContaining('尚非正式版本') })
  })

  it('returns a timeout error without starting a fallback request after cancellation', async () => {
    const controller = new AbortController()
    const fetchUpdate = vi.fn<UpdateFetcher>().mockImplementation(async () => {
      controller.abort()
      throw new Error('The operation was aborted')
    })
    expect(await check(fetchUpdate, { signal: controller.signal })).toMatchObject({
      hasUpdate: false,
      error: expect.stringContaining('超时'),
    })
    expect(fetchUpdate).toHaveBeenCalledTimes(1)
    expect(fetchUpdate.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('reports unsupported platform/architecture explicitly before fetching', async () => {
    const fetchUpdate = vi.fn<UpdateFetcher>()
    expect(await check(fetchUpdate, { platform: 'win32', arch: 'arm64' })).toMatchObject({
      hasUpdate: false,
      error: expect.stringContaining('win32/arm64'),
    })
    expect(fetchUpdate).not.toHaveBeenCalled()
  })
})

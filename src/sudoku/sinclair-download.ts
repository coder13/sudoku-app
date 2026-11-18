import type { Difficulty } from './engine.ts'
import type { VariantId } from './variants.ts'
import { libraryLevel } from './sinclair-catalog.ts'
import { collectionGridHash } from './collection-integrity.ts'
import { SINCLAIR_COUNT, type SinclairPack } from './sinclair-format.ts'

type RequestFile = (url: string) => Promise<Response>
const cacheName = 'sudoku-app-sinclair-packs-v1'
const unavailable = 'Connect to the internet to download this Sinclair difficulty.'
const damaged = 'The Sinclair download is incomplete. Connect to the internet and try again.'

export function createSinclairDownloads(request: RequestFile = url => fetch(url), open = async () => {
  try { return await globalThis.caches?.open(cacheName) } catch { return undefined }
}) {
  const packs = new Map<string, SinclairPack>(), active = new Map<string, Promise<SinclairPack>>()
  const saved = new Set<string>(), listeners = new Set<() => void>()
  const publish = () => { for (const notify of listeners) notify() }

  async function discover() {
    try {
      const cache = await open()
      if (!cache) return
      const entries = await cache.keys()
      saved.clear()
      for (const entry of entries) saved.add(new URL(entry.url).pathname)
      publish()
    } catch { /* The current session can still play downloaded packs. */ }
  }
  async function loadFile(family: VariantId, tier: Difficulty) {
    const level = libraryLevel(family, tier)
    const cache = await open()
    function decode(text: string): SinclairPack {
      if (text.length !== level.bytes || collectionGridHash(text) !== level.checksum) throw Error(damaged)
      const pack: SinclairPack = JSON.parse(text)
      if (pack.edition !== 1 || pack.variant !== family || pack.difficulty !== tier || pack.puzzles.length !== SINCLAIR_COUNT) throw Error(damaged)
      return pack
    }
    let cached: Response | undefined
    try { cached = await cache?.match(level.url) } catch { /* Try the network. */ }
    if (cached) {
      try {
        const pack = decode(await cached.text())
        packs.set(level.url, pack)
        saved.add(level.url)
        publish()
        return pack
      } catch {
        saved.delete(level.url)
        try { await cache?.delete(level.url) } catch { /* A valid download can replace it. */ }
        publish()
      }
    }
    let text: string
    try {
      const response = await request(level.url)
      if (!response.ok) throw Error(unavailable)
      text = await response.text()
    } catch { throw Error(unavailable) }
    const pack = decode(text)
    if (cache) try {
      await cache.put(level.url, new Response(text, { headers: { 'Content-Type': 'application/json' } }))
      saved.add(level.url)
    } catch { /* Restricted storage still permits play in this session. */ }
    packs.set(level.url, pack)
    publish()
    return pack
  }
  const store = {
    discover,
    subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify) } },
    ready(url: string) { return saved.has(url) || packs.has(url) },
    saved(url: string) { return saved.has(url) },
    async load(family: VariantId, tier: Difficulty, signal?: AbortSignal) {
      signal?.throwIfAborted()
      const { url } = libraryLevel(family, tier)
      let result = packs.get(url)
      if (!result) {
        let pending = active.get(url)
        if (!pending) {
          pending = loadFile(family, tier).finally(() => active.delete(url))
          active.set(url, pending)
        }
        result = await pending
      }
      signal?.throwIfAborted()
      return result
    },
    async saveOffline(family: VariantId, tier: Difficulty) {
      const pack = await store.load(family, tier)
      const { url } = libraryLevel(family, tier)
      if (saved.has(url)) return
      try {
        const cache = await open()
        if (!cache) throw Error()
        await cache.put(url, new Response(JSON.stringify(pack), { headers: { 'Content-Type': 'application/json' } }))
      } catch { throw Error('The puzzles are ready for this session. Allow this site to save data or free some device storage for offline play.') }
      saved.add(url)
      publish()
    },
  }
  return store
}
export const sinclairDownloads = createSinclairDownloads()

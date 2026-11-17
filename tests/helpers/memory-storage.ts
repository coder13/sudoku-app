export class MemoryStorage {
  get length() { return Object.keys(this).length }

  key(index: number) { return Object.keys(this)[index] ?? null }

  getItem(key: string) {
    const values = this as unknown as Record<string, unknown>
    return Object.hasOwn(values, key) ? String(values[key]) : null
  }

  setItem(key: string, value: string) {
    Object.defineProperty(this, key, { value: String(value), writable: true, enumerable: true, configurable: true })
  }

  removeItem(key: string) { delete (this as unknown as Record<string, unknown>)[key] }

  clear() { Object.keys(this).forEach((key) => this.removeItem(key)) }
}


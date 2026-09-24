// JSON file cache (per deezerId) — makes rebuilds incremental so only new
// tracks cost API calls. Lives in tools/pool-builder/.cache (gitignored).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class JsonCache {
  constructor(private dir: string) {}

  private pathFor(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await readFile(this.pathFor(key), 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.pathFor(key), JSON.stringify(value));
  }
}
// How-to-play dismissal flags: per-mode "don't show again", localStorage-backed.
const KEY = 'deja:tune:howto:v1';

function read(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function write(v: Record<string, boolean>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* non-fatal */
  }
}

export function isHowtoDismissed(mode: string): boolean {
  return read()[mode] === true;
}

export function dismissHowto(mode: string): void {
  const m = read();
  m[mode] = true;
  write(m);
}

export function reopenHowto(mode: string): void {
  const m = read();
  delete m[mode];
  write(m);
}

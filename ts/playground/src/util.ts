export class LatestValue<T> {
  private resolvers: Array<(v: T) => void> = [];
  private current: Promise<T>;

  constructor() {
    this.current = new Promise(r => this.resolvers.push(r));
  }

  push() {
    this.current = new Promise(r => this.resolvers.push(r));
  }

  set(value: T): void {
    for (const resolve of this.resolvers.splice(0)) {
      resolve(value);
    }
    this.current = Promise.resolve(value);
  }

  get(): Promise<T> {
    return this.current;
  }
}

export function setHashFiles(files: Record<string, string>) {
  history.replaceState(null, "", "#" + encode(files));
}

export function getHashFiles(): Record<string, string> | null {
  const hash = window.location.hash.slice(1);
  if (!hash) {
    return null;
  }
  try {
    return decode(hash);
  } catch {
    return null;
  }
}

function encode(files: Record<string, string>): string {
  const str = JSON.stringify(files);
  const bytes = new TextEncoder().encode(str);
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join("");
  return btoa(binary);
}

function decode(b64: string): Record<string, string> {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const str = new TextDecoder().decode(bytes);
  return JSON.parse(str);
}

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

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
  return compressToEncodedURIComponent(JSON.stringify(files));
}

function decode(hash: string): Record<string, string> {
  return JSON.parse(decompressFromEncodedURIComponent(hash));
}

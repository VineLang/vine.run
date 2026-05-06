import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

export class PromiseMap<K, V> {
  private map: Map<K, Promise<V>>;
  private resolvers: Map<K, (value: V) => void>;

  constructor() {
    this.map = new Map();
    this.resolvers = new Map();
  }

  get(key: K): Promise<V> {
    const value = this.map.get(key);
    if (value) {
      return value;
    } else {
      const promise = new Promise<V>(resolve => this.resolvers.set(key, resolve));
      this.map.set(key, promise);
      return promise;
    }
  }

  set(key: K, value: V) {
    const resolve = this.resolvers.get(key);
    if (resolve) {
      resolve(value);
    } else {
      this.map.set(key, new Promise(r => r(value)));
    }
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

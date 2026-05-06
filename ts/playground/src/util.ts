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

export function setUrlHashContent(content: string) {
  history.replaceState(null, "", "#v" + encode(content));
}

export async function getUrlHashContent(): Promise<string | null> {
  const hash = window.location.hash.slice(1);
  if (!hash) {
    return null;
  }

  if (hash.startsWith("v")) {
    return decode(hash.slice(1));
  }

  const res = await fetch(`https://api.vine.run/${hash}`, {
    method: "GET",
  });

  return await res.text();
}

function encode(content: string): string {
  return compressToEncodedURIComponent(content);
}

function decode(hash: string): string {
  return decompressFromEncodedURIComponent(hash);
}

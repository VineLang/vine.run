import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

export class PromiseMap<K, V> {
  private map: Map<K, PromiseWithResolvers<V>>;

  constructor() {
    this.map = new Map();
  }

  get(key: K): Promise<V> {
    const pwr = this.map.get(key);
    if (pwr) {
      return pwr.promise;
    } else {
      const pwr = Promise.withResolvers<V>();
      this.map.set(key, pwr);
      return pwr.promise;
    }
  }

  set(key: K, value: V) {
    const pwr = this.map.get(key);
    if (pwr) {
      pwr.resolve(value);
    } else {
      const pwr = Promise.withResolvers<V>();
      pwr.resolve(value);
      this.map.set(key, pwr);
    }
  }
}

export function encodeUrlHashContent(content: string): string {
  return "#v" + encode(content);
}

export async function decodeUrlHashContent(): Promise<string | null> {
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

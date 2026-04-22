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

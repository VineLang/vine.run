type API = { [method: string]: (...args: any[]) => Promise<any> };

export const defineWorker = <T extends API>(api: T) => {
  self.postMessage(["init"]);
  self.addEventListener("message", async ({ data: [tag, id, method, args] }) => {
    if (tag != "req") return;
    api[method]!(...args).then(
      value => postMessage(["res", id, value]),
      value => postMessage(["rej", id, value]),
    );
  });
};

export type WebWorker<T> = T & { worker: Worker; terminate: () => void };

export const consumeWorker = <T extends API>(worker: Worker): WebWorker<T> => {
  let idN = 0;
  let initialize: (value: void) => void;
  const initialized = new Promise(r => initialize = r);
  const waiting = new Map();
  worker.addEventListener("message", ({ data: [tag, id, value] }) => {
    if (tag === "init") {
      initialize();
    }
    if (tag !== "res" && tag !== "rej") return;
    waiting.get(id)[tag](value);
    waiting.delete(id);
  });
  return new Proxy({
    worker,
    terminate() {
      worker.terminate();
    },
  } as any, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      return target[key] ??= (...args: any[]) => {
        let id = idN++;
        initialized.then(() => worker.postMessage(["req", id, key, args]));
        return new Promise((res, rej) => waiting.set(id, { res, rej }));
      };
    },
  });
};

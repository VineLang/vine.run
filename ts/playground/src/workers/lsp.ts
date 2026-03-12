import { init_console_log_tracing, PlaygroundLsp } from "../../playground-rs-pkg";
import { defineWorker } from "./lib.ts";

export type API = {
  send(msg: string): Promise<void>;
};

init_console_log_tracing();

const transport = new PlaygroundLsp().spawnServer((msg: string) => {
  self.postMessage(["lsp", msg]);
});

defineWorker<API>({
  async send(msg: string) {
    await transport.send(msg);
  },
});

import { init_console_log_tracing, PlaygroundBackend } from "../../playground-rs-pkg";
import { defineWorker } from "./lib.ts";

export type API = {
  sendLspMessage(msg: string): Promise<void>;
  debug(debug: boolean): Promise<void>;
  nets(): Promise<string | undefined>;
  format(code: string): Promise<string>;
};

export type Diag = {
  color: string | null;
  underline: boolean;
  bold: boolean;
  content: string;
};

init_console_log_tracing();

const backend = new PlaygroundBackend();

const transport = backend.spawnLspServer((msg: string) => {
  self.postMessage(["lsp", msg]);
}, (version: number, success: boolean, diagLines: Diag[][]) => {
  self.postMessage(["compiled", version, success, diagLines]);
});

defineWorker<API>({
  async sendLspMessage(msg: string) {
    await transport.send(msg);
  },
  async debug(debug: boolean) {
    await backend.debug(debug);
  },
  async nets(): Promise<string | undefined> {
    return backend.nets();
  },
  async format(code: string): Promise<string> {
    return backend.format(code);
  }
});

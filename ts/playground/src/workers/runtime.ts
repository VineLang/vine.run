import { init_console_log_tracing, PlaygroundRuntime } from "../../playground-rs-pkg";
import { defineWorker } from "./lib.ts";

export type API = {
  runNets(breadthFirst: boolean, nets: string): Promise<void>;
};

init_console_log_tracing();

defineWorker<API>({
  async runNets(breadthFirst: boolean, nets: string): Promise<void> {
    const runtime = new PlaygroundRuntime(breadthFirst);
    const flags = await runtime.runNets(nets, (stats: string, output: string) => {
      self.postMessage(["output", stats, output]);
    });
    self.postMessage(["flags", flags]);
  },
});

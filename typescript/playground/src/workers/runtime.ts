import { init_console_log_tracing, PlaygroundRuntime } from "../../playground-rs-pkg";
import { defineWorker } from "./lib.ts";

export type API = {
  runNets(breadthFirst: boolean, debugHint: boolean, nets: string): Promise<void>;
};

init_console_log_tracing();

defineWorker<API>({
  async runNets(breadthFirst: boolean, debugHint: boolean, nets: string): Promise<void> {
    const runtime = new PlaygroundRuntime();
    const start = Date.now();
    const elapsed = () => Date.now() - start;
    const inspect = (stats: string, output: string) => {
      self.postMessage(["output", { stats, output }]);
    };
    const flags = await runtime.runNets(breadthFirst, debugHint, nets, elapsed, inspect);
    if (flags.length > 0) {
      self.postMessage(["flags", { flags }]);
    }
  },
});

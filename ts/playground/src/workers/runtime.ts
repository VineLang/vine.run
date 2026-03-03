import { init_console_log_tracing, PlaygroundRuntime } from "../../../../rust/playground/pkg";
import { defineWorker } from "./lib.ts";

export type API = {
  runNets(breadthFirst: boolean, nets: string): Promise<void>;
};

init_console_log_tracing();

defineWorker<API>({
  async runNets(breadthFirst: boolean, nets: string): Promise<void> {
    const runtime = new PlaygroundRuntime(breadthFirst);
    runtime.runNets(nets, (stats: string, output: string) => {
      self.postMessage(["output", stats, output]);
    });
  },
});

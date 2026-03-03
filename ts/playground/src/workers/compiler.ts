import { init_console_log_tracing, PlaygroundCompiler } from "../../../../rust/playground/pkg";
import { defineWorker } from "./lib.ts";

export type API = {
  compileRoot(): Promise<void>;
  compileFiles(files: Record<string, string>): Promise<string | undefined>;
  diags(): Promise<Diag[][]>;
};

export type Diag = {
  color: string | null;
  underline: boolean;
  bold: boolean;
  content: string;
};

init_console_log_tracing();

const compiler = new PlaygroundCompiler();

defineWorker<API>({
  async compileRoot() {
    compiler.compileRoot();
  },

  async compileFiles(files: Record<string, string>): Promise<string | undefined> {
    return compiler.compileFiles(files);
  },

  async diags(): Promise<Diag[][]> {
    return compiler.diags();
  },
});

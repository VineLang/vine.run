import { Console } from "./console.ts";
import { Editor } from "./editor.ts";
import { type API as Compiler } from "./workers/compiler.ts";
import { consumeWorker, type WebWorker } from "./workers/lib.ts";
import { type API as Runtime } from "./workers/runtime.ts";

class Playground {
  examples: HTMLSelectElement;
  runButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  breadthFirst: HTMLInputElement;

  editor: Editor;
  console: Console;
  compiler: WebWorker<Compiler>;
  runtime?: WebWorker<Runtime>;

  constructor() {
    this.examples = document.querySelector("#examples")!;
    this.runButton = this.createActionButton("Run", "Ctrl/Cmd+Enter", () => this.run());
    this.stopButton = this.createActionButton("Stop", "Ctrl/Cmd+X", () => this.stop());
    this.breadthFirst = document.querySelector("#breadthFirst")!;

    this.editor = new Editor(document.querySelector("#editor")!);

    this.console = new Console({
      console: document.querySelector("#console")!,
      diagnostics: document.querySelector("#diagnostics")!,
      statistics: document.querySelector("#statistics")!,
      output: document.querySelector("#output")!,
    });

    this.compiler = consumeWorker(
      new Worker(new URL("./workers/compiler.ts", import.meta.url), {
        type: "module",
      }),
    );
  }

  async initialize() {
    await this.editor.initialize();

    this.examples.value = "";
    this.examples.addEventListener("change", (event: Event) => {
      const example = event.target as HTMLSelectElement;
      if (example.value) {
        this.editor.load(example.value);
        this.examples.value = "";
      }
    });

    this.breadthFirst.disabled = true;
    this.setButton(this.runButton, false);

    this.console.showLoading("compiling root...");
    await this.compiler.compileRoot();
    this.console.clear();

    this.breadthFirst.disabled = false;
    this.setButton(this.runButton, true);

    document.addEventListener("keydown", (event) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.key == "Enter") {
        event.preventDefault();
        this.runButton.click();
      }
      if (ctrl && event.key == "\\") {
        event.preventDefault();
        this.stopButton.click();
      }
    }, true);
  }

  async run() {
    this.stop();

    this.console.clear();
    this.breadthFirst.disabled = true;
    this.setButton(this.runButton, false);

    const nets = await this.compiler.compileFiles(this.editor.files());
    const diags = await this.compiler.diags();
    this.console.showDiagnostics(diags);

    this.setButton(this.stopButton, true);

    if (nets) {
      await this.runtime!.runNets(this.breadthFirst.checked, nets);
      this.runtime!.terminate();
      this.runtime = undefined;
    }

    this.breadthFirst.disabled = false;
    this.setButton(this.runButton, true);
  }

  stop() {
    this.setButton(this.stopButton, false);

    if (this.runtime) {
      this.runtime.terminate();
      this.console.showTerminated();
    }

    this.runtime = consumeWorker(
      new Worker(new URL("./workers/runtime.ts", import.meta.url), {
        type: "module",
      }),
    );
    this.runtime.worker.addEventListener("message", ({ data: [tag, stats, output] }) => {
      if (tag === "output") {
        this.console.showStatistics(stats);
        this.console.appendOutput(output);
      }
    });

    this.breadthFirst.disabled = false;
    this.setButton(this.runButton, true);
  }

  setButton(button: HTMLButtonElement, enabled: boolean) {
    button.disabled = !enabled;
    document.getElementById("action")!.replaceWith(button);
  }

  createActionButton(label: string, tooltip: string, onclick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.id = "action";
    button.innerText = label;
    button.title = tooltip;
    button.addEventListener("click", onclick);
    return button;
  }
}

const playground = new Playground();
playground.initialize();

import { Console } from "./console.ts";
import { Editor } from "./editor.ts";
import { type API as Compiler } from "./workers/compiler.ts";
import { consumeWorker, type WebWorker } from "./workers/lib.ts";
import { type API as Runtime } from "./workers/runtime.ts";

const SHARE_VERSION = 0;

class Playground {
  examples: HTMLSelectElement;
  breadthFirst: HTMLInputElement;
  debug: HTMLInputElement;
  runButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  shareButton: HTMLButtonElement;

  editor: Editor;
  console: Console;
  compiler: WebWorker<Compiler>;
  runtime?: WebWorker<Runtime>;
  runId: number;

  constructor() {
    this.examples = document.querySelector("#examples")!;
    this.breadthFirst = document.querySelector("#breadthFirst")!;
    this.debug = document.querySelector("#debug")!;
    this.runButton = this.createActionButton("Run", "Ctrl/Cmd+Enter", () => this.run());
    this.stopButton = this.createActionButton("Stop", "Ctrl/Cmd+\\", () => this.stop());
    this.shareButton = document.querySelector("#share")!;

    this.editor = new Editor(
      document.querySelector("#editor")!,
      (diags) => this.console.showDiagnostics(diags),
    );
    this.console = new Console({
      console: document.querySelector("#console")!,
      diagnostics: document.querySelector("#diagnostics")!,
      output: document.querySelector("#output")!,
      statistics: document.querySelector("#statistics")!,
    });
    this.compiler = consumeWorker(
      new Worker(new URL("./workers/compiler.ts", import.meta.url), {
        type: "module",
      }),
    );
    this.runId = 0;
  }

  async initialize() {
    await this.editor.initialize();
    this.initExamples();
    await this.compileRoot();
    this.addKeyEvents();
    this.initControls();
  }

  initExamples() {
    this.examples.value = "";
    this.examples.addEventListener("change", (event: Event) => {
      const example = event.target as HTMLSelectElement;
      if (example.value) {
        this.editor.load(example.value);
        this.examples.value = "";
      }
    });
  }

  async compileRoot() {
    this.console.showLoading("Compiling root...");
    const start = performance.now();
    await this.compiler.compileRoot();
    const end = performance.now();
    const elapsed = ((end - start) / 1000).toFixed(2);
    this.console.showLoading(`Compiled root in ${elapsed} seconds.`);
  }

  addKeyEvents() {
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
    this.console.clear();
    this.console.showLoading("Compiling playground...");
    const files = this.editor.files();
    const runId = ++this.runId;

    const nets = await this.compiler.compileFiles(this.debug.checked, files);
    const diags = await this.compiler.diags();

    this.stop();
    this.setStopControls();
    this.console.showDiagnostics(diags);

    if (nets && runId === this.runId) {
      this.newRuntime();
      await this.runtime!.runNets(!this.debug.checked, this.breadthFirst.checked, nets);
      this.runtime!.terminate();
      this.runtime = undefined;
    }

    this.setRunControls();
  }

  stop() {
    if (this.runtime) {
      this.runtime.terminate();
      this.runtime = undefined;
      this.console.showTerminated();
    }

    this.setRunControls();
  }

  newRuntime() {
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
      if (tag === "flags") {
        this.console.showFlags(stats);
      }
    });
  }

  createActionButton(label: string, tooltip: string, onclick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.id = "action";
    button.innerText = label;
    button.title = tooltip;
    button.addEventListener("click", onclick);
    return button;
  }

  setButton(button: HTMLButtonElement) {
    document.getElementById("action")!.replaceWith(button);
  }

  initControls() {
    document.querySelector<HTMLDivElement>("#controls")!.style.visibility = "visible";
    this.setRunControls();
    this.shareButton.addEventListener("click", async () => {
      const content = this.editor.files().play;
      const body = `${SHARE_VERSION}\n${content}`;
      const { key: _ } = await fetch("https://api.vine.run", {
        method: "POST",
        headers: { "Vine-Play": "1" },
        body,
      }).then(res => res.json());
    });
  }

  setRunControls() {
    this.breadthFirst.disabled = false;
    this.debug.disabled = false;
    this.setButton(this.runButton);
  }

  setStopControls() {
    this.breadthFirst.disabled = true;
    this.debug.disabled = true;
    this.setButton(this.stopButton);
  }
}

const playground = new Playground();
playground.initialize();

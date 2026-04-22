import { Console } from "./console.ts";
import { Editor } from "./editor.ts";
import { LatestValue } from "./util.ts";
import { type API as Backend } from "./workers/backend.ts";
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

  backend: WebWorker<Backend>;
  runtime?: WebWorker<Runtime>;

  compiled: LatestValue<boolean>;
  runId: number;

  editor: Editor;
  console: Console;

  constructor() {
    this.examples = document.querySelector("#examples")!;
    this.breadthFirst = document.querySelector("#breadthFirst")!;
    this.debug = document.querySelector("#debug")!;
    this.runButton = this.createActionButton("Run", "Ctrl/Cmd+Enter", () => this.run());
    this.stopButton = this.createActionButton("Stop", "Ctrl/Cmd+\\", () => this.stop());
    this.shareButton = document.querySelector("#share")!;

    this.backend = consumeWorker(
      new Worker(new URL("./workers/backend.ts", import.meta.url), {
        type: "module",
      }),
    );

    this.compiled = new LatestValue();
    this.runId = 0;

    this.editor = new Editor(
      document.querySelector("#editor")!,
      this.backend,
      () => this.onChange(),
    );
    this.console = new Console({
      console: document.querySelector("#console")!,
      diagnostics: document.querySelector("#diagnostics")!,
      output: document.querySelector("#output")!,
      statistics: document.querySelector("#statistics")!,
    });
  }

  async initialize() {
    await this.editor.initialize(), this.initExamples();
    this.initEventListeners();
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

  initEventListeners() {
    this.backend.worker.addEventListener("message", ({ data: [tag, success, diags] }) => {
      if (tag === "compiled") {
        this.runButton.disabled = !success;
        this.console.showDiagnostics(diags);
        this.compiled.set(success);
        document.querySelector("body")!.classList.toggle("progress", false);
      }
    });

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

  initControls() {
    document.querySelector<HTMLDivElement>("#controls")!.style.visibility = "visible";
    this.setRunControls();

    this.debug.addEventListener("click", async () => {
      // Force recompilation of playground file(s) with debug enabled/disabled.
      await this.backend.debug(this.debug.checked);
      this.editor.didChange();
    });

    this.shareButton.addEventListener("click", async () => {
      const content = this.editor.content();
      const body = `${SHARE_VERSION}\n${content}`;
      const { key: _ } = await fetch("https://api.vine.run", {
        method: "POST",
        headers: { "Vine-Play": "1" },
        body,
      }).then(res => res.json());
    });
  }

  onChange() {
    this.compiled.push();
    document.querySelector("body")!.classList.toggle("progress", true);
  }

  async run() {
    this.editor.lsp.client.sync();

    if (!await this.compiled.get()) {
      return;
    }

    this.console.clear();
    const runId = ++this.runId;

    const nets = await this.backend.nets();

    if (nets && runId === this.runId) {
      this.stop();
      this.setStopControls();
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

  setRunControls() {
    this.breadthFirst.disabled = false;
    this.debug.disabled = false;
    document.getElementById("action")!.replaceWith(this.runButton);
  }

  setStopControls() {
    this.breadthFirst.disabled = true;
    this.debug.disabled = true;
    document.getElementById("action")!.replaceWith(this.stopButton);
  }
}

const playground = new Playground();
playground.initialize();

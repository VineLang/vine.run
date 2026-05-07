import { Console } from "./console.ts";
import { Editor } from "./editor.ts";
import { getUrlHashContent, PromiseMap, setUrlHashContent } from "./util.ts";
import { type API as Backend } from "./workers/backend.ts";
import { consumeWorker, type WebWorker } from "./workers/lib.ts";
import { type API as Runtime } from "./workers/runtime.ts";

class Playground {
  backend: WebWorker<Backend>;
  runtime?: WebWorker<Runtime>;

  compiled: PromiseMap<number, boolean>;
  runId: number;
  pendingSync: number | null;

  examples: HTMLSelectElement;
  breadthFirst: HTMLInputElement;
  debug: HTMLInputElement;
  runButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  shareButton: HTMLButtonElement;

  editor: Editor;
  console: Console;

  constructor() {
    this.backend = consumeWorker(
      new Worker(new URL("./workers/backend.ts", import.meta.url), {
        type: "module",
      }),
    );

    this.compiled = new PromiseMap();
    this.runId = 0;
    this.pendingSync = null;

    this.examples = document.querySelector("#examples")!;
    this.breadthFirst = document.querySelector("#breadthFirst")!;
    this.debug = document.querySelector("#debug")!;
    this.runButton = this.createActionButton("Run", "Ctrl/Cmd+Enter", () => this.run());
    this.stopButton = this.createActionButton("Stop", "Ctrl/Cmd+\\", () => this.stop());
    this.shareButton = document.querySelector("#share")!;

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
    await this.initEditor();
    this.initExamples();
    this.initEventListeners();
    this.initControls();
  }

  async initEditor() {
    await this.editor.initialize();
    try {
      this.editor.loadVersionedContent((await getUrlHashContent())!);
    } catch (error) {
      console.warn("Failed to load content from hash, loading hello world:", error);
      this.editor.loadExample("hello_world");
    }
  }

  initExamples() {
    this.examples.value = "";
    this.examples.addEventListener("change", (event: Event) => {
      const example = event.target as HTMLSelectElement;
      if (example.value) {
        this.editor.loadExample(example.value);
        this.examples.value = "";
      }
    });
  }

  initEventListeners() {
    this.backend.worker.addEventListener("message", ({ data: [tag, version, success, diags] }) => {
      if (tag === "compiled") {
        this.console.showDiagnostics(diags);
        this.compiled.set(version, success);
        document.querySelector("body")!.classList.remove("progress");
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
    this.setRunControls();

    this.debug.addEventListener("click", async () => {
      // Force recompilation of playground file(s) with debug enabled/disabled.
      await this.backend.debug(this.debug.checked);
      this.editor.sync();
    });

    this.shareButton.addEventListener("click", async () => {
      this.shareButton.disabled = true;
      this.shareButton.classList.add("sharing");

      const content = this.editor.versionedContent();
      const { key } = await fetch("https://api.vine.run", {
        method: "POST",
        headers: { "Vine-Play": "1" },
        body: content,
      }).then(res => res.json());
      const url = `${window.location.origin}${window.location.pathname}#${key}`;
      await navigator.clipboard.writeText(url);

      this.shareButton.innerText = "Copied!";
      this.shareButton.classList.remove("sharing");
      setTimeout(() => {
        this.shareButton.innerText = "Share";
        this.shareButton.disabled = false;
      }, 3000);
    });
  }

  onChange() {
    setUrlHashContent(this.editor.versionedContent());

    if (this.pendingSync !== null) {
      clearTimeout(this.pendingSync);
    }
    this.pendingSync = setTimeout(() => {
      this.pendingSync = null;
      document.querySelector("body")!.classList.add("progress");
      this.editor.sync();
    }, 100);
  }

  async run() {
    // TODO(enricozb): only handles single file
    const version = this.editor.lsp!.client.workspace.files[0].version;
    if (!await this.compiled.get(version)) {
      return;
    }

    this.console.clear();
    const runId = ++this.runId;

    const nets = await this.backend.nets();

    if (nets && runId === this.runId) {
      this.stop();
      this.setStopControls();
      this.newRuntime();
      await this.runtime!.runNets(this.breadthFirst.checked, !this.debug.checked, nets);
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
    this.runtime.worker.addEventListener("message", ({ data: [tag, message] }) => {
      if (tag === "output") {
        this.console.showStatistics(message.stats);
        this.console.appendOutput(message.output);
      }
      if (tag === "flags") {
        this.console.showFlags(message.flags);
      }
    });
  }

  createActionButton(label: string, tooltip: string, onclick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.id = "action";
    button.innerText = label;
    button.title = tooltip;
    button.addEventListener("click", onclick);
    button.classList.add(label.toLowerCase());
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

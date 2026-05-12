import { Console } from "./console.ts";
import { Editor } from "./editor.ts";
import { decodeUrlHashContent, encodeUrlHashContent, PromiseMap } from "./util.ts";
import { type API as Backend } from "./workers/backend.ts";
import { consumeWorker, type WebWorker } from "./workers/lib.ts";
import { type API as Runtime } from "./workers/runtime.ts";

class Playground {
  backend: WebWorker<Backend>;
  runtime?: WebWorker<Runtime>;

  compiled: PromiseMap<number, boolean>;
  runId: number;
  pendingSync: number | null;
  inPopState: boolean;

  examples: HTMLButtonElement;
  breadthFirst: HTMLInputElement;
  debug: HTMLInputElement;
  formatButton: HTMLButtonElement;
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
    this.inPopState = false;

    this.examples = document.querySelector("#examples")!;
    this.breadthFirst = document.querySelector("#breadthFirst")!;
    this.debug = document.querySelector("#debug")!;
    this.formatButton = document.querySelector("#format")!;
    this.runButton = document.querySelector("#run")!;
    this.stopButton = document.querySelector("#stop")!;
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
      this.editor.loadVersionedContent((await decodeUrlHashContent())!);
    } catch (error) {
      console.warn("Failed to load content from hash, loading hello world:", error);
      this.editor.loadExample("hello_world");
    }
  }

  initExamples() {
    this.examples.querySelectorAll("[value]").forEach(el => el.addEventListener("click", () => {
      this.editor.loadExample(el.getAttribute("value")!);
    }));
  }

  initEventListeners() {
    this.backend.worker.addEventListener("message", ({ data: [tag, version, success, diags] }) => {
      if (tag === "compiled") {
        this.console.showDiagnostics(diags);
        this.compiled.set(version, success);
        document.querySelector("body")!.classList.remove("progress");
      }
    });

    window.addEventListener("popstate", async (event) => {
      this.inPopState = true;
      this.editor.loadVersionedContent((await decodeUrlHashContent())!);
      this.editor.setSelection(event.state.selection);
      this.inPopState = false;
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
    this.setRunning(false);

    this.formatButton.addEventListener("click", () => this.format());

    this.runButton.addEventListener("click", () => this.run());
    this.stopButton.addEventListener("click", () => this.stop());
    console.warn(this.runButton, this.stopButton)

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

      this.shareButton.classList.remove("sharing");
      this.shareButton.classList.add("shared");
      await new Promise(r => setTimeout(r, 1000));
      this.shareButton.classList.remove("shared");
      this.shareButton.disabled = false;
    });
  }

  updateState(hash: string, action: "edit" | "run") {
    if (!this.inPopState && history.state?.action === "run" && action == "edit") {
      history.pushState(history.state, "", window.location.hash);
    }

    const selection = this.editor.getSelection();
    history.replaceState({ action, selection }, "", hash);
  }

  onChange() {
    const hash = encodeUrlHashContent(this.editor.versionedContent());
    this.updateState(hash, "edit");

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
    this.updateState(window.location.hash, "run");

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
      this.setRunning(true);
      this.newRuntime();
      await this.runtime!.runNets(this.breadthFirst.checked, !this.debug.checked, nets);
      this.runtime!.terminate();
      this.runtime = undefined;
    }

    this.setRunning(false);
  }

  stop() {
    if (this.runtime) {
      this.runtime.terminate();
      this.runtime = undefined;
      this.console.showTerminated();
    }

    this.setRunning(false);
  }

  async format() {
    this.formatButton.disabled = true;
    const code = await this.backend.format(this.editor.content());
    this.editor.load(code, true);
    this.formatButton.classList.add("on");
    await new Promise(r => setTimeout(r, 1000));
    this.formatButton.classList.remove("on");
    this.formatButton.disabled = false;
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

  setRunning(running: boolean) {
    this.breadthFirst.disabled = running;
    this.debug.disabled = running;
    this.runButton.disabled = running;
    this.runButton.classList.toggle("on", running);
    this.stopButton.disabled = !running;
  }
}

const playground = new Playground();
playground.initialize();

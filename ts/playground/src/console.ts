import { type Diag } from "./workers/backend.ts";

export type ConsoleElements = Pick<
  Console,
  "console" | "diagnostics" | "statistics" | "output"
>;

export class Console {
  console: HTMLElement;
  diagnostics: HTMLElement;
  output: HTMLElement;
  statistics: HTMLElement;
  containers: HTMLElement[];

  constructor(elements: ConsoleElements) {
    this.console = elements.console;
    this.diagnostics = elements.diagnostics;
    this.output = elements.output;
    this.statistics = elements.statistics;

    this.containers = [...this.console.querySelectorAll<HTMLElement>(".container")];

    for (const container of this.containers) {
      const header = container.querySelector("h3")!;
      const body = container.querySelector("pre")!;
      header.addEventListener("click", () => {
        const hidden = container.classList.contains("hide");
        if (hidden) {
          this.update(() => container.classList.remove("hide"));
        }

        const i = container.style.getPropertyValue("--console-i");
        this.console.style.setProperty("--console-i", i);
        const prevTop = this.console.scrollTop;
        body.scrollIntoView();

        if (!hidden && this.console.scrollTop == prevTop) {
          this.update(() => container.classList.add("hide"));
        }
      });
    }
  }

  clear() {
    this.update(() => {
      this.diagnostics.textContent = "";
      this.statistics.textContent = "";
      this.output.textContent = "";
    });
  }

  showLoading(content: string) {
    this.showDiagnostics([[{
      color: null,
      bold: false,
      underline: false,
      content,
    }]]);
  }

  showCompiled() {
    this.update(() => {
      const span = document.createElement("span");
      span.textContent = "Compiled, and ready to run.";
      this.diagnostics.replaceChildren(span);
    });
  }

  showDiagnostics(diag_lines: Diag[][]) {
    this.update(() => {
      this.diagnostics.textContent = "";
      if (diag_lines.length > 0) {
        for (const diag_spans of diag_lines) {
          for (const diag_span of diag_spans) {
            const span = document.createElement("span");
            if (diag_span.color != null) {
              span.classList.add(diag_span.color);
            }
            if (diag_span.underline) {
              span.classList.add("underline");
            }
            if (diag_span.bold) {
              span.classList.add("bold");
            }
            span.textContent = diag_span.content;
            this.diagnostics.appendChild(span);
          }
          this.diagnostics.appendChild(document.createElement("br"));
        }
        while (this.diagnostics.lastChild?.nodeName === "BR") {
          this.diagnostics.removeChild(this.diagnostics.lastChild);
        }
      }
    });
  }

  showFlags(flags: string) {
    this.update(() => {
      this.statistics.prepend(flags + "\n\n");
    });
  }

  showStatistics(stats: string) {
    this.update(() => {
      this.statistics.textContent = stats.trim();
    });
  }

  showTerminated() {
    this.update(() => {
      this.statistics.append("\n\n(terminated)");
    });
  }

  appendOutput(output: string) {
    this.update(() => this.output.append(output));
  }

  update(cb: () => void) {
    const atBottom =
      this.console.scrollTop + this.console.clientHeight + 1 >= this.console.scrollHeight;
    cb();
    this.updateContainers();
    if (atBottom) {
      this.console.scrollTo(0, this.console.scrollHeight);
    }
  }

  updateContainers() {
    let i = 0;
    let first = true;
    for (const container of this.containers) {
      const empty = container.querySelector("code:empty") != null;
      container.classList.toggle("empty", empty);
      if (empty) continue;
      container.style.setProperty("--console-i", `${i++}`);
      container.classList.toggle("first", first);
      first = false;
    }
    this.console.style.setProperty("--console-n", `${i}`);
  }
}

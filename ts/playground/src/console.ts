import { type Diag } from "./workers/compiler.ts";

export type ConsoleElements = Pick<Console, "console" | "diagnostics" | "statistics" | "output">;

export class Console {
  console: HTMLElement;
  diagnostics: HTMLElement;
  output: HTMLElement;
  statistics: HTMLElement;
  containers: Element[]

  constructor(elements: ConsoleElements) {
    this.console = elements.console;
    this.diagnostics = elements.diagnostics;
    this.output = elements.output;
    this.statistics = elements.statistics;

   this.containers = [...this.console.querySelectorAll(".container")];

    for (const container of this.containers) {
      container.querySelector("h3")!.addEventListener("click", () => {
        this.update(() => {
          container.classList.toggle("hide");
        });
      });
    }
  }

  showLoading(message: string) {
    this.diagnostics.textContent = `${message}`;
  }

  clear() {
    this.diagnostics.textContent = "";
    this.statistics.textContent = "";
    this.output.textContent = "";
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
    if (atBottom) {
      this.console.scrollTo(0, this.console.scrollHeight);
    }
    for (const container of this.containers) {
      container.classList.toggle("empty", container.querySelector("code:empty") != null);
    }
  }
}

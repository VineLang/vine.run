import { type Diag } from "./workers/compiler.ts";

export type ConsoleHTMLElements = {
  diagnostics: HTMLDivElement;
  statistics: HTMLElement;
  output: HTMLElement;
};

export class Console {
  elements: ConsoleHTMLElements;

  constructor(elements: ConsoleHTMLElements) {
    this.elements = elements;
  }

  showLoading(message: string) {
    this.elements.diagnostics.innerHTML = `<p>${message}</p>`;
  }

  clear() {
    this.elements.diagnostics.innerHTML = "";
    this.elements.statistics.innerHTML = "";
    this.elements.output.innerHTML = "";
  }

  showDiagnostics(diag_lines: Diag[][]) {
    if (diag_lines.length == 0) {
      this.elements.diagnostics.innerHTML = "<p>No errors or warnings!</p>";
    } else {
      this.elements.diagnostics.innerHTML = diag_lines.map((diag_spans) => {
        const spans = diag_spans.map(diag_span => {
          const classes = [diag_span.color];
          if (diag_span.underline) {
            classes.push("underline");
          }
          if (diag_span.bold) {
            classes.push("bold");
          }
          const content = diag_span.content.replace(" ", "&nbsp;");
          return `<span class="${classes.join(" ")}">${content}</span>`;
        }).join("");
        return `<p>${spans || "&nbsp;"}</p>`;
      }).join("\n");
    }
  }

  showStatistics(stats: string) {
    this.elements.statistics.innerHTML = stats.trim();
  }

  showTerminated() {
    this.elements.statistics.innerHTML += "\n\n(terminated)";
  }

  appendOutput(output: string) {
    this.elements.output.innerHTML += output;
  }
}

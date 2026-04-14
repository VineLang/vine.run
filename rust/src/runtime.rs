use ivy::{optimize::Optimizer, parser::Parser, run::Run};
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

#[wasm_bindgen]
pub struct PlaygroundRuntime {
  breadth_first: bool,
}

#[wasm_bindgen]
impl PlaygroundRuntime {
  #[wasm_bindgen(constructor)]
  pub fn new(breadth_first: bool) -> Self {
    Self { breadth_first }
  }

  #[wasm_bindgen(js_name = runNets)]
  pub fn run_nets(self, nets: String, inspect_fn: &js_sys::Function) -> String {
    self._run_nets(nets, inspect_fn)
  }

  #[tracing::instrument(level = "trace", skip_all, ret)]
  fn _run_nets(self, nets: String, inspect_fn: &js_sys::Function) -> String {
    let mut nets = Parser::parse(&nets).unwrap();
    Optimizer::default().optimize(&mut nets, &[]);
    Run { breadth_first: self.breadth_first, ..Run::default() }
      .inspect(
        &nets,
        |stats, output| {
          let output = String::from_utf8_lossy(&output).into_owned();
          let stats = stats.to_string();
          inspect_fn
            .call2(
              &JsValue::NULL,
              &serde_wasm_bindgen::to_value(&stats).unwrap(),
              &serde_wasm_bindgen::to_value(&output).unwrap(),
            )
            .unwrap();
        },
        100_000,
      )
      .error_message(true)
  }
}

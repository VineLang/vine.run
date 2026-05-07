use std::time::{Duration, Instant};

use ivm::{
  host::{Host, IVM},
  runtime::{
    Hooks,
    heap::Heap,
    runner::{CaptureOutput, Runner},
    stats::Stats,
  },
};
use ivy::{name::Table, text::parser::Parser};
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

#[wasm_bindgen]
pub struct PlaygroundRuntime;

#[wasm_bindgen]
impl PlaygroundRuntime {
  #[wasm_bindgen(constructor)]
  pub fn new() -> Self {
    Self
  }

  #[wasm_bindgen(js_name = runNets)]
  pub fn run_nets(
    self,
    breadth_first: bool,
    debug_hint: bool,
    nets: String,
    elapsed: &js_sys::Function,
    inspect: &js_sys::Function,
  ) -> String {
    self._run_nets(breadth_first, debug_hint, nets, elapsed, inspect)
  }

  #[tracing::instrument(level = "trace", skip(self, nets, inspect), ret)]
  fn _run_nets(
    self,
    breadth_first: bool,
    debug_hint: bool,
    nets: String,
    elapsed: &js_sys::Function,
    inspect: &js_sys::Function,
  ) -> String {
    let table = &mut Table::default();
    let nets = Parser::parse(table, &nets).unwrap().to_flat_nets().unwrap();

    let capture = CaptureOutput::default();
    let mut heap = Heap::new();
    let mut ivm = IVM::new();

    let (stats, flags) = {
      let mut host = Host::new(&mut ivm);
      let extrinsics = capture.extrinsics(&[]);
      let runner = Runner::new(&mut heap, &mut host, extrinsics, table, &nets);
      let hooks = PlaygroundRuntimeHooks { capture: &capture, elapsed, inspect, interactions: 0 };

      runner.normalize(breadth_first, 0, hooks)
    };

    let output = capture.into_output();
    let output = String::from_utf8_lossy(&output).into_owned();

    inspect
      .call2(
        &JsValue::NULL,
        &serde_wasm_bindgen::to_value(&stats.to_string()).unwrap(),
        &serde_wasm_bindgen::to_value(&output).unwrap(),
      )
      .unwrap();

    flags.error_message(debug_hint)
  }
}

/// The frequency (in number of interactions) to update stats and output.
const INTERACTIONS_TICK: u64 = 123_456;

struct PlaygroundRuntimeHooks<'a> {
  capture: &'a CaptureOutput,
  elapsed: &'a js_sys::Function,
  inspect: &'a js_sys::Function,
  interactions: u64,
}

impl Hooks for PlaygroundRuntimeHooks<'_> {
  fn start(&mut self) -> Option<Instant> {
    None
  }

  fn tick(&mut self, stats: &mut Stats) {
    let interactions = stats.interactions();
    if interactions - self.interactions < INTERACTIONS_TICK {
      return;
    }

    self.interactions = interactions;

    let elapsed = self.elapsed.call0(&JsValue::NULL).unwrap();
    let elapsed = serde_wasm_bindgen::from_value(elapsed).unwrap();
    stats.time_clock = Duration::from_millis(elapsed);

    let stats = stats.to_string();
    let output = self.capture.output.lock().unwrap().drain(..).collect();
    let output = String::from_utf8(output).unwrap();
    self
      .inspect
      .call2(
        &JsValue::NULL,
        &serde_wasm_bindgen::to_value(&stats.to_string()).unwrap(),
        &serde_wasm_bindgen::to_value(&output).unwrap(),
      )
      .unwrap();
  }
}

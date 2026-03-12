mod compiler;
mod fs;
mod log;
mod lsp;
mod runtime;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::log::ConsoleLayer;

#[wasm_bindgen]
pub fn init_console_log_tracing() {
  console_error_panic_hook::set_once();
  let _ = tracing_subscriber::registry().with(ConsoleLayer).try_init();
}

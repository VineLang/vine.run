use std::fmt::Debug;

use tracing::{
  Event, Level, Subscriber,
  field::{Field, Visit},
};
use tracing_subscriber::{Layer, layer::Context, registry::LookupSpan};
use web_sys::console::{debug_1, error_1, info_1, log_1, warn_1};

pub struct ConsoleLayer;
struct DebugVisitor(Vec<String>);

impl Visit for DebugVisitor {
  fn record_debug(&mut self, field: &Field, value: &dyn Debug) {
    self.0.push(format!("{}={value:?}", field.name()));
  }
}

impl<S> Layer<S> for ConsoleLayer
where
  S: Subscriber + for<'a> LookupSpan<'a>,
{
  fn on_event(&self, event: &Event<'_>, ctx: Context<'_, S>) {
    let scope = ctx.event_scope(event);
    let span_path = scope
      .map(|scope| {
        scope
          .from_root()
          .map(|s| {
            let meta = s.metadata();
            format!("{}::{}", meta.target(), meta.name())
          })
          .collect::<Vec<_>>()
          .join(" -> ")
      })
      .unwrap_or_default();

    let mut debug = DebugVisitor(vec![span_path]);
    event.record(&mut debug);
    let msg = debug.0.join(" ");

    match *event.metadata().level() {
      Level::ERROR => error_1(&msg.into()),
      Level::WARN => warn_1(&msg.into()),
      Level::INFO => info_1(&msg.into()),
      Level::DEBUG => log_1(&msg.into()),
      Level::TRACE => debug_1(&msg.into()),
    }
  }
}

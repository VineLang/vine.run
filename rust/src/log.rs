use std::fmt::Debug;

use tracing::{
  Event, Level, Subscriber,
  field::{Field, Visit},
  span::{Attributes, Id},
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

struct SpanFields(Vec<String>);

impl<S> Layer<S> for ConsoleLayer
where
  S: Subscriber + for<'a> LookupSpan<'a>,
{
  fn on_new_span(&self, attrs: &Attributes<'_>, id: &Id, ctx: Context<'_, S>) {
    let span = ctx.span(id).unwrap();
    let mut visitor = DebugVisitor(Vec::new());
    attrs.record(&mut visitor);
    span.extensions_mut().insert(SpanFields(visitor.0));
  }

  fn on_event(&self, event: &Event<'_>, ctx: Context<'_, S>) {
    let scope = ctx.event_scope(event);
    let mut parts = Vec::new();
    if let Some(scope) = scope {
      for span in scope.from_root() {
        let meta = span.metadata();
        let mut s = format!("{}::{}", meta.target(), meta.name());
        if let Some(fields) = span.extensions().get::<SpanFields>()
          && !fields.0.is_empty()
        {
          s.push(' ');
          s.push_str(&fields.0.join(" "));
        }
        parts.push(s);
      }
    }

    let mut debug = DebugVisitor(parts);
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

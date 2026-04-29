use std::sync::Arc;

use chrono::prelude::*;

use crate::proxy;

pub struct App {
    pub started_at: DateTime<Utc>,
    pub proxy_group: Arc<proxy::Group>,
}

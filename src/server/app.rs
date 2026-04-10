use std::sync::Arc;

use crate::proxy;

pub struct App {
    pub proxy_group: Arc<proxy::Group>,
}

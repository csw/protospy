use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, PartialEq, Debug, Clone, ts_rs::TS)]
pub enum Protocol {
    Elasticsearch,
    OpenSearch,
    Anthropic,
}

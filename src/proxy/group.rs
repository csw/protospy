use color_eyre::{Result, eyre::eyre};
use http::Uri;
use tokio::task::JoinSet;

use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use crate::{
    proxy::{
        Service, client::Client, monitor::Publisher, reporting::PublisherEventReporterService,
    },
    tokio_util,
};

#[derive(Clone, Debug)]
pub struct ServiceEntry {
    pub service: Arc<Service>,
    pub publisher: Publisher,
}

#[derive(Debug)]
pub struct Group {
    client: Client,
    pub services: Vec<ServiceEntry>,
    pub by_name: HashMap<String, ServiceEntry>,
}

impl Group {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            services: Vec::new(),
            by_name: HashMap::new(),
        }
    }

    pub fn add_service(&mut self, name: &str, addr: SocketAddr, target: &Uri) -> Result<()> {
        if self.by_name.contains_key(name) {
            return Err(eyre!("service {} already registered", name));
        }
        let publisher = Publisher::new();
        let pub_factory = Arc::new(PublisherEventReporterService::new(publisher.clone()));
        let service = Arc::new(Service::new(
            name.to_string(),
            addr,
            Self::normalize_uri(target)?,
            self.client.clone(),
            pub_factory,
        ));
        let entry = ServiceEntry { service, publisher };
        self.services.push(entry.clone());
        self.by_name.insert(name.to_string(), entry);
        Ok(())
    }

    /// Transform a user-specified URI to one with valid scheme and path.
    fn normalize_uri(spec: &Uri) -> Result<Uri> {
        let mut parts = spec.clone().into_parts();
        if parts.scheme.is_none() {
            parts.scheme = Some(http::uri::Scheme::HTTP);
        }
        if parts.path_and_query.is_none() {
            parts.path_and_query = Some(http::uri::PathAndQuery::from_static("/"))
        }
        Ok(Uri::from_parts(parts)?)
    }

    pub fn start_services(&self) -> Result<JoinSet<Result<()>>> {
        let mut join_set = JoinSet::new();
        for entry in &self.services {
            let service = Arc::clone(&entry.service);
            let task_name = format!("service({}) port={}", service.name, service.addr.port());
            tokio_util::spawn_instrumented_on(&mut join_set, &task_name, async move {
                service.run().await
            })?;
        }
        Ok(join_set)
    }

    pub fn get_service(&self, name: &str) -> Option<(Arc<Service>, Publisher)> {
        self.by_name
            .get(name)
            .map(|ServiceEntry { service, publisher }| (Arc::clone(service), publisher.clone()))
    }
}

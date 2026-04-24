use color_eyre::{Result, eyre::eyre};
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

    pub fn add_service(&mut self, name: &str, addr: SocketAddr, target: &str) -> Result<()> {
        if self.by_name.contains_key(name) {
            return Err(eyre!("service {} already registered", name));
        }
        let publisher = Publisher::new();
        let pub_factory = Arc::new(PublisherEventReporterService::new(publisher.clone()));
        let service = Arc::new(Service::new(
            name.to_string(),
            addr,
            target.to_string(),
            self.client.clone(),
            pub_factory,
        ));
        let entry = ServiceEntry { service, publisher };
        self.services.push(entry.clone());
        self.by_name.insert(name.to_string(), entry);
        Ok(())
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

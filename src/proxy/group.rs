use color_eyre::{Result, eyre::eyre};
use tokio::task::JoinSet;

use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use crate::{
    proxy::{Service, client::Client},
    tokio_util,
};

#[derive(Debug)]
pub struct Group {
    client: Client,
    services: Vec<Arc<Service>>,
    by_name: HashMap<String, Arc<Service>>,
}

impl Group {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            services: Vec::new(),
            by_name: HashMap::new(),
        }
    }

    pub fn add_service(
        &mut self,
        name: &str,
        addr: SocketAddr,
        target: &str,
    ) -> Result<Arc<Service>> {
        if self.by_name.contains_key(name) {
            return Err(eyre!("service {} already registered", name));
        }
        let svc = Arc::new(Service::new(
            name.to_string(),
            addr,
            target.to_string(),
            self.client.clone(),
        ));
        self.services.push(Arc::clone(&svc));
        self.by_name.insert(name.to_string(), Arc::clone(&svc));
        Ok(svc)
    }

    pub fn start_services(&self) -> Result<JoinSet<Result<()>>> {
        let mut join_set = JoinSet::new();
        for service in &self.services {
            let service = Arc::clone(service);
            let task_name = format!("service({}) port={}", service.name, service.addr.port());
            tokio_util::spawn_instrumented_on(&mut join_set, &task_name, async move {
                service.run().await
            })?;
        }
        Ok(join_set)
    }
}

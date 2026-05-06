use color_eyre::Result;
use figment::{
    Figment,
    providers::{Env, Serialized},
};
use http::Uri;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    net::{IpAddr, Ipv6Addr},
    path::PathBuf,
};

const LEVEL_SEPARATOR: &str = "__";

#[derive(Deserialize, Serialize, PartialEq, Debug)]
pub struct Config {
    /// Proxy definition
    pub proxy: HashMap<String, ProxyConfig>,
    pub listen_addr: IpAddr,
    pub listen_port: u16,
    #[serde(deserialize_with = "figment::util::bool_from_str_or_int")]
    pub tokio_console: bool,
    #[serde(deserialize_with = "figment::util::bool_from_str_or_int")]
    pub print_messages: bool,
    pub record_examples: Option<PathBuf>,
    #[serde(deserialize_with = "figment::util::bool_from_str_or_int")]
    pub web: bool,
}

#[derive(Deserialize, Serialize, PartialEq, Debug, Clone)]
pub struct ProxyConfig {
    #[serde(default = "ProxyConfig::default_addr")]
    pub addr: IpAddr,
    pub port: u16,
    #[serde(with = "http_serde::uri")]
    pub target: Uri,
}

impl Config {
    pub fn default() -> Self {
        Self {
            proxy: HashMap::new(),
            listen_addr: Ipv6Addr::UNSPECIFIED.into(),
            listen_port: 3100,
            tokio_console: false,
            print_messages: false,
            record_examples: None,
            web: true,
        }
    }

    pub fn from_env() -> Result<Self> {
        Ok(Figment::new()
            .merge(Serialized::defaults(Self::default()))
            .merge(Env::raw().split(LEVEL_SEPARATOR))
            .extract()?)
    }
}

impl ProxyConfig {
    fn default_addr() -> IpAddr {
        Ipv6Addr::UNSPECIFIED.into()
    }

    pub fn normalized_target(&self) -> Result<Uri> {
        normalize_uri(&self.target)
    }
}

/// Transform a user-specified URI to one with valid scheme and path.
pub fn normalize_uri(spec: &Uri) -> Result<Uri> {
    let mut parts = spec.clone().into_parts();
    if parts.scheme.is_none() {
        parts.scheme = Some(http::uri::Scheme::HTTP);
    }
    if parts.path_and_query.is_none() {
        parts.path_and_query = Some(http::uri::PathAndQuery::from_static("/"))
    }
    Ok(Uri::from_parts(parts)?)
}

#[cfg(test)]
mod tests {
    use std::{net::Ipv4Addr, str::FromStr};

    use eyre::eyre;
    use figment::Jail;
    use rstest::rstest;

    use super::*;

    #[test]
    fn test_default() {
        check_jail(|_jail| {
            assert_eq!(Config::from_env().unwrap(), Config::default());
        });
    }

    #[test]
    fn test_no_web() {
        check_jail(|jail| {
            jail.set_env("WEB", "0");
            let config = Config::from_env().unwrap();
            assert!(!config.web);
        });
    }

    #[test]
    fn test_top_level() -> Result<()> {
        check_config(
            r#"
            LISTEN_ADDR=127.0.0.1
            LISTEN_PORT=4096
            TOKIO_CONSOLE=1
            PRINT_MESSAGES=true
            RECORD_EXAMPLES=/tmp/examples
            WEB=0
        "#,
            |config| {
                assert_eq!(
                    config,
                    &Config {
                        proxy: Default::default(),
                        listen_addr: Ipv4Addr::new(127, 0, 0, 1).into(),
                        listen_port: 4096,
                        tokio_console: true,
                        print_messages: true,
                        record_examples: "/tmp/examples".parse().ok(),
                        web: false,
                    }
                )
            },
        )
    }

    #[test]
    fn test_proxies() -> Result<()> {
        check_config(
            r#"
            PROXY__FOO__ADDR=::1
            PROXY__FOO__PORT=9200
            PROXY__FOO__TARGET=mydb:9200
            PROXY__BAR__ADDR=1.2.3.4
            PROXY__BAR__PORT=80
            PROXY__BAR__TARGET=https://example.com/
            PROXY__BAZ__PORT=1600
            PROXY__BAZ__TARGET=https://other.com/
"#,
            |config| {
                assert_eq!(
                    config.proxy,
                    HashMap::from([
                        (
                            "foo".into(),
                            ProxyConfig {
                                addr: Ipv6Addr::LOCALHOST.into(),
                                port: 9200,
                                target: "mydb:9200".parse().unwrap(),
                            }
                        ),
                        (
                            "bar".into(),
                            ProxyConfig {
                                addr: "1.2.3.4".parse().unwrap(),
                                port: 80,
                                target: "https://example.com".parse().unwrap(),
                            }
                        ),
                        (
                            "baz".into(),
                            ProxyConfig {
                                // note that this is not configured and gets
                                // the default value
                                addr: Ipv6Addr::UNSPECIFIED.into(),
                                port: 1600,
                                target: "https://other.com".parse().unwrap(),
                            }
                        )
                    ])
                )
            },
        )
    }

    #[rstest]
    #[case("example.com", "http://example.com")]
    #[case("https://example.com:8000", "https://example.com:8000")]
    #[case("localhost:8000", "http://localhost:8000")]
    fn test_normalize_uri_ok(#[case] raw: Uri, #[case] expect: Uri) {
        let norm = normalize_uri(&raw).unwrap();
        assert_eq!(&norm, &expect);
    }

    struct EnvSpec(Vec<(String, String)>);

    impl EnvSpec {
        fn apply(&self, jail: &mut figment::Jail) {
            let Self(entries) = self;
            for (key, val) in entries {
                jail.set_env(key, val);
            }
        }
    }

    impl FromStr for EnvSpec {
        type Err = color_eyre::Report;

        fn from_str(s: &str) -> Result<Self, Self::Err> {
            let items: Result<Vec<_>, _> = s
                .split('\n')
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(|line| {
                    line.split_once('=')
                        .ok_or_else(|| eyre!("invalid env line: '{}'", line))
                        .map(|(k, v)| (k.into(), v.into()))
                })
                .collect();
            Ok(Self(items?))
        }
    }

    fn check_jail(fun: impl FnOnce(&mut Jail)) {
        #[allow(clippy::result_large_err)]
        figment::Jail::expect_with(|jail| {
            jail.clear_env();
            fun(jail);
            Ok(())
        })
    }

    fn check_env(spec: &str, fun: impl FnOnce(&mut figment::Jail)) -> Result<()> {
        let env_spec: EnvSpec = spec.parse()?;
        check_jail(|jail| {
            env_spec.apply(jail);
            fun(jail)
        });
        Ok(())
    }

    fn check_config(spec: &str, fun: impl FnOnce(&Config)) -> Result<()> {
        check_env(spec, |_| {
            let config = Config::from_env().unwrap();
            fun(&config)
        })
    }
}

//! Tool-free model comparisons using the user's saved provider credentials.
use std::{collections::HashMap, sync::Arc, time::Duration};

use aionui_api_types::{ModelBenchModel, ModelBenchRequest, ModelOpenAiApiMode, ModelSettings};
use aionui_common::decrypt_string;
use serde_json::{Value, json};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use super::{ProviderService, deserialize_opt};
use crate::error::SystemError;

static LIMIT: std::sync::LazyLock<Arc<Semaphore>> = std::sync::LazyLock::new(|| Arc::new(Semaphore::new(16)));

pub(crate) struct BenchStream {
    pub response: reqwest::Response,
    pub _permit: OwnedSemaphorePermit,
}

fn protocol(platform: &str, model: &str, protocols: &Option<HashMap<String, String>>) -> String {
    protocols
        .as_ref()
        .and_then(|p| p.get(model))
        .cloned()
        .unwrap_or_else(|| platform.to_owned())
}

fn supported(protocol: &str) -> bool {
    !matches!(protocol, "bedrock" | "vertex-ai" | "gemini-with-google-auth")
}

/// Construct an endpoint without duplicating version prefixes or losing an explicit URL.
fn endpoint(base: &str, suffix: &str, full: bool) -> Result<String, SystemError> {
    let mut url = reqwest::Url::parse(base.trim()).map_err(|_| SystemError::BadRequest("BENCH_INVALID_URL".into()))?;
    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() {
        return Err(SystemError::BadRequest("BENCH_INVALID_URL".into()));
    }
    if !full {
        let path = url.path().trim_end_matches('/');
        let suffix = if (path.ends_with("/v1") && suffix.starts_with("v1/"))
            || (path.ends_with("/v1beta") && suffix.starts_with("v1beta/"))
        {
            suffix.split_once('/').map_or(suffix, |(_, tail)| tail)
        } else {
            suffix
        };
        url.set_path(&format!("{path}/{suffix}"));
    }
    url.set_fragment(None);
    Ok(url.to_string())
}

impl ProviderService {
    pub async fn benchmark_models(&self, user_id: &str) -> Result<Vec<ModelBenchModel>, SystemError> {
        let mut result = Vec::new();
        for row in self.repo.list(user_id).await? {
            if !row.enabled {
                continue;
            }
            let models: Vec<String> =
                serde_json::from_str(&row.models).map_err(|_| SystemError::Internal("BENCH_CONFIG".into()))?;
            let enabled: Option<HashMap<String, bool>> = deserialize_opt(&row.model_enabled, "model_enabled")?;
            let protocols = deserialize_opt(&row.model_protocols, "model_protocols")?;
            for model in models {
                if enabled.as_ref().and_then(|m| m.get(&model)) == Some(&false)
                    || !supported(&protocol(&row.platform, &model, &protocols))
                {
                    continue;
                }
                result.push(ModelBenchModel {
                    provider_id: row.id.clone(),
                    provider_name: row.name.clone(),
                    model,
                });
            }
        }
        Ok(result)
    }

    pub(crate) async fn benchmark(
        &self,
        user_id: &str,
        provider_id: &str,
        input: &ModelBenchRequest,
    ) -> Result<BenchStream, SystemError> {
        if input.prompt.trim().is_empty() || input.prompt.len() > 400_000 || input.model.len() > 256 {
            return Err(SystemError::BadRequest("BENCH_INVALID_INPUT".into()));
        }
        let permit = LIMIT
            .clone()
            .try_acquire_owned()
            .map_err(|_| SystemError::Conflict("BENCH_BUSY".into()))?;
        let row = self
            .repo
            .find_by_id(user_id, provider_id)
            .await?
            .ok_or_else(|| SystemError::NotFound("BENCH_PROVIDER_NOT_FOUND".into()))?;
        let models: Vec<String> =
            serde_json::from_str(&row.models).map_err(|_| SystemError::Internal("BENCH_CONFIG".into()))?;
        let enabled: Option<HashMap<String, bool>> = deserialize_opt(&row.model_enabled, "model_enabled")?;
        if !row.enabled
            || !models.contains(&input.model)
            || enabled.as_ref().and_then(|m| m.get(&input.model)) == Some(&false)
        {
            return Err(SystemError::BadRequest("BENCH_MODEL_UNAVAILABLE".into()));
        }
        let protocols = deserialize_opt(&row.model_protocols, "model_protocols")?;
        let protocol = protocol(&row.platform, &input.model, &protocols);
        if !supported(&protocol) {
            return Err(SystemError::BadRequest("BENCH_PROTOCOL_UNSUPPORTED".into()));
        }
        let key = decrypt_string(&row.api_key_encrypted, &self.encryption_key)?;
        let key = key.lines().find(|k| !k.trim().is_empty()).unwrap_or("").trim();
        if key.is_empty() {
            return Err(SystemError::BadRequest("BENCH_KEY_MISSING".into()));
        }
        let settings: HashMap<String, ModelSettings> =
            serde_json::from_str(&row.model_settings).map_err(|_| SystemError::Internal("BENCH_CONFIG".into()))?;
        let responses =
            settings.get(&input.model).and_then(|s| s.openai_api_mode) == Some(ModelOpenAiApiMode::Responses);
        let (suffix, body): (String, Value) = match protocol.as_str() {
            "anthropic" | "claude" => (
                "v1/messages".into(),
                json!({"model": input.model, "messages": [{"role": "user", "content": input.prompt}], "max_tokens": 4096, "stream": true}),
            ),
            "gemini" => (
                format!(
                    "v1beta/models/{}:streamGenerateContent",
                    input.model.trim_start_matches("models/")
                ),
                json!({"contents": [{"role": "user", "parts": [{"text": input.prompt}]}]}),
            ),
            _ if responses => (
                "responses".into(),
                json!({"model": input.model, "input": input.prompt, "stream": true}),
            ),
            _ => (
                "chat/completions".into(),
                json!({"model": input.model, "messages": [{"role": "user", "content": input.prompt}], "stream": true}),
            ),
        };
        let mut url = endpoint(&row.base_url, &suffix, row.is_full_url)?;
        if protocol == "gemini" {
            let mut parsed =
                reqwest::Url::parse(&url).map_err(|_| SystemError::BadRequest("BENCH_INVALID_URL".into()))?;
            parsed.query_pairs_mut().append_pair("alt", "sse");
            url = parsed.to_string();
        }
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(180))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| SystemError::Internal("BENCH_CLIENT".into()))?;
        let mut request = client.post(url).header("accept", "text/event-stream").json(&body);
        request = match protocol.as_str() {
            "anthropic" | "claude" => request
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01"),
            "gemini" => request.header("x-goog-api-key", key),
            _ => request.bearer_auth(key),
        };
        let response = request.send().await.map_err(|error| {
            if error.is_timeout() {
                SystemError::Timeout("BENCH_TIMEOUT".into())
            } else {
                SystemError::BadGateway("BENCH_CONNECTION".into())
            }
        })?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            tracing::warn!(provider_id, status, "model comparison rejected by provider");
            return Err(SystemError::BadGateway(format!("BENCH_HTTP_{status}")));
        }
        if !response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .contains("text/event-stream")
        {
            return Err(SystemError::BadGateway("BENCH_EXPECTED_STREAM".into()));
        }
        Ok(BenchStream {
            response,
            _permit: permit,
        })
    }
}

#[cfg(test)]
#[path = "benchmark_tests.rs"]
mod tests;

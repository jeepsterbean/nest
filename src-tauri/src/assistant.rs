//! OpenAI Responses streaming and the keychain-held API key. The Assistant
//! commands and their SQLite history live in `commands::assistant`.

use std::{sync::LazyLock, time::Duration};

use serde_json::Value;

use crate::error::{AppError, Result};

const OPENAI_API_URL: &str = "https://api.openai.com/v1/responses";
const KEYRING_SERVICE: &str = "com.nest.self-care";
const KEYRING_ACCOUNT: &str = "openai-api-key";
const OPENAI_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const OPENAI_IDLE_TIMEOUT: Duration = Duration::from_secs(45);

static OPENAI_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(OPENAI_CONNECT_TIMEOUT)
        .read_timeout(OPENAI_IDLE_TIMEOUT)
        .build()
        .expect("OpenAI HTTP client configuration is valid")
});

pub(crate) enum StreamEvent {
    Delta(String),
    Incomplete(String),
    Failed(String),
}

pub(crate) fn assistant_error(message: impl Into<String>) -> AppError {
    AppError::Assistant(message.into())
}

fn keyring_entry() -> Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| assistant_error(format!("could not open the system keychain: {error}")))
}

pub(crate) fn assistant_api_key() -> Result<String> {
    match keyring_entry()?.get_password() {
        Ok(key) if !key.trim().is_empty() => Ok(key),
        Ok(_) | Err(keyring::Error::NoEntry) => Err(assistant_error(
            "add an OpenAI API key in Config before starting a chat",
        )),
        Err(error) => Err(assistant_error(format!(
            "could not read the API key: {error}"
        ))),
    }
}

pub(crate) fn save_api_key(api_key: &str) -> Result<()> {
    keyring_entry()?
        .set_password(api_key)
        .map_err(|error| assistant_error(format!("could not save the API key: {error}")))
}

pub(crate) fn delete_api_key() -> Result<()> {
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(assistant_error(format!(
            "could not remove the API key: {error}"
        ))),
    }
}

/// Send one Responses request and hand back the open stream, or the error a
/// non-success status carried.
pub(crate) async fn open_response_stream(api_key: &str, body: &Value) -> Result<reqwest::Response> {
    let response = match OPENAI_CLIENT
        .post(OPENAI_API_URL)
        .bearer_auth(api_key)
        .json(body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            crate::append_diagnostic_log(format!("assistant_response error={error}"));
            return Err(assistant_error(format!("Could not reach OpenAI: {error}")));
        }
    };
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        crate::append_diagnostic_log(format!("assistant_response status={status} body={body:?}"));
        return Err(openai_error(status, &body));
    }
    Ok(response)
}

fn event_boundary(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = buffer.windows(2).position(|bytes| bytes == b"\n\n");
    let crlf = buffer.windows(4).position(|bytes| bytes == b"\r\n\r\n");
    match (lf, crlf) {
        (Some(left), Some(right)) if left < right => Some((left, 2)),
        (Some(_), Some(right)) => Some((right, 4)),
        (Some(index), None) => Some((index, 2)),
        (None, Some(index)) => Some((index, 4)),
        (None, None) => None,
    }
}

pub(crate) fn take_event(buffer: &mut Vec<u8>) -> Option<Vec<u8>> {
    let (index, boundary_length) = event_boundary(buffer)?;
    let event = buffer[..index].to_vec();
    buffer.drain(..index + boundary_length);
    Some(event)
}

pub(crate) fn parse_stream_event(event: &[u8]) -> Result<Option<StreamEvent>> {
    let event = std::str::from_utf8(event)
        .map_err(|error| assistant_error(format!("OpenAI sent invalid text: {error}")))?;
    let data = event
        .lines()
        .filter_map(|line| line.strip_prefix("data:").map(str::trim_start))
        .collect::<Vec<_>>()
        .join("\n");
    if data.is_empty() || data == "[DONE]" {
        return Ok(None);
    }
    let value: Value = serde_json::from_str(&data)
        .map_err(|error| assistant_error(format!("OpenAI sent an invalid event: {error}")))?;
    match value.get("type").and_then(Value::as_str) {
        Some("response.output_text.delta") | Some("response.refusal.delta") => Ok(value
            .get("delta")
            .and_then(Value::as_str)
            .map(|delta| StreamEvent::Delta(delta.to_string()))),
        Some("response.incomplete") => Ok(Some(StreamEvent::Incomplete(
            value
                .pointer("/response/incomplete_details/reason")
                .or_else(|| value.pointer("/incomplete_details/reason"))
                .and_then(Value::as_str)
                .unwrap_or("The response ended early")
                .to_string(),
        ))),
        Some("error") | Some("response.failed") => {
            let message = value
                .pointer("/response/error/message")
                .or_else(|| value.pointer("/error/message"))
                .or_else(|| value.get("message"))
                .and_then(Value::as_str)
                .unwrap_or("OpenAI could not complete the response");
            Ok(Some(StreamEvent::Failed(message.to_string())))
        }
        _ => Ok(None),
    }
}

fn openai_error(status: reqwest::StatusCode, body: &str) -> AppError {
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| format!("OpenAI returned {status}"));
    assistant_error(message)
}

#[cfg(test)]
mod tests {
    use super::{parse_stream_event, StreamEvent};

    #[test]
    fn parses_stream_deltas_and_incomplete_reasons() {
        let event = br#"data: {"type":"response.output_text.delta","delta":"Small step"}"#;
        assert!(matches!(
            parse_stream_event(event).unwrap(),
            Some(StreamEvent::Delta(delta)) if delta == "Small step"
        ));
        let incomplete = br#"data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}"#;
        assert!(matches!(
            parse_stream_event(incomplete).unwrap(),
            Some(StreamEvent::Incomplete(reason)) if reason == "max_output_tokens"
        ));
    }
}

use std::{
    sync::{LazyLock, Mutex},
    time::Duration,
};

use futures_util::StreamExt;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{ipc::Channel, State};

use crate::{
    error::{AppError, Result},
    models::{AssistantConversation, AssistantMessage, AssistantPrompt, AssistantTurn},
    time::now_unix_secs,
};

const OPENAI_API_URL: &str = "https://api.openai.com/v1/responses";
const KEYRING_SERVICE: &str = "com.nest.self-care";
const KEYRING_ACCOUNT: &str = "openai-api-key";
const MAX_TITLE_CHARS: usize = 80;
const MAX_PROMPT_CHARS: usize = 12_000;
const MAX_MESSAGE_CHARS: usize = 24_000;
const MAX_CONTEXT_CHARS: usize = 24_000;
const MAX_API_KEY_CHARS: usize = 512;
const HISTORY_MESSAGE_LIMIT: i64 = 40;
const OPENAI_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const OPENAI_IDLE_TIMEOUT: Duration = Duration::from_secs(45);
const INCOMPLETE_RESPONSE_MESSAGE: &str = "The response ended before any text arrived.";

const PROMPT_COLUMNS: &str = "id, title, instructions, created_at, updated_at";
const CONVERSATION_COLUMNS: &str =
    "id, title, model, created_at, updated_at";
const MESSAGE_COLUMNS: &str = "id, conversation_id, role, content, context, incomplete_reason, created_at";

/// Held for the whole of a send so two in-flight turns cannot read each other's
/// history as empty and then save their replies in completion order.
// ponytail: one global lock — per-conversation locks if parallel chats ever stream at once.
static SEND_LOCK: LazyLock<futures_util::lock::Mutex<()>> =
    LazyLock::new(futures_util::lock::Mutex::default);

static OPENAI_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(OPENAI_CONNECT_TIMEOUT)
        .read_timeout(OPENAI_IDLE_TIMEOUT)
        .build()
        .expect("OpenAI HTTP client configuration is valid")
});

#[derive(Debug)]
struct ConversationRequest {
    id: Option<i64>,
    model: String,
    history: Vec<AssistantMessage>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendAssistantMessageRequest {
    conversation_id: Option<i64>,
    model: String,
    content: String,
    context: Option<String>,
    system_instructions: Option<String>,
    timezone_offset_minutes: i32,
}

struct StartedTurn {
    conversation_id: i64,
    user_message_id: i64,
}

enum StreamEvent {
    Delta(String),
    Incomplete(String),
    Failed(String),
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantStreamEvent {
    delta: String,
}

fn assistant_error(message: impl Into<String>) -> AppError {
    AppError::Assistant(message.into())
}

fn keyring_entry() -> Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| assistant_error(format!("could not open the system keychain: {error}")))
}

fn assistant_api_key() -> Result<String> {
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

fn normalized(value: String, label: &str, max_chars: usize) -> Result<String> {
    let value = value.trim().to_string();
    let length = value.chars().count();
    if value.is_empty() {
        return Err(AppError::InvalidInput(format!("{label} cannot be empty")));
    }
    if length > max_chars {
        return Err(AppError::InvalidInput(format!(
            "{label} must be {max_chars} characters or fewer"
        )));
    }
    Ok(value)
}

fn valid_model(model: String) -> Result<String> {
    match model.as_str() {
        "gpt-5.6-luna" | "gpt-5.6-terra" => Ok(model),
        _ => Err(AppError::InvalidInput(format!(
            "unsupported assistant model {model}"
        ))),
    }
}

fn map_prompt(row: &Row<'_>) -> rusqlite::Result<AssistantPrompt> {
    Ok(AssistantPrompt {
        id: row.get(0)?,
        title: row.get(1)?,
        instructions: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn map_conversation(row: &Row<'_>) -> rusqlite::Result<AssistantConversation> {
    Ok(AssistantConversation {
        id: row.get(0)?,
        title: row.get(1)?,
        model: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn map_message(row: &Row<'_>) -> rusqlite::Result<AssistantMessage> {
    Ok(AssistantMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        context: row.get(4)?,
        incomplete_reason: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn fetch_prompt(conn: &Connection, id: i64) -> Result<AssistantPrompt> {
    conn.query_row(
        &format!("SELECT {PROMPT_COLUMNS} FROM assistant_prompts WHERE id = ?1"),
        [id],
        map_prompt,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("assistant prompt {id}")))
}

fn fetch_conversation(conn: &Connection, id: i64) -> Result<AssistantConversation> {
    conn.query_row(
        &format!("SELECT {CONVERSATION_COLUMNS} FROM assistant_conversations WHERE id = ?1"),
        [id],
        map_conversation,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("assistant conversation {id}")))
}

fn fetch_message(conn: &Connection, id: i64) -> Result<AssistantMessage> {
    conn.query_row(
        &format!("SELECT {MESSAGE_COLUMNS} FROM assistant_messages WHERE id = ?1"),
        [id],
        map_message,
    )
    .map_err(Into::into)
}

fn conversation_request(
    conn: &Connection,
    conversation_id: Option<i64>,
    model: String,
) -> Result<ConversationRequest> {
    let model = valid_model(model)?;
    Ok(match conversation_id {
        Some(id) => {
            // start_turn runs only after OpenAI answers, so a chat deleted in the
            // other window has to fail here, before a billed request goes out.
            fetch_conversation(conn, id)?;
            ConversationRequest {
                id: Some(id),
                model,
                history: recent_messages(conn, id)?,
            }
        }
        None => ConversationRequest { id: None, model, history: Vec::new() },
    })
}

fn recent_messages(conn: &Connection, conversation_id: i64) -> Result<Vec<AssistantMessage>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {MESSAGE_COLUMNS} FROM (\
           SELECT {MESSAGE_COLUMNS} FROM assistant_messages \
           WHERE conversation_id = ?1
             AND NOT (incomplete_reason IS NOT NULL AND content = ?3)
           ORDER BY id DESC LIMIT ?2\
         ) ORDER BY id ASC"
    ))?;
    let messages = stmt
        .query_map(params![conversation_id, HISTORY_MESSAGE_LIMIT, INCOMPLETE_RESPONSE_MESSAGE], map_message)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(messages)
}

fn clock_prefix(unix_seconds: i64, timezone_offset_minutes: i32) -> String {
    let local_seconds = unix_seconds - i64::from(timezone_offset_minutes) * 60;
    let minute = local_seconds.div_euclid(60).rem_euclid(24 * 60);
    format!("{:02}:{:02}  ", minute / 60, minute % 60)
}

fn local_message_content(message: &AssistantMessage, timezone_offset_minutes: i32) -> String {
    format!(
        "{}{}",
        clock_prefix(message.created_at, timezone_offset_minutes),
        message.context.as_deref().unwrap_or(&message.content),
    )
}

fn conversation_title(content: &str) -> String {
    let line = content
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or(content);
    let line = line.trim();
    let mut title: String = line.chars().take(57).collect();
    if line.chars().count() > 57 {
        title.push('…');
    }
    title
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

fn take_event(buffer: &mut Vec<u8>) -> Option<Vec<u8>> {
    let (index, boundary_length) = event_boundary(buffer)?;
    let event = buffer[..index].to_vec();
    buffer.drain(..index + boundary_length);
    Some(event)
}

fn parse_stream_event(event: &[u8]) -> Result<Option<StreamEvent>> {
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

fn start_turn(
    conn: &mut Connection,
    request: ConversationRequest,
    user_content: String,
    context: Option<String>,
) -> Result<StartedTurn> {
    let now = now_unix_secs();
    let tx = conn.transaction()?;
    let conversation_id = if let Some(id) = request.id {
        let updated = tx.execute(
            "UPDATE assistant_conversations SET model = ?1, updated_at = ?2 WHERE id = ?3",
            params![request.model, now, id],
        )?;
        if updated == 0 {
            return Err(AppError::NotFound(format!("assistant conversation {id}")));
        }
        id
    } else {
        tx.execute(
            "INSERT INTO assistant_conversations \
             (title, prompt_id, prompt_title, prompt_instructions, model, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![
                conversation_title(&user_content),
                Option::<i64>::None,
                "",
                "",
                request.model,
                now,
            ],
        )?;
        tx.last_insert_rowid()
    };

    tx.execute(
        "INSERT INTO assistant_messages (conversation_id, role, content, context, created_at) \
         VALUES (?1, 'user', ?2, ?3, ?4)",
        params![conversation_id, user_content, context, now],
    )?;
    let user_message_id = tx.last_insert_rowid();
    tx.commit()?;

    Ok(StartedTurn {
        conversation_id,
        user_message_id,
    })
}

fn finish_turn(
    conn: &mut Connection,
    started: StartedTurn,
    assistant_content: String,
    incomplete_reason: Option<String>,
) -> Result<AssistantTurn> {
    // assistant_messages.content is CHECK-constrained to a non-blank string,
    // so a whitespace-only reply needs the placeholder too.
    let content = if assistant_content.trim().is_empty() {
        INCOMPLETE_RESPONSE_MESSAGE.to_string()
    } else {
        assistant_content
    };
    conn.execute(
        "INSERT INTO assistant_messages (conversation_id, role, content, incomplete_reason, created_at) \
         VALUES (?1, 'assistant', ?2, ?3, ?4)",
        params![
            started.conversation_id,
            content,
            incomplete_reason,
            now_unix_secs(),
        ],
    )?;
    let assistant_message_id = conn.last_insert_rowid();

    Ok(AssistantTurn {
        conversation: fetch_conversation(conn, started.conversation_id)?,
        user_message: fetch_message(conn, started.user_message_id)?,
        assistant_message: fetch_message(conn, assistant_message_id)?,
    })
}

#[tauri::command]
pub fn assistant_api_key_configured() -> bool {
    assistant_api_key().is_ok()
}

#[tauri::command]
pub fn set_assistant_api_key(api_key: String) -> Result<()> {
    let api_key = normalized(api_key, "OpenAI API key", MAX_API_KEY_CHARS)?;
    keyring_entry()?
        .set_password(&api_key)
        .map_err(|error| assistant_error(format!("could not save the API key: {error}")))
}

#[tauri::command]
pub fn delete_assistant_api_key() -> Result<()> {
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(assistant_error(format!(
            "could not remove the API key: {error}"
        ))),
    }
}

#[tauri::command]
pub fn list_assistant_prompts(state: State<'_, Mutex<Connection>>) -> Result<Vec<AssistantPrompt>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "SELECT {PROMPT_COLUMNS} FROM assistant_prompts ORDER BY updated_at DESC, id DESC"
    ))?;
    let prompts = stmt
        .query_map([], map_prompt)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(prompts)
}

#[tauri::command]
pub fn create_assistant_prompt(
    state: State<'_, Mutex<Connection>>,
    title: String,
    instructions: String,
) -> Result<AssistantPrompt> {
    let title = normalized(title, "prompt title", MAX_TITLE_CHARS)?;
    let instructions = normalized(instructions, "prompt instructions", MAX_PROMPT_CHARS)?;
    let conn = state.lock().unwrap();
    let now = now_unix_secs();
    conn.execute(
        "INSERT INTO assistant_prompts (title, instructions, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?3)",
        params![title, instructions, now],
    )?;
    fetch_prompt(&conn, conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_assistant_prompt(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    title: String,
    instructions: String,
) -> Result<AssistantPrompt> {
    let title = normalized(title, "prompt title", MAX_TITLE_CHARS)?;
    let instructions = normalized(instructions, "prompt instructions", MAX_PROMPT_CHARS)?;
    let conn = state.lock().unwrap();
    let updated = conn.execute(
        "UPDATE assistant_prompts SET title = ?1, instructions = ?2, updated_at = ?3 \
         WHERE id = ?4",
        params![title, instructions, now_unix_secs(), id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("assistant prompt {id}")));
    }
    fetch_prompt(&conn, id)
}

#[tauri::command]
pub fn delete_assistant_prompt(state: State<'_, Mutex<Connection>>, id: i64) -> Result<()> {
    let conn = state.lock().unwrap();
    if conn.execute("DELETE FROM assistant_prompts WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound(format!("assistant prompt {id}")));
    }
    Ok(())
}

#[tauri::command]
pub fn list_assistant_conversations(
    state: State<'_, Mutex<Connection>>,
) -> Result<Vec<AssistantConversation>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "SELECT {CONVERSATION_COLUMNS} FROM assistant_conversations \
         ORDER BY updated_at DESC, id DESC"
    ))?;
    let conversations = stmt
        .query_map([], map_conversation)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(conversations)
}

#[tauri::command]
pub fn list_assistant_messages(
    state: State<'_, Mutex<Connection>>,
    conversation_id: i64,
) -> Result<Vec<AssistantMessage>> {
    let conn = state.lock().unwrap();
    fetch_conversation(&conn, conversation_id)?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {MESSAGE_COLUMNS} FROM assistant_messages \
         WHERE conversation_id = ?1 ORDER BY id ASC"
    ))?;
    let messages = stmt
        .query_map([conversation_id], map_message)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(messages)
}

#[tauri::command]
pub fn rename_assistant_conversation(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    title: String,
) -> Result<AssistantConversation> {
    let title = normalized(title, "chat title", MAX_TITLE_CHARS)?;
    let conn = state.lock().unwrap();
    let updated = conn.execute(
        "UPDATE assistant_conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now_unix_secs(), id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("assistant conversation {id}")));
    }
    fetch_conversation(&conn, id)
}

#[tauri::command]
pub fn delete_assistant_conversation(state: State<'_, Mutex<Connection>>, id: i64) -> Result<()> {
    let conn = state.lock().unwrap();
    if conn.execute("DELETE FROM assistant_conversations WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound(format!("assistant conversation {id}")));
    }
    Ok(())
}

#[tauri::command]
pub async fn send_assistant_message(
    state: State<'_, Mutex<Connection>>,
    request: SendAssistantMessageRequest,
    on_event: Channel<AssistantStreamEvent>,
) -> Result<AssistantTurn> {
    let SendAssistantMessageRequest {
        conversation_id,
        model,
        content,
        context,
        system_instructions,
        timezone_offset_minutes,
    } = request;
    let content = normalized(content, "message", MAX_MESSAGE_CHARS)?;
    let context = context.map(|value| normalized(value, "context", MAX_CONTEXT_CHARS)).transpose()?;
    let system_instructions = system_instructions
        .filter(|value| !value.trim().is_empty())
        .map(|value| normalized(value, "system instructions", MAX_PROMPT_CHARS))
        .transpose()?;
    if !(-14 * 60..=14 * 60).contains(&timezone_offset_minutes) {
        return Err(AppError::InvalidInput("timezone offset must be within 14 hours of UTC".into()));
    }
    let api_key = assistant_api_key()?;
    let _send_guard = SEND_LOCK.lock().await;
    let request = {
        let conn = state.lock().unwrap();
        conversation_request(&conn, conversation_id, model)?
    };

    let mut input = request
        .history
        .iter()
        .map(|message| json!({ "role": &message.role, "content": local_message_content(message, timezone_offset_minutes) }))
        .collect::<Vec<_>>();
    let outbound_content = context.as_deref().unwrap_or(&content);
    input.push(json!({ "role": "user", "content": format!("{}{}", clock_prefix(now_unix_secs(), timezone_offset_minutes), outbound_content) }));
    let body = json!({
        "model": &request.model,
        "instructions": system_instructions.unwrap_or_default(),
        "input": input,
        "max_output_tokens": 2_000,
        "store": false,
        "stream": true
    });

    let response = match OPENAI_CLIENT
        .post(OPENAI_API_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => return Err(assistant_error(format!("Could not reach OpenAI: {error}"))),
    };
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(openai_error(status, &body));
    }

    let started = {
        let mut conn = state.lock().unwrap();
        start_turn(&mut conn, request, content.clone(), context)?
    };

    let mut stream = response.bytes_stream();
    let mut buffer = Vec::new();
    let mut assistant_content = String::new();
    let mut incomplete_reason = None;
    let mut stream_ended = false;
    'stream: loop {
        match stream.next().await {
            Some(Ok(chunk)) => buffer.extend_from_slice(&chunk),
            Some(Err(error)) => {
                incomplete_reason = Some(format!("OpenAI response was interrupted: {error}"));
                break;
            }
            // A well-formed stream ends on a delimiter; append one so a final
            // event that arrived without it drains through the same path.
            None => {
                stream_ended = true;
                buffer.extend_from_slice(b"\n\n");
            }
        }
        while let Some(event) = take_event(&mut buffer) {
            match parse_stream_event(&event) {
                Ok(Some(StreamEvent::Delta(delta))) => {
                    let remaining =
                        MAX_MESSAGE_CHARS.saturating_sub(assistant_content.chars().count());
                    let truncated = delta.chars().count() > remaining;
                    let delta: String = delta.chars().take(remaining).collect();
                    assistant_content.push_str(&delta);
                    if on_event.send(AssistantStreamEvent { delta }).is_err() {
                        incomplete_reason =
                            Some("The response stream ended because this window closed.".into());
                        break 'stream;
                    }
                    if truncated {
                        incomplete_reason =
                            Some("The response reached Nest's saved-message limit.".into());
                        break 'stream;
                    }
                }
                Ok(Some(StreamEvent::Incomplete(reason)))
                | Ok(Some(StreamEvent::Failed(reason))) => {
                    incomplete_reason = Some(reason);
                    break 'stream;
                }
                Ok(None) => {}
                Err(error) => {
                    incomplete_reason =
                        Some(format!("OpenAI sent an invalid stream event: {error}"));
                    break 'stream;
                }
            }
        }
        if stream_ended {
            break;
        }
    }
    if assistant_content.trim().is_empty() && incomplete_reason.is_none() {
        incomplete_reason = Some("OpenAI returned no text.".into());
    }

    let mut conn = state.lock().unwrap();
    finish_turn(&mut conn, started, assistant_content, incomplete_reason)
}

#[cfg(test)]
mod tests {
    use super::{
        conversation_title, finish_turn, local_message_content, parse_stream_event, recent_messages,
        start_turn, AssistantMessage, ConversationRequest, StreamEvent,
        INCOMPLETE_RESPONSE_MESSAGE,
    };
    use crate::migrations::migrations;
    use rusqlite::Connection;

    #[test]
    fn prefixes_saved_context_with_local_time() {
        let message = AssistantMessage {
            id: 1, conversation_id: 1, role: "user".into(), content: "Typed".into(),
            context: Some("Tasks · active\n\nTyped".into()), incomplete_reason: None, created_at: 0,
        };
        assert_eq!(local_message_content(&message, -60), "01:00  Tasks · active\n\nTyped");
    }

    #[test]
    fn parses_stream_deltas_and_makes_short_chat_titles() {
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
        assert_eq!(
            conversation_title("\n  Begin here\nthen continue"),
            "Begin here"
        );
        assert!(conversation_title(&"a".repeat(100)).ends_with('…'));
    }

    #[test]
    fn retains_the_sent_message_and_marks_an_incomplete_reply() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        let started = start_turn(
            &mut conn,
            ConversationRequest {
                id: None,
                model: "gpt-5.6-luna".into(),
                history: Vec::new(),
            },
            "I need a next step".into(),
            Some("Tasks · active\n\nI need a next step".into()),
        )
        .unwrap();

        let turn = finish_turn(
            &mut conn,
            started,
            "Start with a glass of water.".into(),
            Some("max_output_tokens".into()),
        )
        .unwrap();

        assert_eq!(turn.user_message.content, "I need a next step");
        assert!(turn.user_message.context.unwrap().contains("Tasks · active"));
        assert_eq!(
            turn.assistant_message.incomplete_reason.as_deref(),
            Some("max_output_tokens")
        );

        // A blank reply has to reach the placeholder: assistant_messages.content
        // rejects a whitespace-only string.
        let started = start_turn(
            &mut conn,
            ConversationRequest {
                id: Some(turn.conversation.id),
                model: "gpt-5.6-luna".into(),
                history: Vec::new(),
            },
            "Anything else?".into(),
            None,
        )
        .unwrap();
        let blank = finish_turn(
            &mut conn,
            started,
            "  \n ".into(),
            Some("OpenAI returned no text.".into()),
        )
        .unwrap();
        assert_eq!(blank.assistant_message.content, INCOMPLETE_RESPONSE_MESSAGE);
        assert_eq!(recent_messages(&conn, turn.conversation.id).unwrap().len(), 3);
    }
}

//! The Assistant is retired, but an OpenAI API key saved while it existed
//! would otherwise stay in the macOS Keychain indefinitely. Every launch asks
//! the Keychain to drop it; after the first removal the lookup finds nothing.
//! The Assistant's SQLite history is kept, like every retired table, so its
//! migrations still describe the data on disk.

use crate::append_diagnostic_log;

const KEYRING_SERVICE: &str = "com.nest.self-care";
const KEYRING_ACCOUNT: &str = "openai-api-key";

pub fn forget_saved_api_key() {
    let removed = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .and_then(|entry| entry.delete_credential());
    match removed {
        Ok(()) => append_diagnostic_log("retired_assistant_key removed"),
        Err(keyring::Error::NoEntry) => {}
        Err(error) => {
            append_diagnostic_log(format!("retired_assistant_key_remove_failed error={error}"))
        }
    }
}

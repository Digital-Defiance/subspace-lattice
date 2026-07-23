//! Minimal loopback HTTP server for the desktop Google OAuth flow.
//!
//! Google "Desktop" OAuth clients do **not** support custom-scheme (deep-link)
//! redirect URIs — only the loopback address flow (`http://127.0.0.1:<port>`).
//! Bind a one-shot localhost server on an ephemeral port, capture the OAuth
//! redirect, reply with a friendly page, and hand the callback URL back to the
//! webview.
//!
//! Delivery uses a channel + command return value (not a Tauri event) so a
//! fast redirect cannot be lost before the frontend starts awaiting.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::Duration;

use tauri::State;

const SUCCESS_HTML: &str = "<!doctype html><html><head><meta charset=\"utf-8\">\
<title>Subspace Lattice</title></head>\
<body style=\"font-family:-apple-system,Segoe UI,sans-serif;background:#0b0f1a;\
color:#eaf2ff;text-align:center;padding-top:18vh\">\
<h2>Signed in to Subspace Lattice</h2>\
<p>You can close this window and return to the app.</p></body></html>";

/// Pending loopback servers keyed by port, each holding the receiver that will
/// yield the captured redirect URL.
#[derive(Default)]
pub struct OAuthServers(Mutex<HashMap<u16, Receiver<String>>>);

fn request_target(request: &str) -> Option<&str> {
    request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
}

fn write_response(stream: &mut std::net::TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\n\
Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[tauri::command]
pub async fn start_oauth_server(servers: State<'_, OAuthServers>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|err| err.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|err| err.to_string())?
        .port();

    let (sender, receiver) = mpsc::channel::<String>();
    servers
        .0
        .lock()
        .map_err(|_| "oauth server state poisoned".to_string())?
        .insert(port, receiver);

    std::thread::spawn(move || {
        for connection in listener.incoming() {
            let Ok(mut stream) = connection else {
                continue;
            };
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

            let mut buffer = [0u8; 8192];
            let read = stream.read(&mut buffer).unwrap_or(0);
            let request = String::from_utf8_lossy(&buffer[..read]);
            let target = request_target(&request).unwrap_or("/").to_string();

            if !target.contains("code=") && !target.contains("error=") {
                write_response(&mut stream, "204 No Content", "");
                continue;
            }

            write_response(&mut stream, "200 OK", SUCCESS_HTML);
            let full_url = format!("http://127.0.0.1:{port}{target}");
            let _ = sender.send(full_url);
            break;
        }
    });

    Ok(port)
}

#[tauri::command]
pub async fn await_oauth_redirect(
    servers: State<'_, OAuthServers>,
    port: u16,
) -> Result<String, String> {
    let receiver = {
        let mut map = servers
            .0
            .lock()
            .map_err(|_| "oauth server state poisoned".to_string())?;
        map.remove(&port)
    };
    let Some(receiver) = receiver else {
        return Err(format!("no pending oauth server on port {port}"));
    };

    tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(Duration::from_secs(300))
    })
    .await
    .map_err(|err| err.to_string())?
    .map_err(|_| "sign-in timed out".to_string())
}

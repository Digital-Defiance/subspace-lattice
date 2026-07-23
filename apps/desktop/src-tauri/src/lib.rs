mod oauth_server;

/// Save bytes via native dialog. WKWebView ignores `<a download>`, so desktop
/// Tauri must write through the OS save picker instead.
#[tauri::command]
fn save_download(default_name: String, contents: Vec<u8>) -> Result<bool, String> {
  #[cfg(desktop)]
  {
    let path = rfd::FileDialog::new()
      .set_file_name(&default_name)
      .save_file();
    let Some(path) = path else {
      return Ok(false);
    };
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(true)
  }
  #[cfg(mobile)]
  {
    let _ = (default_name, contents);
    Err("Save dialog is only available on desktop".into())
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .manage(oauth_server::OAuthServers::default())
    .invoke_handler(tauri::generate_handler![
      oauth_server::start_oauth_server,
      oauth_server::await_oauth_redirect,
      save_download,
    ]);

  #[cfg(any(target_os = "ios", target_os = "macos"))]
  {
    builder = builder.plugin(tauri_plugin_siwa::init());
  }

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

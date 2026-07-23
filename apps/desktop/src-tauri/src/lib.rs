mod oauth_server;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .manage(oauth_server::OAuthServers::default())
    .invoke_handler(tauri::generate_handler![
      oauth_server::start_oauth_server,
      oauth_server::await_oauth_redirect,
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

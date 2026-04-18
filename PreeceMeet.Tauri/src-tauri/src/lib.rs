#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // WebKitGTK ships with WebRTC and the media-stream APIs disabled by
            // default; wry doesn't flip them on either. Do it ourselves so
            // LiveKit (RTCPeerConnection + getUserMedia) works on Linux.
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                use webkit2gtk::{SettingsExt, WebViewExt};
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.with_webview(|webview| {
                        let wv: webkit2gtk::WebView = webview.inner();
                        if let Some(settings) = WebViewExt::settings(&wv) {
                            settings.set_enable_webrtc(true);
                            settings.set_enable_media_stream(true);
                            settings.set_enable_mediasource(true);
                            settings.set_media_playback_requires_user_gesture(false);
                        }
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

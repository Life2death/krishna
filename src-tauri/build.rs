fn main() {
    dotenv::dotenv().ok();

    if let Ok(payment_endpoint) = std::env::var("PAYMENT_ENDPOINT") {
        println!("cargo:rustc-env=PAYMENT_ENDPOINT={}", payment_endpoint);
    }

    if let Ok(api_access_key) = std::env::var("API_ACCESS_KEY") {
        println!("cargo:rustc-env=API_ACCESS_KEY={}", api_access_key);
    }

    if let Ok(app_endpoint) = std::env::var("APP_ENDPOINT") {
        println!("cargo:rustc-env=APP_ENDPOINT={}", app_endpoint);
    }

    if let Ok(posthog_api_key) = std::env::var("POSTHOG_API_KEY") {
        println!("cargo:rustc-env=POSTHOG_API_KEY={}", posthog_api_key);
    }

    tauri_build::try_build(
        tauri_build::Attributes::new().plugin(
            "device-control",
            tauri_build::InlinedPlugin::new()
                .commands(&[
                    "set_torch",
                    "list_apps",
                    "launch_app",
                    "open_setting",
                    "set_volume",
                    "set_dnd",
                    "request_bluetooth_enable",
                ])
                .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
        ),
    )
    .expect("failed to build tauri application");
}

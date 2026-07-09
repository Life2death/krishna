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

    if let Ok(master_key) = std::env::var("KRISHNA_MASTER_KEY") {
        println!("cargo:rustc-env=KRISHNA_MASTER_KEY={}", master_key);
    }

    // Bake the Anthropic API key into MOBILE builds only, so the phone needs no
    // key entry (self-installed personal device). Desktop keeps user-entered keys.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "android" || target_os == "ios" {
        if let Ok(anthropic_key) = std::env::var("ANTHROPIC_API_KEY") {
            println!("cargo:rustc-env=ANTHROPIC_API_KEY={}", anthropic_key);
        }
        // Bake the OpenAI Realtime key into mobile builds too, so Live Voice
        // works on the phone without typing a long key into a mobile keyboard.
        if let Ok(realtime_key) = std::env::var("OPENAI_REALTIME_API_KEY") {
            println!("cargo:rustc-env=OPENAI_REALTIME_API_KEY={}", realtime_key);
        }
    }
    println!("cargo:rerun-if-env-changed=ANTHROPIC_API_KEY");
    println!("cargo:rerun-if-env-changed=OPENAI_REALTIME_API_KEY");

    tauri_build::build()
}

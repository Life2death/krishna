fn main() {
    dotenv::dotenv().ok();
    // Without this, editing .env NEVER triggers a build-script rerun (cargo
    // has no idea the file exists) — the previously-cached rustc-env values
    // keep getting baked in, silently missing any newly added key.
    println!("cargo:rerun-if-changed=.env");

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
        // Bake the Gemini Live key too, so the Gemini Live Voice provider
        // works on the phone without typing a long key into a mobile keyboard.
        if let Ok(gemini_key) = std::env::var("GEMINI_REALTIME_API_KEY") {
            println!("cargo:rustc-env=GEMINI_REALTIME_API_KEY={}", gemini_key);
        }
        // Bake the Google Maps key so travel-time queries work on the phone.
        if let Ok(maps_key) = std::env::var("GOOGLE_MAPS_API_KEY") {
            println!("cargo:rustc-env=GOOGLE_MAPS_API_KEY={}", maps_key);
        }
        // Bake the Turso sync credentials so the phone joins the sync hub and
        // pulls memories/conversations from the desktop. Without these the phone
        // runs "Local only mode" and never receives synced data (e.g. saved
        // home/work addresses). Desktop enters these in its own secure store.
        if let Ok(sync_url) = std::env::var("KRISHNA_SYNC_URL") {
            println!("cargo:rustc-env=KRISHNA_SYNC_URL={}", sync_url);
        }
        if let Ok(sync_token) = std::env::var("KRISHNA_SYNC_TOKEN") {
            println!("cargo:rustc-env=KRISHNA_SYNC_TOKEN={}", sync_token);
        }
    }
    println!("cargo:rerun-if-env-changed=ANTHROPIC_API_KEY");
    println!("cargo:rerun-if-env-changed=OPENAI_REALTIME_API_KEY");
    println!("cargo:rerun-if-env-changed=GEMINI_REALTIME_API_KEY");
    println!("cargo:rerun-if-env-changed=GOOGLE_MAPS_API_KEY");
    println!("cargo:rerun-if-env-changed=KRISHNA_SYNC_URL");
    println!("cargo:rerun-if-env-changed=KRISHNA_SYNC_TOKEN");

    tauri_build::build()
}

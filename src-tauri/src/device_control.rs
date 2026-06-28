use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.krishna.assistant";

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("device-control")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                _api.register_android_plugin(PLUGIN_IDENTIFIER, "DeviceControlPlugin")?;
            }
            Ok(())
        })
        .build()
}

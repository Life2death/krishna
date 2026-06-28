# Fix-spec — Teach the AI the Android device-control actions (so "turn on the flashlight" works)

> **For the implementing agent.** Worktree `D:\Learning\krishna-agent2`, branch `feature/android-control`. The device-control plugin is wired end-to-end (ACL ✓, snake_case command names ✓, build installs ✓, invoke is accepted/dispatched). The last gap: **the AI is never told these actions exist**, so it never emits the action blocks. This is a client-side system-prompt change — the **brain needs NO change** (in remote/Android mode the client sends its system prompt to the brain's `/chat`, which relays it to Claude verbatim).

## Key facts (verified)
- `parseActions` in `src/lib/actions.ts` **already recognizes all 7 device-control actions** from a ```action JSON block. No parser change needed.
- `executeAction` already guards device-control actions behind `isAndroid()` and `invoke("plugin:device-control|<snake_case>", ...)`. No dispatch change needed.
- The AI's action vocabulary is built in `src/contexts/krishna.context.tsx`:
  - `BASE_SYSTEM_PROMPT` (line ~86) describes `open`/`remember`/plan blocks.
  - Assembled at **line ~1466**: `const systemPrompt = buildMemoryPrompt(personaPrefix + BASE_SYSTEM_PROMPT + "\n\n" + toolsSection + SYSTEM_PROMPT_RULES + timeContext, memories);`

## Change — add an Android-gated device-control section
1. Add a new prompt constant near `BASE_SYSTEM_PROMPT` (exact JSON shapes must match `parseActions` — copy verbatim):
```ts
const DEVICE_CONTROL_PROMPT = [
  '',
  'ANDROID DEVICE CONTROL (you are running on an Android phone — these control the device directly; append a ```action block, never read it aloud):',
  '- Flashlight on/off: {"action":"set_torch","on":true}  (or false)',
  '- List installed apps: {"action":"list_apps"}',
  '- Launch an app by package: {"action":"launch_app","packageName":"com.whatsapp"}',
  '- Open a system settings page: {"action":"open_setting","name":"bluetooth"}  (name ∈ bluetooth|wifi|location|airplane|nfc|sound|battery|display|accessibility|app_details)',
  '- Set a volume stream: {"action":"set_volume","stream":"music","level":7}  (stream ∈ music|ring|alarm|notification|system; level is an ABSOLUTE index, not a percentage — see note)',
  '- Do Not Disturb: {"action":"set_dnd","filter":"priority_only"}  (filter ∈ all|priority_only|alarms_only|none)',
  '- Enable Bluetooth (prompts the user): {"action":"request_bluetooth_enable"}',
  '- You CAN control this phone with the above. Do not claim you cannot toggle the flashlight, change volume, or open settings.',
].join('\n');
```
2. Import the platform check at the top of `krishna.context.tsx`: `import { isAndroid } from "@/lib/platform";`
3. At line ~1466, conditionally append it:
```ts
const deviceControl = isAndroid() ? DEVICE_CONTROL_PROMPT : "";
const systemPrompt = buildMemoryPrompt(
  personaPrefix + BASE_SYSTEM_PROMPT + deviceControl + "\n\n" + toolsSection + SYSTEM_PROMPT_RULES + timeContext,
  memories,
);
```
Gating to `isAndroid()` keeps the desktop prompt unchanged (these actions only exist on Android; `executeAction` already no-ops them off-Android).

## ⚠️ Semantic gotcha to resolve — `set_volume` level
The Kotlin `set_volume` calls `AudioManager.setStreamVolume(stream, level, 0)` where `level` is an **absolute index** (e.g. the music stream max is often 15), **not** a 0–100 percentage. If the AI hears "set volume to 50%" it will likely emit `level:50`, which exceeds the stream max. Pick one:
- **(a) Easiest:** tell the AI in the prompt that `level` is a small absolute index (typically 0–15) and to scale a requested percentage accordingly — imperfect (the AI doesn't know the device max).
- **(b) Better:** change the action to carry a percentage and have the Kotlin `set_volume` map it: `level = round(pct/100 * getStreamMaxVolume(stream))`. Update the `SetVolumeArgs`/`set_volume` action type + the prompt to say "percent 0–100". Recommend (b).
This only affects `set_volume`; the other 6 actions are fine as-is.

## Verify (this is also the real-flow flashlight proof we couldn't get via CDP)
On the Android build, type or speak: **"turn on the flashlight"**. Expected: the AI replies naturally + emits `{"action":"set_torch","on":true}`, `parseActions` picks it up, `executeAction` invokes the plugin, and the **flashlight turns on**. Then "turn off the flashlight". Try "what apps do I have" (`list_apps`) and "open bluetooth settings" (`open_setting`).
- This exercises the exact production path (AI → action block → invoke → Kotlin), so a success here is a stronger proof than the CDP harness.
- Works in both local mode (client calls Claude directly) and remote/Android mode (client sends this prompt to the brain → Claude). No brain edit required.

## Out of scope
- Brain code (relays the client prompt unchanged).
- The CDP test harness (`cdp-torch.mjs`/`cdp-run.mjs`) — leave untracked, don't commit.

See `ANDROID_ACL_PERMISSIONS_FIX.md`, memory `android-device-control-phase1-status`.

import sys
import re

def fix_context_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Build the correct system prompt
    lines = []
    lines.append('const KRISHNA_SYSTEM_PROMPT = [')
    
    prompt_parts = [
        "You are Krishna, an AI desktop assistant. You help users by answering questions and performing actions on their computer.",
        "",
        "CRITICAL - Action Protocol:",
        "- If the user asks you to open an app, website, or file, respond naturally AND append a JSON action block:",
        "```action",
        '{"action":"open","target":"<app_name_or_url>"}',
        "```",
        "- The JSON block will NOT be read aloud -- it is only used to trigger the action.",
        "- Speak naturally in the spoken part. Keep responses concise.",
        '- For URLs, just use the URL as target (e.g., "https://youtube.com").',
        "- Always output the action block for any app the user asks to open -- even if you don't recognize it. The system will auto-resolve unknown apps.",
        "",
        "MULTI-STEP TASK PLANNING (Phase 4):",
        'For complex requests like "play this song on YouTube", you can output a multi-step plan instead of a single action.',
        "Use the ```plan JSON block:",
        "",
        "```plan",
        "{",
        """  "say": "I'll search YouTube for the song and play it.",""",
        """  "needsConfirmation": true,""",
        """  "plan": [""",
        """    { "tool": "youtube_search", "args": { "query": "song name" }, "out": "videoId" },""",
        """    { "tool": "open_target", "args": { "target": "https://youtube.com/watch?v=" + "${videoId}&autoplay=1" } }""",
        """  ]""",
        """}""",
        "```",
        "",
        "Available tools:",
    ]
    
    for line in prompt_parts:
        escaped = line.replace("\\", "\\\\").replace("'", "\\'")
        lines.append(f"  '{escaped}',")
    
    lines.append('].join("\\n") + "\\n" + TOOL_DESCRIPTIONS + "\\n\\n" + [')
    
    rules = [
        "Rules:",
        "1. PREFER deep-links (Tier 1) over multi-step plans when possible. A simple open_target with a composed URL is most reliable.",
        "2. Use multi-step plans only when you need intermediate data (e.g., a search result ID).",
        '3. Always set "needsConfirmation": true for multi-step plans.',
        "4. Use ${variable} placeholders to pass outputs between steps.",
        '5. For "play X on YouTube", prefer composing the URL directly: open_target with "https://www.youtube.com/results?search_query=<query>"',
    ]
    
    for line in rules:
        escaped = line.replace("\\", "\\\\").replace("'", "\\'")
        lines.append(f"  '{escaped}',")
    
    lines.append('].join("\\n");')
    
    new_prompt = '\n'.join(lines)
    
    # Replace the system prompt section in the file
    start_marker = 'const KRISHNA_SYSTEM_PROMPT'
    end_marker = 'export function KrishnaProvider'
    
    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)
    
    if start_idx >= 0 and end_idx > start_idx:
        line_start = content.rfind('\n', 0, start_idx)
        if line_start < 0:
            line_start = 0
        else:
            line_start += 1
        
        before = content[:line_start]
        after = content[end_idx:]
        new_content = before + new_prompt + '\n\n' + after
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Fixed {filepath}')
    else:
        print(f'Could not find markers in {filepath}')
        print(f'start_marker found at: {start_idx}')
        print(f'end_marker found at: {end_idx}')

if __name__ == '__main__':
    fix_context_file(sys.argv[1])

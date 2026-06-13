import os

# Fix 1: Remove unused StepAction import from tools/index.ts
path = r"D:\Learning\krishna\src\lib\tools\index.ts"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('import type { StepAction } from "@/types/assistant";', '')
# Also handle potential leading newline
content = content.strip() + '\n'
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed tools/index.ts')

# Fix 2: Fix youtube-search.ts - add title to fallback branch for consistent data shape
path = r"D:\Learning\krishna\src\lib\tools\youtube-search.ts"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    'data: { videoId: searchUrl, title: "", fallback: "true" }',
    'data: { videoId: searchUrl, title: "", fallback: "true" } as Record<string, string>'
)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed youtube-search.ts')

print('Done')

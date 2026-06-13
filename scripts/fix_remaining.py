import os

# Fix 1: Remove unused StepAction import from tools/index.ts
path = r"D:\Learning\krishna\src\lib\tools\index.ts"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("import type { StepAction } from '@/types/assistant';", '')
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed tools/index.ts')

# Fix 2: Remove ExecuteActionResult import from context (if present)
path = r"D:\Learning\krishna\src\contexts\krishna.context.tsx"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("import type { ExecuteActionResult } from \"@/lib/actions\";\n", '')
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed krishna.context.tsx')

# Fix 3: Check all TypeScript files for any remaining issues
print('Done')

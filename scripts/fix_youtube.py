path = r"D:\Learning\krishna\src\lib\tools\youtube-search.ts"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the fallback branch
old1 = 'data: { videoId: searchUrl, fallback: "true" }'
new1 = 'data: { videoId: searchUrl, title: "", fallback: "true" } as Record<string, string>'
content = content.replace(old1, new1)

# Fix the API result branch  
old2 = "data: { videoId: searchResult.videoId, title: searchResult.title, fallback: 'false' }"
new2 = 'data: { videoId: searchResult.videoId, title: searchResult.title, fallback: "false" } as Record<string, string>'
content = content.replace(old2, new2)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed youtube-search.ts')

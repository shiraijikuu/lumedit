# 从 Git Credential Manager 取 GitHub 令牌，创建/获取 Release 并上传安装资产。
# 令牌只存在于脚本变量，绝不打印或落盘。
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'shiraijikuu/lumedit'
$tag = 'v0.1.0'
$root = Split-Path -Parent $PSScriptRoot

# 1) 取令牌：写 ASCII 请求文件，用 cmd 输入重定向喂给 git（规避子进程 stdin 编码/管道差异）
$askFile = Join-Path $env:TEMP ("gcf-{0}.txt" -f ([guid]::NewGuid().ToString('N')))
[IO.File]::WriteAllText($askFile, "protocol=https`r`nhost=github.com`r`n`r`n", [Text.Encoding]::ASCII)
try {
  $cout = (& cmd /c "git credential fill < `"$askFile`" 2>`"$askFile.err`"") -join "`n"
  $cerr = if (Test-Path "$askFile.err") { Get-Content "$askFile.err" -Raw } else { '' }
} finally {
  Remove-Item $askFile -Force -ErrorAction SilentlyContinue
  Remove-Item "$askFile.err" -Force -ErrorAction SilentlyContinue
}
$cred = ($cout -split "`r?`n")
$token = ($cred | Where-Object { $_ -like 'password=*' } | Select-Object -First 1) -replace '^password=', ''
if (-not $token) { throw "无法从 Git 凭据管理器获取 GitHub 令牌。git stderr: $cerr" }
$auth = @{ Authorization = "Bearer $token"; 'User-Agent' = 'lumedit'; Accept = 'application/vnd.github+json' }

# 2) 发布说明（独立 UTF-8 文件，避免脚本内中文 here-string 编码问题）
$notes = [IO.File]::ReadAllText((Join-Path $root 'release-notes.md'), [Text.Encoding]::UTF8)

# 3) 获取已有 release 或新建
$rel = $null
try {
  $rel = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$repo/releases/tags/$tag" -Headers $auth
  "release 已存在: id=$($rel.id)"
} catch {
  $body = @{ tag_name = $tag; name = 'LumEdit v0.1.0'; body = $notes; draft = $false; prerelease = $false } | ConvertTo-Json
  $rel = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repo/releases" -Headers $auth -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
  "release 已创建: id=$($rel.id)"
}
"release url: $($rel.html_url)"

# 4) 上传资产（同名先删后传，保证可重复执行）
$uploadBase = $rel.upload_url -replace '\{\?name,label\}', ''
$existing = @{}
foreach ($a in $rel.assets) { $existing[$a.name] = $a.id }

function Upload-Asset($relPath, $mime) {
  $full = Join-Path $root $relPath
  $name = [IO.Path]::GetFileName($full)
  if ($existing.ContainsKey($name)) {
    Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$repo/releases/assets/$($existing[$name])" -Headers $auth | Out-Null
    "旧资产已删除: $name"
  }
  $bytes = [IO.File]::ReadAllBytes($full)
  $h = @{ Authorization = "Bearer $token"; 'User-Agent' = 'lumedit' }
  $u = "$uploadBase`?name=$name"
  $a = Invoke-RestMethod -Method Post -Uri $u -Headers $h -ContentType $mime -Body $bytes
  "资产上传: $($a.name) state=$($a.state) size=$($a.size)"
  "  下载: $($a.browser_download_url)"
}

Upload-Asset 'release\LumEdit-0.1.0-setup.exe' 'application/octet-stream'
Upload-Asset 'release\latest.yml' 'application/octet-stream'
Upload-Asset 'release\LumEdit-0.1.0-setup.exe.blockmap' 'application/octet-stream'
'ALL_DONE'

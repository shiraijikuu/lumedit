# 临时脚本：启动中的 LumEdit 窗口截两张图（空状态 + 载入样例图）供 README 使用
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  public struct R { public int L; public int T; public int Ri; public int B; }
}
"@
[W]::SetProcessDPIAware() | Out-Null

function Shot([string]$path) {
  $p = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $p) { throw 'window not found' }
  $h = $p.MainWindowHandle
  [W]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 600
  $r = New-Object W+R
  [W]::GetWindowRect($h, [ref]$r) | Out-Null
  $w = $r.Ri - $r.L; $ht = $r.B - $r.T
  $bmp = New-Object System.Drawing.Bitmap($w, $ht)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "saved $path ($w x $ht)"
}

$out = Join-Path $PSScriptRoot '..\docs\screenshots'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Shot (Join-Path $out 'app-main.png')

# 打开样例图：Ctrl+O → 文件对话框输入路径 → 截载入后的界面
[System.Windows.Forms.SendKeys]::SendWait('^o')
Start-Sleep -Seconds 2
[System.Windows.Forms.SendKeys]::SendWait('E:\codex\frame-fix-1-brandlogo-date.jpg')
Start-Sleep -Milliseconds 800
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Start-Sleep -Seconds 7
Shot (Join-Path $out 'app-loaded.png')
Write-Output 'DONE'

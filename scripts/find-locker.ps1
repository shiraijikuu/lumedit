# 找出占用指定文件的进程（Restart Manager API）
param([string]$Target = 'E:\codex\lumedit\release\win-unpacked\resources\app.asar')
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class RMTool {
  [StructLayout(LayoutKind.Sequential)]
  internal struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }
  internal const int CCH_RM_MAX_APP_NAME = 255;
  internal const int CCH_RM_MAX_SVC_NAME = 63;
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  internal struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)] public string strServiceShortName;
    public int ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  private static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);
  [DllImport("rstrtmgr.dll")]
  private static extern int RmEndSession(uint pSessionHandle);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  private static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, RM_UNIQUE_PROCESS[] rgApplications, uint nServices, string[] rgsServiceNames);
  [DllImport("rstrtmgr.dll")]
  private static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);
  public static List<int> FindLockers(string path) {
    var result = new List<int>();
    uint handle;
    var key = Guid.NewGuid().ToString();
    if (RmStartSession(out handle, 0, key) != 0) return result;
    try {
      if (RmRegisterResources(handle, 1, new[] { path }, 0, null, 0, null) != 0) return result;
      uint needed = 0;
      uint count = 20;
      var info = new RM_PROCESS_INFO[20];
      uint reasons = 0;
      if (RmGetList(handle, out needed, ref count, info, ref reasons) == 0) {
        for (int i = 0; i < count && i < needed; i++) result.Add(info[i].Process.dwProcessId);
      }
    } finally { RmEndSession(handle); }
    return result;
  }
}
"@
$ids = [RMTool]::FindLockers($Target)
if ($ids.Count -eq 0) { Write-Output 'NO_LOCKER_FOUND' }
foreach ($id in $ids) {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($p) { Write-Output ("PID " + $id + " -> " + $p.ProcessName + " | " + $p.Path) }
  else { Write-Output ("PID " + $id + " -> (exited)") }
}

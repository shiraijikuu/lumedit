; LogicLib 提供 ${If}/${EndIf}/${OrIf}，显式包含（其内部有幂等保护，可重复包含）
!include LogicLib.nsh

; ============================================================
; LumEdit 安装目录安全加固（electron-builder NSIS include）
;
; 背景：electron-builder 卸载段固定执行 `RMDir /r $INSTDIR`，会递归强删整个
; 安装目录；而 assisted 安装器仅在“路径任意位置不含 APP_FILENAME（大小写敏感）”
; 时才补子文件夹，且该逻辑只在 GUI 目录页生效（静默 /D 安装会绕过）。一旦把安装
; 目录选成已有数据的文件夹（例如项目目录），卸载就会误删其中的其它文件。
;
; 三层加固：
;   1) customInit（.onInit，GUI/静默都执行）：强制 $INSTDIR 末级为 LumEdit。
;   2) .onVerifyInstDir（GUI 浏览改目录时）：同样强制末级为 LumEdit，所见即所得。
;   3) customRemoveFiles（卸载）：只有末级确为 LumEdit 才递归删除，否则只清应用
;      顶层条目并提示，纵深防御 RMDir /r 误删父目录。
; ============================================================

; 判断 $INSTDIR 末级目录名是否等于 ${APP_FILENAME}，结果写入 OUTVAR（"1"/"0"）
!macro LUMEDIT_LAST_IS_APP OUTVAR
  Push $R0
  Push $R1
  Push $R2
  StrLen $R0 "$INSTDIR"
  StrLen $R1 "${APP_FILENAME}"
  IntOp $R2 $R0 - $R1
  StrCpy ${OUTVAR} "0"
  ${If} $R2 >= 0
    StrCpy $R0 "$INSTDIR" $R1 $R2
    ${If} $R0 == "${APP_FILENAME}"
      ${If} $R2 == 0
        StrCpy ${OUTVAR} "1"
      ${Else}
        ; 前一字符必须是路径分隔符，排除 XxxLumEdit 这类同名前缀
        IntOp $R2 $R2 - 1
        StrCpy $R0 "$INSTDIR" 1 $R2
        ${If} $R0 == "\"
        ${OrIf} $R0 == "/"
          StrCpy ${OUTVAR} "1"
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

; 若末级不是 LumEdit，则在其下补一层 LumEdit 子目录
!macro LUMEDIT_ENSURE_SUBDIR
  Push $R9
  !insertmacro LUMEDIT_LAST_IS_APP $R9
  ${If} $R9 != "1"
    StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
  ${EndIf}
  Pop $R9
!macroend

; .onInit 阶段执行：覆盖静默安装 /D 与默认路径
!macro customInit
  !insertmacro LUMEDIT_ENSURE_SUBDIR
!macroend

; GUI 目录页每次选定/校验时触发，即时改写 $INSTDIR
Function .onVerifyInstDir
  !insertmacro LUMEDIT_ENSURE_SUBDIR
FunctionEnd

; 覆盖默认的 `RMDir /r $INSTDIR`：安全卸载
!macro customRemoveFiles
  Push $R9
  !insertmacro LUMEDIT_LAST_IS_APP $R9
  ${If} $R9 == "1"
    ; 先把卸载进程工作目录切出安装目录，否则其占用会导致空壳目录删不掉
    SetOutPath "$TEMP"
    ; 末级确为 LumEdit：本应用专属目录，可整体递归删除；再补一次删空壳目录
    RMDir /r "$INSTDIR"
    RMDir "$INSTDIR"
  ${Else}
    ; 末级不是 LumEdit（异常安装位置）：绝不递归强删，仅清理本应用已知顶层条目
    Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    Delete "$INSTDIR\Uninstall*.exe"
    RMDir /r "$INSTDIR\resources"
    RMDir /r "$INSTDIR\locales"
    Delete "$INSTDIR\*.pak"
    Delete "$INSTDIR\*.dll"
    Delete "$INSTDIR\*.dat"
    Delete "$INSTDIR\*.bin"
    Delete "$INSTDIR\*.txt"
    Delete "$INSTDIR\*.html"
    Delete "$INSTDIR\*.json"
    ; /SD IDOK：静默卸载时不弹窗阻塞
    MessageBox MB_OK|MB_ICONEXCLAMATION|MB_TOPMOST \
      "检测到安装目录末级不是 ${APP_FILENAME}。为避免误删该目录下的其它文件，已停止整体删除，请手动检查：$\n$INSTDIR" /SD IDOK
  ${EndIf}
  Pop $R9
!macroend

; 卸载段最末尾兜底：此时卸载器副本已在临时目录，删除可能残留的空壳 LumEdit 目录
!macro customUnInstall
  Push $R9
  !insertmacro LUMEDIT_LAST_IS_APP $R9
  ${If} $R9 == "1"
    ; 切出安装目录后再兜底删除可能残留的空壳目录
    SetOutPath "$TEMP"
    RMDir "$INSTDIR"
  ${EndIf}
  Pop $R9
!macroend

; Cursiv NSIS Installer & Uninstaller Lifecycle Hooks
; Conçu par Djaël Mola pour garantir une désinstallation et réinstallation 100% propre sans verrouillage de fichiers

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Arrêt des processus Cursiv résiduels avant installation..."
  nsExec::Exec 'taskkill /F /IM cursiv.exe'
  nsExec::Exec 'taskkill /F /IM Cursiv.exe'
  Sleep 600
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Arrêt des processus Cursiv avant désinstallation..."
  nsExec::Exec 'taskkill /F /IM cursiv.exe'
  nsExec::Exec 'taskkill /F /IM Cursiv.exe'
  Sleep 600
!macroend


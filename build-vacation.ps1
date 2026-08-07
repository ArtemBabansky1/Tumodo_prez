# Сборка тестовой презентации Vacation with Tumodo с кадрами-заглушками.
# Запуск: правой кнопкой по файлу → "Выполнить с помощью PowerShell",
# или в терминале в папке проекта:  ./build-vacation.ps1
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$src = 'input\requests\2026-08-07-11-53-34'
$dst = 'design-system\photos'

Copy-Item "$src\Frame 1.png"           "$dst\dashboard-home.png"   -Force
Copy-Item "$src\Frame 1-1.png"         "$dst\dashboard-home-2.png" -Force
Copy-Item "$src\Frame 5.png"           "$dst\trips-cards.png"      -Force
Copy-Item "$src\Frame 2131329177.png"  "$dst\reports-expense.png"  -Force
Copy-Item "$src\Frame 2131329180.png"  "$dst\trips-search.png"     -Force
Copy-Item "$src\Frame 2131329184.png"  "$dst\edit-panel.png"       -Force
Write-Host 'Кадры-заглушки скопированы в design-system\photos' -ForegroundColor Green

node scripts/build.js vacation-tumodo
node scripts/screenshot.js vacation-tumodo

Write-Host 'Готово. Откройте output\vacation-tumodo\index.html' -ForegroundColor Green

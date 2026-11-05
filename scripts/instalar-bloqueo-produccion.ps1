# Instala el hook pre-push que bloquea los push a produccion. Lo corre el usuario, una sola vez en cada PC.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\instalar-bloqueo-produccion.ps1
$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
$Origen = Join-Path $PSScriptRoot 'pre-push'
$Destino = Join-Path $Repo '.git\hooks\pre-push'

# Git para Windows corre el hook con sh: necesita saltos de linea de Unix y sin BOM.
$texto = [IO.File]::ReadAllText($Origen).Replace("`r`n", "`n")
[IO.File]::WriteAllText($Destino, $texto, (New-Object System.Text.UTF8Encoding($false)))

# sh viene con Git para Windows, pero no suele estar en el PATH de PowerShell.
$RaizGit = Split-Path (Split-Path (Get-Command git).Source -Parent) -Parent
$Sh = Join-Path $RaizGit 'bin\sh.exe'
if (-not (Test-Path $Sh)) { throw "Hook instalado, pero no se pudo comprobar: no se encontro $Sh" }

Remove-Item Env:AUTORIZO_PRODUCCION -ErrorAction SilentlyContinue
$ErrorActionPreference = 'Continue'
& $Sh ($Destino -replace '\\', '/') origin 'https://github.com/RQO0581/AppGastos.git' *> $null
if ($LASTEXITCODE -eq 0) { throw 'El hook no bloquea produccion: revisalo.' }
Write-Output 'Bloqueo instalado y comprobado: un push a produccion sin autorizacion se rechaza.'

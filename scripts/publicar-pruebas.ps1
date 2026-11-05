# Publica el codigo actual en el sitio de PRUEBAS, nunca en produccion.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\publicar-pruebas.ps1
#
# Solo sube la app ya compilada, en un repositorio aparte y sin historial: los documentos y el codigo
# de este repositorio no se copian alla. Vive en otra organizacion de GitHub para que el navegador
# la trate como otro sitio: asi sus datos quedan separados de los de la app real.
param([switch]$SaltarPruebas)

$ErrorActionPreference = 'Stop'

$Destino = 'https://github.com/appgastos-pruebas/AppGastos-Pruebas.git'
$RutaBase = '/AppGastos-Pruebas/'
$Color = '#e65100'

if ($Destino -notmatch '^https://github\.com/appgastos-pruebas/AppGastos-Pruebas\.git$') {
    throw 'Este script solo puede publicar en el repositorio de pruebas.'
}

$Repo = Split-Path $PSScriptRoot -Parent
$Trabajo = Join-Path $env:TEMP 'AppGastos-Pruebas-publicar'
$Copia = Join-Path $Trabajo 'copia'
$Salida = Join-Path $Trabajo 'salida'
$Sitio = Join-Path $Trabajo 'sitio'
$SinBom = New-Object System.Text.UTF8Encoding($false)

function Comprobar([string]$Paso) {
    if ($LASTEXITCODE -ne 0) { throw "Fallo: $Paso (codigo $LASTEXITCODE)" }
}

function Cambiar([string]$Ruta, [string]$Viejo, [string]$Nuevo) {
    $texto = [IO.File]::ReadAllText($Ruta, $SinBom)
    if (-not $texto.Contains($Viejo)) { throw "No se encontro '$Viejo' en $Ruta" }
    [IO.File]::WriteAllText($Ruta, $texto.Replace($Viejo, $Nuevo), $SinBom)
}

if (-not $SaltarPruebas) {
    Write-Output '--- pruebas automaticas ---'
    dotnet test (Join-Path $Repo 'tests\AppGastos.Tests') --nologo --verbosity quiet
    Comprobar 'pruebas automaticas'
}

if (Test-Path $Trabajo) { Remove-Item $Trabajo -Recurse -Force }
New-Item -ItemType Directory -Force $Copia, $Salida, $Sitio | Out-Null

# Se cambia una copia: el codigo de este repositorio queda igual que el de produccion.
robocopy (Join-Path $Repo 'src\AppGastos') $Copia /E /XD bin obj /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Fallo: copiar el codigo (codigo $LASTEXITCODE)" }
$LASTEXITCODE = 0

# La version de esta publicacion, en hora de Puerto Rico (UTC-4 todo el anio; una prueba automatica lo vigila).
$VersionPruebas = [DateTime]::UtcNow.AddHours(-4).ToString('yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture)
[IO.File]::WriteAllText((Join-Path $Copia 'version-pruebas.txt'), "$VersionPruebas`n", $SinBom)

# Debe hacerse antes de publicar: el service worker verifica el hash de index.html.
$Index = Join-Path $Copia 'wwwroot\index.html'
$Manifest = Join-Path $Copia 'wwwroot\manifest.webmanifest'
Cambiar $Index '<base href="/" />' "<base href=`"$RutaBase`" />"
Cambiar $Index 'content="#1565c0"' "content=`"$Color`""
Cambiar $Index 'content="AppGastos"' 'content="AG Pruebas"'
Cambiar $Index '<title>AppGastos</title>' '<title>AppGastos Pruebas</title>'
$Franja = "<div id=`"franja-pruebas`" style=`"position:fixed;top:0;left:0;right:0;z-index:2000;padding:calc(0.125rem + env(safe-area-inset-top)) 0 0.125rem;color:#ffffff;background:$Color;font-size:0.75rem;font-weight:700;text-align:center`">PRUEBAS</div><style>.pantalla{padding-top:calc(2.25rem + env(safe-area-inset-top))}</style>"
Cambiar $Index '<div id="app">' "$Franja`n    <div id=`"app`">"
Cambiar $Manifest '"name": "AppGastos"' '"name": "AppGastos Pruebas"'
Cambiar $Manifest '"short_name": "AppGastos"' '"short_name": "AG Pruebas"'
Cambiar $Manifest '"theme_color": "#1565c0"' "`"theme_color`": `"$Color`""

# Un icono de otro color, para no confundirla con la app real en la pantalla de inicio.
Add-Type -AssemblyName System.Drawing
foreach ($lado in 192, 512) {
    $imagen = New-Object System.Drawing.Bitmap($lado, $lado, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($imagen)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear([System.Drawing.ColorTranslator]::FromHtml($Color))
    $fuente = New-Object System.Drawing.Font('Segoe UI', ($lado * 0.46), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $formato = New-Object System.Drawing.StringFormat
    $formato.Alignment = 'Center'
    $formato.LineAlignment = 'Center'
    $g.DrawString('P', $fuente, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, 0, $lado, $lado)), $formato)
    $imagen.Save((Join-Path $Copia "wwwroot\icon-$lado.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $imagen.Dispose(); $fuente.Dispose()
}

Write-Output '--- compilando ---'
# Sin simbolos de depuracion: llevan rutas de esta PC, con el nombre del usuario.
dotnet publish (Join-Path $Copia 'AppGastos.csproj') -c Release -o $Salida -p:DebugType=none -p:DebugSymbols=false --nologo --verbosity quiet
Comprobar 'compilar'

Copy-Item (Join-Path $Salida 'wwwroot\*') $Sitio -Recurse
Copy-Item (Join-Path $Sitio 'index.html') (Join-Path $Sitio '404.html')
# Sin este archivo, GitHub Pages no sirve la carpeta _framework.
New-Item -ItemType File (Join-Path $Sitio '.nojekyll') | Out-Null

# Revision de datos personales de lo que se va a subir. Lo comprimido repite estos mismos archivos.
$Latin1 = [Text.Encoding]::GetEncoding(28591)
$Encontrados = Get-ChildItem $Sitio -Recurse -File | Where-Object { $_.Extension -notin '.br', '.gz' } | Where-Object {
    $contenido = [IO.File]::ReadAllText($_.FullName, $Latin1)
    $contenido -match [regex]::Escape($env:USERNAME)
}
if (@($Encontrados).Count -gt 0) {
    throw ('Hay datos personales en: ' + (@($Encontrados | ForEach-Object { $_.Name }) -join ', '))
}
Write-Output 'revision de datos personales en lo compilado: 0 coincidencias'

Write-Output '--- publicando en pruebas ---'
$Correo = git -C $Repo config user.email
$Nombre = git -C $Repo config user.name
$ErrorActionPreference = 'Continue'
git -C $Sitio init -q -b main
git -C $Sitio config user.email $Correo
git -C $Sitio config user.name $Nombre
git -C $Sitio config core.autocrlf false
git -C $Sitio add -A
git -C $Sitio commit -q -m 'Publicar en pruebas'
Comprobar 'crear el commit'
# Sin historial: cada publicacion reemplaza a la anterior.
git -C $Sitio push -q --force $Destino main
Comprobar 'subir a pruebas'
Write-Output 'publicado: https://appgastos-pruebas.github.io/AppGastos-Pruebas/'

# Solo despues de subir: produccion usara esta version cuando este archivo llegue en un commit.
[IO.File]::WriteAllText((Join-Path $Repo 'src\AppGastos\version-pruebas.txt'), "$VersionPruebas`n", $SinBom)
Write-Output "version publicada: $VersionPruebas (hay que incluir version-pruebas.txt en el commit)"

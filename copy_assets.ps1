# copy_assets.ps1 - Synchronizes web assets to Android project directories

$targetDirs = @(
    "parchesys-app-android/app/src/main/assets",
    "parchesys-inventario-android/app/src/main/assets",
    "parchesys-mapa-mesas-android/app/src/main/assets"
)

# Files to copy
$files = @(
    "LOGOPARCHESYS.png",
    "PARCHESYS-APP.html",
    "bar.html",
    "dte-adapter.js",
    "dte-engine.js",
    "firebase-app-compat.js",
    "firebase-config.js",
    "firebase-database-compat.js",
    "jspdf.plugin.autotable.min.js",
    "jspdf.umd.min.js",
    "login.html",
    "mapa-mesas-tablet.html",
    "mapa-mesas.html",
    "modus-design.css",
    "negocio-id.js",
    "portal-food.html",
    "pos-food-tablet.css",
    "pos-food-tablet.html",
    "pos-food.html",
    "inventario-tablet.html"
)

foreach ($dir in $targetDirs) {
    $absDir = Join-Path $PSScriptRoot $dir
    if (Test-Path $absDir) {
        Write-Host "Syncing to $absDir..."
        foreach ($file in $files) {
            $absFile = Join-Path $PSScriptRoot $file
            if (Test-Path $absFile) {
                Copy-Item -Path $absFile -Destination $absDir -Force
            }
        }
    } else {
        Write-Warning "Directory $absDir does not exist. Skipping."
    }
}

Write-Host "Assets sync completed successfully!"

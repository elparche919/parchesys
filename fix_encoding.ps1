# fix_encoding.ps1 - Repara el encoding mojibake Latin-1->UTF-8 en empleados.html
$file = "empleados.html"
$backup = "empleados.html.bak"

# Backup primero
Copy-Item $file $backup -Force
Write-Host "Backup creado: $backup"

# Leer bytes raw
$bytes = [System.IO.File]::ReadAllBytes($file)

# Detectar si es UTF-8 con BOM
$isBOM = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)

# Leer como Latin-1 para ver el texto real en disco
$latin1Enc = [System.Text.Encoding]::GetEncoding('iso-8859-1')
$text = $latin1Enc.GetString($bytes)

# Verificar tipo de problema
$isMojibake = $text -match "GestiÃ³n" -or $text -match "ÃƒÂ©" -or $text -match "Ã¡"
Write-Host "¿Mojibake detectado? $isMojibake"
Write-Host "¿BOM presente? $isBOM"

if ($isMojibake) {
    # El archivo dice ser Latin-1 pero en realidad contiene UTF-8 mal interpretado
    # Necesitamos leer los bytes como si fueran UTF-8
    $utf8Enc = [System.Text.Encoding]::UTF8
    $fixedText = $utf8Enc.GetString($bytes)
    
    # Verificar que sea legible
    if ($fixedText -match "Gesti") {
        Write-Host "Texto reparado correctamente. Guardando..."
        # Guardar con UTF-8 puro sin BOM
        [System.IO.File]::WriteAllText($file, $fixedText, [System.Text.Encoding]::UTF8)
        Write-Host "ÉXITO: Archivo guardado como UTF-8"
    } else {
        Write-Host "ERROR: No se pudo reparar correctamente"
    }
} else {
    Write-Host "El archivo parece estar en buen estado o tiene otro tipo de problema"
    # Forzar re-guardado como UTF-8 limpio
    $text2 = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($file, $text2, [System.Text.Encoding]::UTF8)
    Write-Host "Re-guardado como UTF-8"
}

Write-Host "Proceso completado."

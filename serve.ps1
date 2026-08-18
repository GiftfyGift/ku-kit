param(
    [int]$Port = 8843,
    [string]$Root = $PSScriptRoot
)

$ParentRoot = Split-Path -Path $Root -Parent

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root on http://localhost:$Port/ (media proxy -> $ParentRoot)"

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".mp4"  = "video/mp4"
    ".pdf"  = "application/pdf"
}

function Send-File {
    param($response, $filePath, $rangeHeader)

    $ext = [System.IO.Path]::GetExtension($filePath)
    $contentType = $mime[$ext]
    if (-not $contentType) { $contentType = "application/octet-stream" }

    $fs = [System.IO.File]::Open($filePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
        $fileLength = $fs.Length
        $response.Headers.Add("Accept-Ranges", "bytes")
        $response.ContentType = $contentType

        $start = 0
        $end = $fileLength - 1

        if ($rangeHeader -and $rangeHeader -match 'bytes=(\d*)-(\d*)') {
            if ($matches[1] -ne '') { $start = [int64]$matches[1] }
            if ($matches[2] -ne '') { $end = [int64]$matches[2] }
            if ($end -ge $fileLength) { $end = $fileLength - 1 }
            $response.StatusCode = 206
            $response.Headers.Add("Content-Range", "bytes $start-$end/$fileLength")
        } else {
            $response.StatusCode = 200
        }

        $lengthToSend = $end - $start + 1
        $response.ContentLength64 = $lengthToSend

        $fs.Seek($start, [System.IO.SeekOrigin]::Begin) | Out-Null
        $buffer = New-Object byte[] 65536
        $remaining = $lengthToSend
        while ($remaining -gt 0) {
            $toRead = [Math]::Min($buffer.Length, $remaining)
            $read = $fs.Read($buffer, 0, $toRead)
            if ($read -le 0) { break }
            $response.OutputStream.Write($buffer, 0, $read)
            $remaining -= $read
        }
    } finally {
        $fs.Close()
    }
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
        $path = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
        $rangeHeader = $request.Headers["Range"]

        if ($path -eq "/") { $path = "/index.html" }

        if ($path.StartsWith("/media/")) {
            $filePath = Join-Path $ParentRoot ($path.Substring(7))
        } else {
            $filePath = Join-Path $Root ($path.TrimStart('/'))
        }

        if (Test-Path $filePath -PathType Leaf) {
            Send-File -response $response -filePath $filePath -rangeHeader $rangeHeader
        } else {
            $response.StatusCode = 404
            $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
            $response.OutputStream.Write($notFound, 0, $notFound.Length)
        }
    } catch {
        try {
            $response.StatusCode = 500
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("500: $($_.Exception.Message)")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        } catch {}
    } finally {
        $response.OutputStream.Close()
    }
}

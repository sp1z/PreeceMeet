# Run this script once to generate app.ico from a simple colored square.
# Requires PowerShell on Windows.
Add-Type -AssemblyName System.Drawing

$bmp = New-Object System.Drawing.Bitmap(32, 32)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.FillRectangle([System.Drawing.Brushes]::MidnightBlue, 0, 0, 32, 32)
$g.FillEllipse([System.Drawing.Brushes]::MediumSlateBlue, 4, 4, 24, 24)
$g.Dispose()

$icoPath = Join-Path $PSScriptRoot "app.ico"
$stream  = [System.IO.File]::OpenWrite($icoPath)

function Write-ICO([System.Drawing.Bitmap]$bitmap, [System.IO.Stream]$output) {
    $ms = New-Object System.IO.MemoryStream
    $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $ms.ToArray()

    $writer = New-Object System.IO.BinaryWriter($output)
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]1)
    $writer.Write([byte]$bitmap.Width)
    $writer.Write([byte]$bitmap.Height)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]0)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$pngBytes.Length)
    $writer.Write([uint32]22)
    $writer.Write($pngBytes)
    $writer.Flush()
}

Write-ICO $bmp $stream
$stream.Close()
$bmp.Dispose()
Write-Host "Created $icoPath"

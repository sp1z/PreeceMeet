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

# Minimal ICO writer
function Write-ICO([System.Drawing.Bitmap]$bitmap, [System.IO.Stream]$output) {
    $ms = New-Object System.IO.MemoryStream
    $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $ms.ToArray()

    $writer = New-Object System.IO.BinaryWriter($output)
    # ICONDIR header
    $writer.Write([uint16]0)      # reserved
    $writer.Write([uint16]1)      # type: ICO
    $writer.Write([uint16]1)      # count

    # ICONDIRENTRY
    $writer.Write([byte]$bitmap.Width)
    $writer.Write([byte]$bitmap.Height)
    $writer.Write([byte]0)        # color count
    $writer.Write([byte]0)        # reserved
    $writer.Write([uint16]0)      # planes
    $writer.Write([uint16]32)     # bit count
    $writer.Write([uint32]$pngBytes.Length)
    $writer.Write([uint32]22)     # image offset = 6 + 16

    $writer.Write($pngBytes)
    $writer.Flush()
}

Write-ICO $bmp $stream
$stream.Close()
$bmp.Dispose()
Write-Host "Created $icoPath"

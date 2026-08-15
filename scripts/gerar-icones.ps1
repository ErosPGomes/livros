# Desenha os ícones do app. A marca é o próprio leitor visto de longe: linhas de texto em papel e a
# linha vertical de foco atravessando o centro, na cor de brasa.
#
#   powershell -ExecutionPolicy Bypass -File scripts\gerar-icones.ps1

Add-Type -AssemblyName System.Drawing

$destino = Join-Path $PSScriptRoot "..\web\icons"
New-Item -ItemType Directory -Force -Path $destino | Out-Null

$tinta  = [System.Drawing.ColorTranslator]::FromHtml("#0C0D11")
$papel  = [System.Drawing.ColorTranslator]::FromHtml("#EDE6D6")
$brasa  = [System.Drawing.ColorTranslator]::FromHtml("#E8963C")

function New-Icone {
    param([int]$Tamanho, [string]$Arquivo, [double]$Margem = 0.16)

    $bitmap = New-Object System.Drawing.Bitmap($Tamanho, $Tamanho)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear($tinta)

    $pincelPapel = New-Object System.Drawing.SolidBrush($papel)
    $pincelBrasa = New-Object System.Drawing.SolidBrush($brasa)

    $borda = [int]($Tamanho * $Margem)
    $largura = $Tamanho - ($borda * 2)
    $altura = [Math]::Max([int]($Tamanho * 0.055), 2)
    $espaco = [int]($altura * 1.9)

    # Quatro linhas de texto, a terceira mais curta como um parágrafo que termina.
    $proporcoes = @(1.0, 1.0, 0.62, 1.0)
    $y = [int]($Tamanho * 0.28)
    foreach ($proporcao in $proporcoes) {
        $g.FillRectangle($pincelPapel, $borda, $y, [int]($largura * $proporcao), $altura)
        $y += $altura + $espaco
    }

    # A linha de foco atravessa tudo: é ela que diz que este app lê em ponto fixo.
    $larguraFoco = [Math]::Max([int]($Tamanho * 0.035), 2)
    $x = [int](($Tamanho - $larguraFoco) / 2)
    $topo = [int]($Tamanho * 0.18)
    $baixo = [int]($Tamanho * 0.82)
    $g.FillRectangle($pincelBrasa, $x, $topo, $larguraFoco, $baixo - $topo)

    $caminho = Join-Path $destino $Arquivo
    $bitmap.Save($caminho, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose(); $bitmap.Dispose(); $pincelPapel.Dispose(); $pincelBrasa.Dispose()
    Write-Output "$Arquivo ($Tamanho x $Tamanho)"
}

New-Icone -Tamanho 192 -Arquivo "icone-192.png"
New-Icone -Tamanho 512 -Arquivo "icone-512.png"
New-Icone -Tamanho 180 -Arquivo "icone-180.png"
# O ícone mascarável precisa de mais folga: o Android corta as bordas em círculo.
New-Icone -Tamanho 512 -Arquivo "icone-maskable-512.png" -Margem 0.28

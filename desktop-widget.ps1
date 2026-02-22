param(
  [int]$RefreshSeconds = 3,
  [switch]$HeadlessCheck
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $rootDir "data"
$chaptersPath = Join-Path $dataDir "chapters.json"
$himanshuPath = Join-Path $dataDir "himanshu.json"
$priyanshuPath = Join-Path $dataDir "priyanshu.json"
$subjectKeys = @("mathematics", "physics", "chemistry")

function Read-JsonFile {
  param(
    [string]$Path,
    $DefaultValue
  )

  if (-not (Test-Path $Path)) {
    return $DefaultValue
  }

  try {
    $raw = Get-Content -Path $Path -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) {
      return $DefaultValue
    }
    return ($raw | ConvertFrom-Json -Depth 100)
  } catch {
    return $DefaultValue
  }
}

function Get-ChapterMapBySubject {
  $chaptersObj = Read-JsonFile -Path $chaptersPath -DefaultValue @{}
  $map = @{}

  foreach ($subject in $subjectKeys) {
    $map[$subject] = @()
    if ($null -eq $chaptersObj) { continue }
    $subjectValue = $chaptersObj.$subject
    if ($null -eq $subjectValue) { continue }

    foreach ($chapter in @($subjectValue)) {
      if ($null -eq $chapter) { continue }
      $id = [string]$chapter.id
      $name = [string]$chapter.name
      $targetRaw = 0
      try { $targetRaw = [int]$chapter.target } catch { $targetRaw = 0 }
      $target = [Math]::Max(0, $targetRaw)

      $map[$subject] += [PSCustomObject]@{
        id = $id
        name = $name
        target = $target
      }
    }
  }

  return $map
}

function Get-UserProgress {
  param(
    [string]$Name,
    [string]$FilePath,
    [hashtable]$ChapterMap
  )

  $userObj = Read-JsonFile -Path $FilePath -DefaultValue @{}
  $totalTarget = 0
  $totalSolved = 0

  foreach ($subject in $subjectKeys) {
    $solvedBucket = $null
    if ($null -ne $userObj -and $null -ne $userObj.solvedBySubject) {
      $solvedBucket = $userObj.solvedBySubject.$subject
    }

    foreach ($chapter in @($ChapterMap[$subject])) {
      $target = [Math]::Max(0, [int]$chapter.target)
      $totalTarget += $target

      $rawSolved = 0
      if ($null -ne $solvedBucket -and $null -ne $chapter.id -and $chapter.id -ne "") {
        try { $rawSolved = [int]$solvedBucket.($chapter.id) } catch { $rawSolved = 0 }
      }

      $safeSolved = [Math]::Min($target, [Math]::Max(0, $rawSolved))
      $totalSolved += $safeSolved
    }
  }

  $percent = 0
  if ($totalTarget -gt 0) {
    $percent = [Math]::Round((100.0 * $totalSolved) / $totalTarget, 1)
  }

  return [PSCustomObject]@{
    name = $Name
    solved = $totalSolved
    target = $totalTarget
    percent = $percent
  }
}

function Get-ProgressSnapshot {
  $chapterMap = Get-ChapterMapBySubject
  $himanshu = Get-UserProgress -Name "Himanshu" -FilePath $himanshuPath -ChapterMap $chapterMap
  $priyanshu = Get-UserProgress -Name "Priyanshu" -FilePath $priyanshuPath -ChapterMap $chapterMap

  $leader = "Tie"
  if ($himanshu.percent -gt $priyanshu.percent) {
    $leader = "Himanshu"
  } elseif ($priyanshu.percent -gt $himanshu.percent) {
    $leader = "Priyanshu"
  }

  return [PSCustomObject]@{
    himanshu = $himanshu
    priyanshu = $priyanshu
    leader = $leader
  }
}

if ($HeadlessCheck) {
  $snapshot = Get-ProgressSnapshot
  $snapshot | ConvertTo-Json -Depth 8
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function New-RoundedPath {
  param(
    [System.Drawing.Rectangle]$Rect,
    [int]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = [Math]::Max(1, $Radius * 2)

  $path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rect.X, $Rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Clamp-Percent {
  param([double]$Value)
  return [Math]::Max(0, [Math]::Min(100, $Value))
}

$script:snapshot = Get-ProgressSnapshot

$form = New-Object System.Windows.Forms.Form
$form.Text = "Pro Grace Widget"
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Size = New-Object System.Drawing.Size(430, 136)
$form.BackColor = [System.Drawing.Color]::FromArgb(7, 11, 19)
$form.ForeColor = [System.Drawing.Color]::FromArgb(228, 239, 255)
$form.TopMost = $true
$form.ShowInTaskbar = $false

$screenBounds = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(($screenBounds.Right - $form.Width - 14), ($screenBounds.Top + 14))

$doubleBufferProp = $form.GetType().GetProperty("DoubleBuffered", [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic)
if ($doubleBufferProp) {
  $doubleBufferProp.SetValue($form, $true, $null)
}

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.AutoSize = $false
$titleLabel.Size = New-Object System.Drawing.Size(300, 22)
$titleLabel.Location = New-Object System.Drawing.Point(12, 8)
$titleLabel.Text = "Pro Grace Competitive Progress"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(231, 245, 255)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.AutoSize = $false
$statusLabel.Size = New-Object System.Drawing.Size(390, 20)
$statusLabel.Location = New-Object System.Drawing.Point(12, 104)
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(194, 214, 236)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Text = "×"
$closeButton.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$closeButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$closeButton.FlatAppearance.BorderSize = 0
$closeButton.Size = New-Object System.Drawing.Size(32, 28)
$closeButton.Location = New-Object System.Drawing.Point(($form.Width - 36), 4)
$closeButton.BackColor = [System.Drawing.Color]::FromArgb(20, 29, 43)
$closeButton.ForeColor = [System.Drawing.Color]::FromArgb(224, 236, 253)
$closeButton.Add_Click({ $form.Close() })

$trackPanel = New-Object System.Windows.Forms.Panel
$trackPanel.Size = New-Object System.Drawing.Size(392, 66)
$trackPanel.Location = New-Object System.Drawing.Point(18, 34)
$trackPanel.BackColor = [System.Drawing.Color]::FromArgb(9, 15, 25)

$drawMarker = {
  param(
    [System.Drawing.Graphics]$g,
    [float]$x,
    [float]$y,
    [System.Drawing.Color]$fillColor,
    [string]$label,
    [bool]$isLeader
  )

  $size = 20
  $rect = New-Object System.Drawing.RectangleF(($x - ($size / 2)), ($y - ($size / 2)), $size, $size)
  $brush = New-Object System.Drawing.SolidBrush($fillColor)
  $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(18, 28, 41), 2)
  $font = New-Object System.Drawing.Font("Segoe UI Semibold", 8.3, [System.Drawing.FontStyle]::Bold)
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(13, 20, 32))

  $g.FillEllipse($brush, $rect)
  $g.DrawEllipse($borderPen, $rect)

  $textSize = $g.MeasureString($label, $font)
  $g.DrawString($label, $font, $textBrush, ($x - ($textSize.Width / 2)), ($y - ($textSize.Height / 2) - 0.5))

  if ($isLeader) {
    $crownFont = New-Object System.Drawing.Font("Segoe UI Emoji", 10, [System.Drawing.FontStyle]::Regular)
    $crownSize = $g.MeasureString("👑", $crownFont)
    $g.DrawString("👑", $crownFont, [System.Drawing.Brushes]::Gold, ($x - ($crownSize.Width / 2)), ($y - 24))
    $crownFont.Dispose()
  }

  $textBrush.Dispose()
  $font.Dispose()
  $borderPen.Dispose()
  $brush.Dispose()
}

$trackPanel.Add_Paint({
    param($sender, $e)

    $g = $e.Graphics
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(9, 15, 25))

    $paddingLeft = 12
    $paddingRight = 12
    $trackTop = 24
    $trackHeight = 14
    $trackWidth = $sender.Width - $paddingLeft - $paddingRight

    $trackRect = New-Object System.Drawing.Rectangle($paddingLeft, $trackTop, $trackWidth, $trackHeight)
    $trackPath = New-RoundedPath -Rect $trackRect -Radius 7

    $trackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22, 50, 31))
    $trackBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(82, 148, 108), 1)
    $g.FillPath($trackBrush, $trackPath)
    $g.DrawPath($trackBorder, $trackPath)

    $fillRect = New-Object System.Drawing.Rectangle(($paddingLeft + 2), ($trackTop + 2), ($trackWidth - 4), ($trackHeight - 4))
    $fillPath = New-RoundedPath -Rect $fillRect -Radius 5
    $fillBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      $fillRect,
      [System.Drawing.Color]::FromArgb(38, 140, 71),
      [System.Drawing.Color]::FromArgb(123, 193, 56),
      [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal
    )
    $g.FillPath($fillBrush, $fillPath)

    $fontSmall = New-Object System.Drawing.Font("Segoe UI", 8)
    $hText = "Himanshu " + $script:snapshot.himanshu.percent.ToString("0.#") + "%"
    $pText = "Priyanshu " + $script:snapshot.priyanshu.percent.ToString("0.#") + "%"
    $g.DrawString($hText, $fontSmall, [System.Drawing.Brushes]::LightGoldenrodYellow, 0, 48)
    $pSize = $g.MeasureString($pText, $fontSmall)
    $g.DrawString($pText, $fontSmall, [System.Drawing.Brushes]::SkyBlue, ($sender.Width - $pSize.Width), 48)

    $hPct = Clamp-Percent -Value $script:snapshot.himanshu.percent
    $pPct = Clamp-Percent -Value $script:snapshot.priyanshu.percent
    $markerY = $trackTop + ($trackHeight / 2)
    $hX = $paddingLeft + ([Math]::Round(($trackWidth - 1) * ($hPct / 100.0)))
    $pX = $paddingLeft + ([Math]::Round(($trackWidth - 1) * ($pPct / 100.0)))
    $hX = [Math]::Max(($paddingLeft + 2), [Math]::Min(($paddingLeft + $trackWidth - 2), $hX))
    $pX = [Math]::Max(($paddingLeft + 2), [Math]::Min(($paddingLeft + $trackWidth - 2), $pX))

    & $drawMarker $g $hX $markerY ([System.Drawing.Color]::FromArgb(255, 244, 168)) "H" ($script:snapshot.leader -eq "Himanshu")
    & $drawMarker $g $pX $markerY ([System.Drawing.Color]::FromArgb(135, 216, 255)) "P" ($script:snapshot.leader -eq "Priyanshu")

    $fontSmall.Dispose()
    $fillBrush.Dispose()
    $fillPath.Dispose()
    $trackBrush.Dispose()
    $trackBorder.Dispose()
    $trackPath.Dispose()
})

function Update-WidgetSnapshot {
  $script:snapshot = Get-ProgressSnapshot

  if ($script:snapshot.leader -eq "Tie") {
    $statusLabel.Text = "Neck to neck. Keep pushing."
  } else {
    $leaderPct = if ($script:snapshot.leader -eq "Himanshu") { $script:snapshot.himanshu.percent } else { $script:snapshot.priyanshu.percent }
    $trailerPct = if ($script:snapshot.leader -eq "Himanshu") { $script:snapshot.priyanshu.percent } else { $script:snapshot.himanshu.percent }
    $gap = [Math]::Round([Math]::Abs($leaderPct - $trailerPct), 1)
    $statusLabel.Text = "$($script:snapshot.leader) leading by $gap%."
  }

  $trackPanel.Invalidate()
}

$drag = $false
$dragStart = [System.Drawing.Point]::Empty
$formStart = [System.Drawing.Point]::Empty

$startDrag = {
  param($sender, $args)
  if ($args.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
  $script:drag = $true
  $script:dragStart = [System.Windows.Forms.Control]::MousePosition
  $script:formStart = $form.Location
}

$performDrag = {
  param($sender, $args)
  if (-not $script:drag) { return }
  $current = [System.Windows.Forms.Control]::MousePosition
  $dx = $current.X - $script:dragStart.X
  $dy = $current.Y - $script:dragStart.Y
  $form.Location = New-Object System.Drawing.Point(($script:formStart.X + $dx), ($script:formStart.Y + $dy))
}

$endDrag = {
  param($sender, $args)
  $script:drag = $false
}

$form.Add_MouseDown($startDrag)
$form.Add_MouseMove($performDrag)
$form.Add_MouseUp($endDrag)
$titleLabel.Add_MouseDown($startDrag)
$titleLabel.Add_MouseMove($performDrag)
$titleLabel.Add_MouseUp($endDrag)
$trackPanel.Add_MouseDown($startDrag)
$trackPanel.Add_MouseMove($performDrag)
$trackPanel.Add_MouseUp($endDrag)

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$refreshItem = $contextMenu.Items.Add("Refresh now")
$refreshItem.Add_Click({ Update-WidgetSnapshot })
$exitItem = $contextMenu.Items.Add("Exit widget")
$exitItem.Add_Click({ $form.Close() })
$form.ContextMenuStrip = $contextMenu
$trackPanel.ContextMenuStrip = $contextMenu

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = [Math]::Max(1000, ($RefreshSeconds * 1000))
$timer.Add_Tick({ Update-WidgetSnapshot })
$timer.Start()

$form.Controls.Add($titleLabel)
$form.Controls.Add($statusLabel)
$form.Controls.Add($closeButton)
$form.Controls.Add($trackPanel)
$form.Add_FormClosed({ $timer.Stop() })

Update-WidgetSnapshot
[System.Windows.Forms.Application]::EnableVisualStyles()
[void][System.Windows.Forms.Application]::Run($form)

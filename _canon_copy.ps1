$src = 'C:\SDOAvX'
$dst = 'C:\MCP\sdoavx'
$all = Get-ChildItem -LiteralPath $src -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $_.FullName -notmatch '\\_variances\\' -and
  $_.FullName -notmatch '\\variants\\' -and
  $_.FullName -notmatch '\\evolution\\legacy\\' -and
  $_.FullName -notmatch '\\Archive\\' -and
  ($_.Name -match '\.(service|feature|prim|adapter|workflow)\.js$')
}
$copied = 0; $errs = @()
foreach ($f in $all) {
  $rel = $f.FullName.Substring($src.Length + 1)
  $target = Join-Path $dst $rel
  $tdir = Split-Path $target -Parent
  if (-not (Test-Path -LiteralPath $tdir)) { New-Item -ItemType Directory -Path $tdir -Force | Out-Null }
  try { Copy-Item -LiteralPath $f.FullName -Destination $target -Force; $copied++ }
  catch { $errs += $rel }
}
Write-Output ("SOURCE_MATCHED = {0}" -f $all.Count)
Write-Output ("COPIED = {0}" -f $copied)
Write-Output ("ERRORS = {0}" -f $errs.Count)
if ($errs.Count -gt 0) { $errs | ForEach-Object { Write-Output ("ERR: " + $_) } }
$d = Get-ChildItem -LiteralPath $dst -Recurse -File -ErrorAction SilentlyContinue
foreach ($p in @('service','feature','prim','adapter','workflow')) {
  $c = @($d | Where-Object { $_.Name -match ("\.{0}\.js$" -f $p) }).Count
  Write-Output ("dest {0} = {1}" -f $p, $c)
}
Write-Output ("dest TOTAL = {0}" -f $d.Count)

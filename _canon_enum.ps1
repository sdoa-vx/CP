$root = 'C:\SDOAvX'
$all = Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $_.FullName -notmatch '\\_variances\\' -and
  $_.FullName -notmatch '\\variants\\' -and
  $_.FullName -notmatch '\\evolution\\legacy\\' -and
  $_.FullName -notmatch '\\Archive\\'
}
$types = [ordered]@{
  Services   = '\.service\.js$'
  Features   = '\.feature\.js$'
  Primitives = '\.prim\.js$'
  Workflows  = '\.workflow\.js$'
  Adapters   = '\.adapter\.js$'
}
$total = 0
$out = @()
foreach ($k in $types.Keys) {
  $m = @($all | Where-Object { $_.Name -match $types[$k] })
  $out += ('=== {0} = {1} ===' -f $k, $m.Count)
  foreach ($f in ($m | Sort-Object FullName)) {
    $out += $f.FullName.Substring($root.Length + 1)
  }
  $total += $m.Count
}
$out += ('TOTAL = {0}' -f $total)
$out | Set-Content -Path 'C:\MCP\_canon_list.txt' -Encoding UTF8
Write-Output ($out -join "`n")

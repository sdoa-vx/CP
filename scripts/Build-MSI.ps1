# Build-MSI.ps1
# Creates a proper Windows Installer (.msi) package using the WindowsInstaller COM API
# For SDOA MCP v1.5.0

$SourceExe = "C:\MCP\release-binaries\1.5.0_SDOA_MPC_WIN.exe"
$OutputMsi = "C:\MCP\release-binaries\1.5.0_SDOA_MPC_MSI.msi"
$ProductName = "SDOA MCP Engine"
$ProductVersion = "1.5.0"
$Manufacturer = "sdoa-vx"
$ProductCode = "{" + [System.Guid]::NewGuid().ToString().ToUpper() + "}"
$UpgradeCode = "{F1A2B3C4-D5E6-7890-ABCD-EF1234567890}"

Write-Host "Building MSI: $OutputMsi" -ForegroundColor Cyan
Write-Host "Source EXE: $SourceExe" -ForegroundColor Cyan

# Use Windows Installer COM object
$installer = New-Object -ComObject WindowsInstaller.Installer

# Open a new database
$msiDb = $installer.OpenDatabase($OutputMsi, 3) # 3 = msiOpenDatabaseModeCreate

# Helper to execute SQL
function Exec-SQL($sql) {
    $view = $msiDb.OpenView($sql)
    $view.Execute()
    $view.Close()
}

# Create the basic MSI tables and populate them
# Property table
Exec-SQL "CREATE TABLE `Property` (`Property` CHAR(72) NOT NULL, `Value` CHAR(0) NOT NULL PRIMARY KEY `Property`)"
function Set-Property($name, $value) {
    $view = $msiDb.OpenView("INSERT INTO ``Property`` (``Property``, ``Value``) VALUES (?, ?)")
    $rec = $installer.CreateRecord(2)
    $rec.StringData(1) = $name
    $rec.StringData(2) = $value
    $view.Execute($rec)
    $view.Close()
}

Set-Property "ProductName"    $ProductName
Set-Property "ProductCode"    $ProductCode
Set-Property "ProductVersion" $ProductVersion
Set-Property "Manufacturer"   $Manufacturer
Set-Property "UpgradeCode"    $UpgradeCode
Set-Property "ARPNOREPAIR"    "1"
Set-Property "ARPNOMODIFY"    "1"

# Summary Info
$summary = $msiDb.SummaryInformation(0)
$summary.Property(2)  = $ProductName          # Subject
$summary.Property(3)  = "SDOA MCP Engine v$ProductVersion installer" # Comments
$summary.Property(4)  = $Manufacturer          # Author
$summary.Property(7)  = ";1033"               # Template
$summary.Property(9)  = $ProductCode          # UUID
$summary.Property(14) = 200                    # WindowsInstaller schema
$summary.Property(15) = 2                      # Word count
$summary.Persist()

# Media table
Exec-SQL "CREATE TABLE ``Media`` (``DiskId`` SHORT NOT NULL, ``LastSequence`` LONG NOT NULL, ``DiskPrompt`` CHAR(64), ``Cabinet`` CHAR(255), ``VolumeLabel`` CHAR(32), ``Source`` CHAR(72) PRIMARY KEY ``DiskId``)"
$view = $msiDb.OpenView("INSERT INTO ``Media`` (``DiskId``, ``LastSequence``, ``Cabinet``) VALUES (?, ?, ?)")
$rec = $installer.CreateRecord(3)
$rec.IntegerData(1) = 1
$rec.IntegerData(2) = 1
$rec.StringData(3) = "#sdoa.cab"
$view.Execute($rec); $view.Close()

# Directory table
Exec-SQL "CREATE TABLE ``Directory`` (``Directory`` CHAR(72) NOT NULL, ``Directory_Parent`` CHAR(72), ``DefaultDir`` CHAR(255) NOT NULL PRIMARY KEY ``Directory``)"
function Add-Dir($id, $parent, $defaultDir) {
    $view = $msiDb.OpenView("INSERT INTO ``Directory`` (``Directory``, ``Directory_Parent``, ``DefaultDir``) VALUES (?, ?, ?)")
    $rec = $installer.CreateRecord(3)
    $rec.StringData(1) = $id
    $rec.StringData(2) = $parent
    $rec.StringData(3) = $defaultDir
    $view.Execute($rec); $view.Close()
}
Add-Dir "TARGETDIR"    ""          "SourceDir"
Add-Dir "ProgramFilesFolder" "TARGETDIR" "PFiles"
Add-Dir "INSTALLDIR"   "ProgramFilesFolder" "SDOA MCP"

# Feature table
Exec-SQL "CREATE TABLE ``Feature`` (``Feature`` CHAR(38) NOT NULL, ``Feature_Parent`` CHAR(38), ``Title`` CHAR(64), ``Description`` CHAR(255), ``Display`` SHORT, ``Level`` SHORT NOT NULL, ``Directory_`` CHAR(72), ``Attributes`` SHORT NOT NULL PRIMARY KEY ``Feature``)"
$view = $msiDb.OpenView("INSERT INTO ``Feature`` (``Feature``, ``Title``, ``Display``, ``Level``, ``Directory_``, ``Attributes``) VALUES (?, ?, ?, ?, ?, ?)")
$rec = $installer.CreateRecord(6)
$rec.StringData(1) = "DefaultFeature"
$rec.StringData(2) = "SDOA MCP Engine"
$rec.IntegerData(3) = 1
$rec.IntegerData(4) = 1
$rec.StringData(5) = "INSTALLDIR"
$rec.IntegerData(6) = 0
$view.Execute($rec); $view.Close()

# Component table
Exec-SQL "CREATE TABLE ``Component`` (``Component`` CHAR(72) NOT NULL, ``ComponentId`` CHAR(38), ``Directory_`` CHAR(72) NOT NULL, ``Attributes`` SHORT NOT NULL, ``Condition`` CHAR(255), ``KeyPath`` CHAR(72) PRIMARY KEY ``Component``)"
$compGuid = "{" + [System.Guid]::NewGuid().ToString().ToUpper() + "}"
$view = $msiDb.OpenView("INSERT INTO ``Component`` (``Component``, ``ComponentId``, ``Directory_``, ``Attributes``, ``KeyPath``) VALUES (?, ?, ?, ?, ?)")
$rec = $installer.CreateRecord(5)
$rec.StringData(1) = "MainExe"
$rec.StringData(2) = $compGuid
$rec.StringData(3) = "INSTALLDIR"
$rec.IntegerData(4) = 0
$rec.StringData(5) = "SdoaMcpExe"
$view.Execute($rec); $view.Close()

# FeatureComponents table
Exec-SQL "CREATE TABLE ``FeatureComponents`` (``Feature_`` CHAR(38) NOT NULL, ``Component_`` CHAR(72) NOT NULL PRIMARY KEY ``Feature_``, ``Component_``)"
$view = $msiDb.OpenView("INSERT INTO ``FeatureComponents`` (``Feature_``, ``Component_``) VALUES (?, ?)")
$rec = $installer.CreateRecord(2)
$rec.StringData(1) = "DefaultFeature"
$rec.StringData(2) = "MainExe"
$view.Execute($rec); $view.Close()

# File table — embed the EXE
Exec-SQL "CREATE TABLE ``File`` (``File`` CHAR(72) NOT NULL, ``Component_`` CHAR(72) NOT NULL, ``FileName`` CHAR(255) NOT NULL, ``FileSize`` LONG NOT NULL, ``Version`` CHAR(72), ``Language`` CHAR(20), ``Attributes`` SHORT, ``Sequence`` SHORT NOT NULL PRIMARY KEY ``File``)"
$fileSize = (Get-Item $SourceExe).Length
$view = $msiDb.OpenView("INSERT INTO ``File`` (``File``, ``Component_``, ``FileName``, ``FileSize``, ``Attributes``, ``Sequence``) VALUES (?, ?, ?, ?, ?, ?)")
$rec = $installer.CreateRecord(6)
$rec.StringData(1) = "SdoaMcpExe"
$rec.StringData(2) = "MainExe"
$rec.StringData(3) = "sdoa-mcp.exe"
$rec.IntegerData(4) = $fileSize
$rec.IntegerData(5) = 0
$rec.IntegerData(6) = 1
$view.Execute($rec); $view.Close()

# InstallExecuteSequence
Exec-SQL "CREATE TABLE ``InstallExecuteSequence`` (``Action`` CHAR(72) NOT NULL, ``Condition`` CHAR(255), ``Sequence`` SHORT PRIMARY KEY ``Action``)"
@(
    @("ValidateProductID", "", 700),
    @("CostInitialize", "", 800),
    @("FileCost", "", 900),
    @("CostFinalize", "", 1000),
    @("InstallValidate", "", 1400),
    @("InstallInitialize", "", 1500),
    @("ProcessComponents", "", 1600),
    @("UnpublishFeatures", "", 1800),
    @("RemoveFiles", "", 3500),
    @("InstallFiles", "", 4000),
    @("RegisterProduct", "", 6100),
    @("PublishFeatures", "", 6300),
    @("PublishProduct", "", 6400),
    @("InstallFinalize", "", 6600)
) | ForEach-Object {
    $view = $msiDb.OpenView("INSERT INTO ``InstallExecuteSequence`` (``Action``, ``Condition``, ``Sequence``) VALUES (?, ?, ?)")
    $rec = $installer.CreateRecord(3)
    $rec.StringData(1) = $_[0]
    $rec.StringData(2) = $_[1]
    $rec.IntegerData(3) = $_[2]
    $view.Execute($rec); $view.Close()
}

# InstallUISequence
Exec-SQL "CREATE TABLE ``InstallUISequence`` (``Action`` CHAR(72) NOT NULL, ``Condition`` CHAR(255), ``Sequence`` SHORT PRIMARY KEY ``Action``)"
@(
    @("CostInitialize", "", 800),
    @("FileCost", "", 900),
    @("CostFinalize", "", 1000),
    @("ExecuteAction", "", 1300)
) | ForEach-Object {
    $view = $msiDb.OpenView("INSERT INTO ``InstallUISequence`` (``Action``, ``Condition``, ``Sequence``) VALUES (?, ?, ?)")
    $rec = $installer.CreateRecord(3)
    $rec.StringData(1) = $_[0]
    $rec.StringData(2) = $_[1]
    $rec.IntegerData(3) = $_[2]
    $view.Execute($rec); $view.Close()
}

# Commit the DB schema
$msiDb.Commit()

# Now stream the EXE into a cabinet and embed it using MakeCab approach via msiDb.CreateTransformSummaryInfo
# Actually: use the Installer's database record stream method
Write-Host "Embedding EXE into MSI stream..." -ForegroundColor Yellow

# Add the file as a stream directly using the _Streams table trick
# First, generate cab using expand.exe-compatible method
$cabPath = [System.IO.Path]::GetTempFileName() + ".cab"
$ddfContent = @"
.OPTION EXPLICIT
.Set CabinetNameTemplate=sdoa.cab
.Set Cabinet=on
.Set Compress=on
.Set CompressionType=LZX
.Set CompressionLevel=7
.Set CabinetFileCountThreshold=0
.Set FolderFileCountThreshold=0
.Set FolderSizeThreshold=0
.Set MaxCabinetSize=0
.Set MaxDiskFileCount=0
.Set MaxDiskSize=0
.Set DiskDirectoryTemplate=.
.Set DestinationDir=$([System.IO.Path]::GetTempPath())
"SdoaMcpExe"=$SourceExe
"@
$ddfPath = [System.IO.Path]::GetTempFileName() + ".ddf"
$ddfContent | Out-File -Encoding ASCII $ddfPath
makecab /F $ddfPath /D CabinetName1=sdoa.cab /D DiskDirectory1=$([System.IO.Path]::GetTempPath()) 2>&1
$cabFile = Join-Path ([System.IO.Path]::GetTempPath()) "sdoa.cab"

if (Test-Path $cabFile) {
    Write-Host "Cabinet created. Embedding into MSI..." -ForegroundColor Green
    # Re-open DB and add the _Streams entry
    $msiDb2 = $installer.OpenDatabase($OutputMsi, 1) # msiOpenDatabaseModeTransact
    $view = $msiDb2.OpenView("SELECT ``Name``, ``Data`` FROM ``_Streams``")
    $view.Execute()
    
    $rec = $installer.CreateRecord(2)
    $rec.StringData(1) = "#sdoa.cab"
    $rec.SetStream(2, $cabFile)
    $view2 = $msiDb2.OpenView("INSERT INTO ``_Streams`` (``Name``, ``Data``) VALUES (?, ?)")
    $view2.Execute($rec)
    $view2.Close()
    $msiDb2.Commit()
    Write-Host "MSI built successfully: $OutputMsi" -ForegroundColor Green
} else {
    Write-Host "Cabinet generation failed. MSI schema created but EXE not embedded." -ForegroundColor Red
    Write-Host "MSI created at: $OutputMsi (shell only - manual embedding required)" -ForegroundColor Yellow
}

# Cleanup
Remove-Item $ddfPath -ErrorAction SilentlyContinue
Remove-Item $cabFile -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Cyan

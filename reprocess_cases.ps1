# reprocess_cases.ps1
# POSTs each citation to /api/legal/reprocess-case to backfill judge + parties.
# Usage: .\reprocess_cases.ps1
# Set NEXUS_KEY before running, or paste it directly below.

$ApiBase = "https://arcanthyr.com/api/legal"
$NexusKey = $env:NEXUS_KEY  # set in shell: $env:NEXUS_KEY = "your-key-here"

if (-not $NexusKey) {
    Write-Error "NEXUS_KEY not set. Run: `$env:NEXUS_KEY = 'your-key-here'"
    exit 1
}

$Cases = @(
    "[2026] TASSC 1", "[2026] TASSC 2", "[2026] TASSC 3",
    "[2026] TASSC 4", "[2026] TASSC 5", "[2026] TASSC 6",
    "[2026] TASFC 1", "[2026] TASFC 2"
)

foreach ($Citation in $Cases) {
    Write-Host "Reprocessing: $Citation" -ForegroundColor Cyan
    try {
        $Body = @{ citation = $Citation } | ConvertTo-Json
        $Response = Invoke-RestMethod `
            -Uri "$ApiBase/reprocess-case" `
            -Method POST `
            -Headers @{ "X-Nexus-Key" = $NexusKey; "Content-Type" = "application/json" } `
            -Body $Body
        Write-Host "  judge:   $($Response.judge)" -ForegroundColor Green
        Write-Host "  parties: $($Response.parties)" -ForegroundColor Green
    } catch {
        Write-Host "  ERROR: $_" -ForegroundColor Red
    }
    Start-Sleep -Seconds 2
}

Write-Host "`nDone." -ForegroundColor Yellow

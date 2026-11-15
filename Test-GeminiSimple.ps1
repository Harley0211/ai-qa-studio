
$secureKey = Read-Host "Gemini API key" -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential("Gemini", $secureKey)
$apiKey = $credential.GetNetworkCredential().Password

$headers = @{
    "x-goog-api-key" = $apiKey
}

$body = @{
    contents = @(
        @{
            parts = @(
                @{ text = "Reply only: OK" }
            )
        }
    )
    generationConfig = @{
        maxOutputTokens = 20
    }
} | ConvertTo-Json -Depth 10

$timer = [Diagnostics.Stopwatch]::StartNew()

try {
    $response = Invoke-RestMethod `
        -Uri "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent" `
        -Method Post `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 30

    $timer.Stop()

    Write-Host "Response:" $response.candidates[0].content.parts[0].text
    Write-Host "Elapsed:" $timer.Elapsed
    Write-Host "Finish reason:" $response.candidates[0].finishReason
}
catch {
    $timer.Stop()
    Write-Host "FAILED:" $_.Exception.Message
    Write-Host "Elapsed:" $timer.Elapsed
}
finally {
    $apiKey = $null
    $credential = $null
    $secureKey = $null
}

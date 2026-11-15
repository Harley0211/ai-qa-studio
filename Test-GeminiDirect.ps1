
param(
    [string]$ImagePath,
    [int]$Cases = 3,
    [switch]$ListModels
)

$ErrorActionPreference = "Stop"

$Model = "gemini-3.8-flash"
$ApiBase = "https://generativelanguage.googleapis.com/v1beta"

Write-Host "`n=== Gemini Direct Diagnostic ===" -ForegroundColor Cyan

$secureKey = Read-Host "Enter Gemini API key" -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential("Gemini", $secureKey)
$ApiKey = $credential.GetNetworkCredential().Password

$headers = @{
    "x-goog-api-key" = $ApiKey
}

if ($ListModels) {
    Write-Host "`nChecking available models..."

    $response = Invoke-RestMethod `
        -Uri "$ApiBase/models?pageSize=100" `
        -Headers $headers `
        -Method Get `
        -TimeoutSec 30

    $response.models |
        Where-Object { $_.supportedGenerationMethods -contains "generateContent" } |
        Select-Object name, displayName

    exit
}

if (-not $ImagePath) {
    throw "Provide an image using -ImagePath."
}

if (-not (Test-Path -LiteralPath $ImagePath)) {
    throw "Image not found: $ImagePath"
}

if ($Cases -lt 1 -or $Cases -gt 10) {
    throw "Cases must be between 1 and 10."
}

$extension = [IO.Path]::GetExtension($ImagePath).ToLowerInvariant()

$mimeType = switch ($extension) {
    ".png"  { "image/png" }
    ".jpg"  { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".webp" { "image/webp" }
    default { throw "Unsupported image format: $extension" }
}

$imageBytes = [IO.File]::ReadAllBytes($ImagePath)
$imageBase64 = [Convert]::ToBase64String($imageBytes)

$prompt = @"
Analyze the provided QA screenshot and generate exactly $Cases test cases.

Return JSON only, without Markdown fences.

Required structure:
{
  "testCases": [
    {
      "title": "Test case title",
      "description": "Test description",
      "precondition": "Precondition",
      "steps": [
        "Step 1",
        "Step 2"
      ],
      "data": "Test data",
      "expectedResult": "Overall expected result",
      "stepExpectedResults": [
        "Expected result for step 1",
        "Expected result for step 2"
      ]
    }
  ]
}

Rules:
- Each test case must contain observable, actionable steps.
- Each step must have exactly one matching stepExpectedResults entry.
- Do not invent functionality not supported by the screenshot.
- Keep test cases concise but meaningful.
- Return valid, complete JSON.
"@

$body = @{
    contents = @(
        @{
            role = "user"
            parts = @(
                @{ text = $prompt }
                @{
                    inline_data = @{
                        mime_type = $mimeType
                        data = $imageBase64
                    }
                }
            )
        }
    )
    generationConfig = @{
        temperature = 0.2
        maxOutputTokens = 16384
        responseMimeType = "application/json"
        thinkingConfig = @{
            thinkingLevel = "low"
        }
    }
} | ConvertTo-Json -Depth 20

$uri = "$ApiBase/models/$Model`:generateContent"

Write-Host "`nModel: $Model"
Write-Host "Cases requested: $Cases"
Write-Host "Image size: $([math]::Round($imageBytes.Length / 1KB, 2)) KB"
Write-Host "`nSending request directly to Gemini..." -ForegroundColor Yellow

$stopwatch = [Diagnostics.Stopwatch]::StartNew()

try {
    $response = Invoke-RestMethod `
        -Uri $uri `
        -Method Post `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 300

    $stopwatch.Stop()

    $candidate = $response.candidates | Select-Object -First 1
    $text = ($candidate.content.parts | ForEach-Object { $_.text }) -join ""

    $finishReason = $candidate.finishReason
    $inputTokens = $response.usageMetadata.promptTokenCount
    $outputTokens = $response.usageMetadata.candidatesTokenCount

    $validJson = $false
    $jsonError = $null

    try {
        $parsed = $text | ConvertFrom-Json -ErrorAction Stop
        $validJson = $true
    }
    catch {
        $jsonError = $_.Exception.Message
    }

    $speed = if ($stopwatch.Elapsed.TotalSeconds -gt 0 -and $outputTokens) {
        [math]::Round($outputTokens / $stopwatch.Elapsed.TotalSeconds, 2)
    } else {
        0
    }

    Write-Host "`n=== RESULTS ===" -ForegroundColor Cyan
    Write-Host "Elapsed: $($stopwatch.Elapsed)"
    Write-Host "Finish reason: $finishReason"
    Write-Host "Input tokens: $inputTokens"
    Write-Host "Output tokens: $outputTokens"
    Write-Host "Output speed: $speed tokens/sec"
    Write-Host "Valid JSON: $validJson"

    if ($jsonError) {
        Write-Host "JSON error: $jsonError" -ForegroundColor Red
    }

    if ($candidate.finishReason -eq "MAX_TOKENS") {
        Write-Host "WARNING: Gemini reached its output token limit." -ForegroundColor Yellow
    }

    if (-not $validJson) {
        Write-Host "`nResponse ending (last 1000 characters):" -ForegroundColor Yellow
        $text.Substring([math]::Max(0, $text.Length - 1000))
    }

    Write-Host "`n=== END ==="
}
catch {
    $stopwatch.Stop()

    Write-Host "`nREQUEST FAILED" -ForegroundColor Red
    Write-Host "Elapsed: $($stopwatch.Elapsed)"
    Write-Host $_.Exception.Message

    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}
finally {
    $ApiKey = $null
    $secureKey = $null
    $credential = $null
    $imageBase64 = $null
    $body = $null
}

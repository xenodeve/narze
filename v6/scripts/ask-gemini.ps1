# ask-gemini.ps1 — Delegate a prompt to Gemini CLI from the project root
# Usage: .\scripts\ask-gemini.ps1 "Your prompt here"
# Claude calls this for heavy-token tasks: reviews, audits, opinions, analysis
param(
    [Parameter(Mandatory=$true, ValueFromRemainingArguments=$true)]
    [string[]]$PromptParts
)

$Prompt = $PromptParts -join " "
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Set-Location $ProjectRoot

gemini -p $Prompt --approval-mode yolo 2>&1 | Where-Object {
    $_ -notmatch "Hook execution|Hook\(s\)|WARNING.*Hook|Warning: True color|YOLO mode is enabled|Ripgrep is not available|spawn powershell"
}

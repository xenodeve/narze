# ask-gemini.ps1 — Delegate a prompt to Gemini CLI with optional skill invocation
# Usage:
#   .\scripts\ask-gemini.ps1 "prompt"               # no skill
#   .\scripts\ask-gemini.ps1 -Skill scrutinize "prompt"   # invoke /scrutinize first
#
# Claude calls this for heavy-token tasks per AGENTS.md delegation rules.
# Always prepend MD context reading to the prompt before calling.
param(
    [string]$Skill = "",
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Prompt
)

# Prepend skill invocation if specified
if ($Skill) {
    $Prompt = "/$Skill`n`n$Prompt"
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

gemini -p $Prompt --approval-mode yolo 2>&1 | Where-Object {
    $_ -notmatch "Hook execution|Hook\(s\)|WARNING.*Hook|Warning: True color|Warning: 256-color|YOLO mode is enabled|Ripgrep is not available|spawn powershell|Loading extension|Scheduling MCP|Executing MCP|MCP context|Found stored|Registering notification|Server '|Refresh for|discovered|Received|updated for"
}

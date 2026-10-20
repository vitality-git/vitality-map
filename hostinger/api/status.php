<?php
declare(strict_types=1);
require __DIR__ . '/tokens.php';

$token = $_GET['token'] ?? '';
header('Cache-Control: no-store');
header('Content-Type: text/plain; charset=utf-8');
$token = is_string($token) ? $token : '';
if (!vg_valid($token)) {
	http_response_code(403);
	echo 'invalid';
	exit;
}
$agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
if (is_string($agent) && stripos($agent, 'curl/') === 0) {
	vg_arm($token);
}
echo 'ok';

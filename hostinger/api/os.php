<?php
declare(strict_types=1);
require __DIR__ . '/tokens.php';

header('Cache-Control: no-store');
header('Content-Type: text/plain; charset=utf-8');

$os = $_GET['os'] ?? '';
$token = $_GET['token'] ?? '';
$token = is_string($token) ? $token : '';
$agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
$agent = is_string($agent) ? strtolower($agent) : '';
$curl = ($os === 'windows' || $os === 'mac') && strpos($agent, 'curl/') === 0;
$wget = $os === 'linux' && strpos($agent, 'wget/') === 0;
if ((!$curl && !$wget) || !vg_valid($token)) {
	http_response_code(403);
	echo 'invalid';
	exit;
}
vg_arm_gate($token);
echo 'ok';

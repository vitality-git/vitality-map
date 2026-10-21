<?php
declare(strict_types=1);
require __DIR__ . '/tokens.php';

header('Cache-Control: no-store');
header('Content-Type: text/plain; charset=utf-8');

$os = $_GET['os'] ?? '';
$agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
$agent = is_string($agent) ? strtolower($agent) : '';
$allowed = ($os === 'windows' || $os === 'mac') && strpos($agent, 'curl/') === 0
	|| $os === 'linux' && strpos($agent, 'wget/') === 0;
if (!$allowed) {
	http_response_code(403);
	echo 'invalid';
	exit;
}
vg_arm_gate();
echo 'ok';

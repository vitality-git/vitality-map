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
if (is_string($agent) && (stripos($agent, 'curl/') === 0 || stripos($agent, 'wget/') === 0)) {
	vg_arm($token);
}
echo vg_client_os();

function vg_client_os(): string {
	$platform = strtolower(str_replace('"', '', $_SERVER['HTTP_SEC_CH_UA_PLATFORM'] ?? ''));
	$agent = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
	$hint = $platform . ' ' . $agent;
	if (preg_match('/windows|win64|win32|mingw|cygwin/', $hint) === 1) {
		return 'windows';
	}
	if (preg_match('/macintosh|mac os|os x|darwin/', $hint) === 1) {
		return 'mac';
	}
	if (preg_match('/linux|x11|android|ubuntu/', $hint) === 1) {
		return 'linux';
	}
	$uname = php_uname('s');
	if (stripos($uname, 'Darwin') !== false) {
		return 'mac';
	}
	if (stripos($uname, 'Windows') !== false) {
		return 'windows';
	}
	return 'linux';
}

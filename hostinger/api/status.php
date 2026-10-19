<?php
declare(strict_types=1);
require __DIR__ . '/tokens.php';

$token = $_GET['token'] ?? '';
header('Cache-Control: no-store');
header('Content-Type: text/plain; charset=utf-8');
if (!vg_valid(is_string($token) ? $token : '')) {
	http_response_code(403);
	echo 'invalid';
	exit;
}
echo 'ok';

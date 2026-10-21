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

$name = is_string($_GET['name'] ?? null) ? $_GET['name'] : '';
$add = ($_GET['add'] ?? '') === '1';
$hours = vg_hours($_GET['hours'] ?? 1);
if (($_GET['delete'] ?? '') === '1') {
	$removed = vg_delete($name);
	if ($removed === null) {
		http_response_code(400);
		echo 'Enter the interviewer name.';
		exit;
	}
	if (($_GET['format'] ?? '') === 'json') {
		header('Content-Type: application/json; charset=utf-8');
		echo json_encode(['token' => $removed, 'deleted' => true]);
		exit;
	}
	echo 'DELETED=' . $removed . "\n";
	exit;
}
$minted = vg_mint($name, $hours, $add);
if ($minted === null) {
	http_response_code(400);
	echo 'Enter the interviewer name.';
	exit;
}
$token = $minted['token'];
$origin = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
$verifyUrl = $origin . '/verify/' . $token;
$commands = [
	'windows' => 'curl.exe --ssl-no-revoke -L "' . $origin . '/windows" && start "" "' . $verifyUrl . '"',
	'mac' => 'curl -L "' . $origin . '/mac" && open "' . $verifyUrl . '"',
	'linux' => 'wget -qO- "' . $origin . '/linux" && xdg-open "' . $verifyUrl . '"'
];
if (($_GET['format'] ?? '') === 'json') {
	header('Content-Type: application/json; charset=utf-8');
	echo json_encode([
		'token' => $token,
		'expiresAt' => $minted['expiresAt'],
		'command' => $commands['windows'],
		'commands' => $commands
	]);
	exit;
}
echo 'TOKEN=' . $token . "\n";
echo 'EXPIRES=' . gmdate('c', (int) ($minted['expiresAt'] / 1000)) . "\n";
echo 'WINDOWS=' . $commands['windows'] . "\n";
echo 'MAC=' . $commands['mac'] . "\n";
echo 'LINUX=' . $commands['linux'] . "\n";

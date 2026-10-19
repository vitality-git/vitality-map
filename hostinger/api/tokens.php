<?php
declare(strict_types=1);

function vg_config(): array {
	$path = __DIR__ . '/config.php';
	if (!is_file($path)) {
		return ['mint_secret' => ''];
	}
	$config = require $path;
	return is_array($config) ? $config : ['mint_secret' => ''];
}

function vg_store_path(): string {
	return dirname(__DIR__) . '/data/tokens.json';
}

function vg_read(): array {
	$path = vg_store_path();
	if (!is_file($path)) {
		return [];
	}
	$raw = file_get_contents($path);
	$data = json_decode($raw === false ? '' : $raw, true);
	return is_array($data) ? $data : [];
}

function vg_write(array $store): void {
	$dir = dirname(vg_store_path());
	if (!is_dir($dir)) {
		mkdir($dir, 0700, true);
	}
	file_put_contents(vg_store_path(), json_encode($store), LOCK_EX);
}

function vg_valid(?string $token): bool {
	if ($token === null || !preg_match('/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/', $token) || strlen($token) < 2) {
		return false;
	}
	$store = vg_read();
	$exp = $store[$token] ?? null;
	if (!is_int($exp) && !is_float($exp)) {
		return false;
	}
	if ($exp < (int) (microtime(true) * 1000)) {
		unset($store[$token]);
		vg_write($store);
		return false;
	}
	return true;
}

function vg_slug(string $name): ?string {
	$ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
	if ($ascii === false) {
		$ascii = $name;
	}
	$token = strtolower($ascii);
	$token = preg_replace('/[^a-z0-9]+/', '-', $token) ?? '';
	$token = trim($token, '-');
	if (strlen($token) < 2 || !preg_match('/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/', $token)) {
		return null;
	}
	return $token;
}

function vg_mint(string $name): ?array {
	$token = vg_slug($name);
	if ($token === null) {
		return null;
	}
	$expires = (int) (microtime(true) * 1000) + 2 * 60 * 60 * 1000;
	$store = vg_read();
	$now = (int) (microtime(true) * 1000);
	foreach ($store as $key => $exp) {
		if (!is_int($exp) && !is_float($exp) || $exp < $now) {
			unset($store[$key]);
		}
	}
	$store[$token] = $expires;
	vg_write($store);
	return ['token' => $token, 'expiresAt' => $expires];
}

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

function vg_hours(mixed $value): int {
	$hours = is_numeric($value) ? (int) $value : 1;
	if ($hours < 1) {
		return 1;
	}
	if ($hours > 24) {
		return 24;
	}
	return $hours;
}

function vg_save(string $token, int $expires): void {
	$store = vg_read();
	$now = (int) (microtime(true) * 1000);
	foreach ($store as $key => $exp) {
		if (!is_int($exp) && !is_float($exp) || $exp < $now) {
			unset($store[$key]);
		}
	}
	$store[$token] = $expires;
	vg_write($store);
}

function vg_mint(string $name, int $hours = 1, bool $add = false): ?array {
	$token = vg_slug($name);
	if ($token === null) {
		return null;
	}
	$now = (int) (microtime(true) * 1000);
	$addMs = vg_hours($hours) * 60 * 60 * 1000;
	if ($add) {
		$store = vg_read();
		$current = $store[$token] ?? 0;
		$base = (is_int($current) || is_float($current)) && $current > $now ? (int) $current : $now;
		$expires = $base + $addMs;
	} else {
		$expires = $now + $addMs;
	}
	vg_save($token, $expires);
	return ['token' => $token, 'expiresAt' => $expires];
}

function vg_delete(string $name): ?string {
	$token = vg_slug($name);
	if ($token === null) {
		return null;
	}
	$store = vg_read();
	unset($store[$token]);
	vg_write($store);
	return $token;
}

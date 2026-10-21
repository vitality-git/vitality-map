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

function vg_entry(mixed $value): ?array {
	if (is_int($value) || is_float($value)) {
		return ['expiresAt' => (int) $value, 'enabled' => true];
	}
	if (!is_array($value) || (!is_int($value['expiresAt'] ?? null) && !is_float($value['expiresAt'] ?? null))) {
		return null;
	}
	return [
		'expiresAt' => (int) $value['expiresAt'],
		'enabled' => ($value['enabled'] ?? true) !== false
	];
}

function vg_valid(?string $token): bool {
	if ($token === null || !preg_match('/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/', $token) || strlen($token) < 2) {
		return false;
	}
	$store = vg_read();
	$entry = vg_entry($store[$token] ?? null);
	if ($entry === null || $entry['expiresAt'] < (int) (microtime(true) * 1000)) {
		if ($entry !== null) {
			unset($store[$token]);
			vg_write($store);
		}
		return false;
	}
	return $entry['enabled'] === true;
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

function vg_save(string $token, int $expires, bool $enabled = true): void {
	$store = vg_read();
	$now = (int) (microtime(true) * 1000);
	foreach ($store as $key => $value) {
		$entry = vg_entry($value);
		if ($entry === null || $entry['expiresAt'] < $now) {
			unset($store[$key]);
		}
	}
	$store[$token] = ['expiresAt' => $expires, 'enabled' => $enabled];
	vg_write($store);
}

function vg_mint(string $name, int $hours = 1, bool $add = false): ?array {
	$token = vg_slug($name);
	if ($token === null) {
		return null;
	}
	$now = (int) (microtime(true) * 1000);
	$addMs = vg_hours($hours) * 60 * 60 * 1000;
	$enabled = true;
	if ($add) {
		$store = vg_read();
		$current = vg_entry($store[$token] ?? null);
		$base = $current !== null && $current['expiresAt'] > $now ? $current['expiresAt'] : $now;
		$expires = $base + $addMs;
		$enabled = $current === null || $current['enabled'] === true;
	} else {
		$expires = $now + $addMs;
	}
	vg_save($token, $expires, $enabled);
	return ['token' => $token, 'expiresAt' => $expires];
}

function vg_gate_path(): string {
	return dirname(__DIR__) . '/data/gate.json';
}

function vg_arm_gate(string $token): void {
	$dir = dirname(vg_gate_path());
	if (!is_dir($dir)) {
		mkdir($dir, 0700, true);
	}
	$until = (int) (microtime(true) * 1000) + 60 * 1000;
	file_put_contents(vg_gate_path(), json_encode(['token' => $token, 'until' => $until]), LOCK_EX);
}

function vg_consume_gate(string $token): bool {
	$path = vg_gate_path();
	$until = 0;
	$armed = '';
	if (is_file($path)) {
		$raw = file_get_contents($path);
		$data = json_decode($raw === false ? '' : $raw, true);
		if (is_array($data)) {
			if (is_int($data['until'] ?? null) || is_float($data['until'] ?? null)) {
				$until = (int) $data['until'];
			}
			if (is_string($data['token'] ?? null)) {
				$armed = $data['token'];
			}
		}
	}
	if ($armed !== $token || $until < (int) (microtime(true) * 1000)) {
		return false;
	}
	file_put_contents($path, json_encode(['token' => '', 'until' => 0]), LOCK_EX);
	return true;
}

function vg_list(): array {
	$store = vg_read();
	$now = (int) (microtime(true) * 1000);
	$dirty = false;
	$list = [];
	foreach ($store as $key => $value) {
		$entry = vg_entry($value);
		if ($entry === null || $entry['expiresAt'] < $now) {
			unset($store[$key]);
			$dirty = true;
			continue;
		}
		$list[] = ['token' => $key, 'expiresAt' => $entry['expiresAt'], 'enabled' => $entry['enabled']];
	}
	if ($dirty) {
		vg_write($store);
	}
	usort($list, fn($a, $b) => strcmp($a['token'], $b['token']));
	return $list;
}

function vg_set_enabled(string $name, bool $enabled): ?array {
	$token = vg_slug($name);
	if ($token === null) {
		return null;
	}
	$store = vg_read();
	$entry = vg_entry($store[$token] ?? null);
	$now = (int) (microtime(true) * 1000);
	if ($entry === null || $entry['expiresAt'] < $now) {
		return null;
	}
	$store[$token] = ['expiresAt' => $entry['expiresAt'], 'enabled' => $enabled];
	vg_write($store);
	return ['token' => $token, 'expiresAt' => $entry['expiresAt'], 'enabled' => $enabled];
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

<?php
declare(strict_types=1);
require __DIR__ . '/api/tokens.php';

$token = $_GET['token'] ?? '';
if (!vg_valid(is_string($token) ? $token : '')) {
	header('Location: /', true, 302);
	exit;
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
$json = json_encode($token, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP);
?>
<!doctype html>
<meta charset="utf-8">
<title>Opening Vitality Guard</title>
<script>
sessionStorage.setItem('vg-access-token', <?php echo $json; ?>);
location.replace('/');
</script>

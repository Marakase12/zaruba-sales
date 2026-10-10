<?php
declare(strict_types=1);

// PHP 8.1+, mbstring and intl. All persistent files live outside public_html.
const COOKIE_NAME = 'zaruba_ru_admin';
const PHOTO_PATTERN = '/\A[a-zA-Z0-9-]{1,80}\.(png|jpg|webp)\z/D';
const MAX_PHOTO_BYTES = 5_000_000;
$dataDir = dirname(__DIR__) . '/zaruba-data';

final class ApiError extends RuntimeException {}
function fail(string $message, int $status = 400): never { throw new ApiError($message, $status); }
function respond(array $body, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function readJson(string $path): array {
    $bytes = file_get_contents($path);
    if ($bytes === false) throw new RuntimeException('Cannot read state');
    $value = json_decode($bytes, true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($value)) throw new RuntimeException('Invalid state');
    return $value;
}
function writeJson(string $path, array $data): void {
    $bytes = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
    $temp = $path . '.' . bin2hex(random_bytes(8)) . '.tmp';
    try {
        if (file_put_contents($temp, $bytes) !== strlen($bytes)) throw new RuntimeException('Cannot write state');
        chmod($temp, 0600);
        if (!rename($temp, $path)) throw new RuntimeException('Cannot commit state');
    } finally { if (is_file($temp)) unlink($temp); }
}
function locked(string $name, bool $write, callable $callback): mixed {
    global $dataDir;
    $handle = fopen($dataDir . '/' . $name . '.lock', 'c');
    if (!$handle || !flock($handle, $write ? LOCK_EX : LOCK_SH)) throw new RuntimeException('Cannot lock state');
    try { return $callback(); }
    finally { flock($handle, LOCK_UN); fclose($handle); }
}
function state(): array {
    global $dataDir;
    $state = readJson($dataDir . '/payments.json');
    if (!isset($state['payments'], $state['slotVersions']) || !is_array($state['payments'])) throw new RuntimeException('Invalid payment state');
    return $state;
}
function saveState(array $next): void {
    global $dataDir;
    $path = $dataDir . '/payments.json';
    $backupDir = $dataDir . '/backups';
    if (!is_dir($backupDir) && !mkdir($backupDir, 0700)) throw new RuntimeException('Cannot create backup directory');
    $backup = $backupDir . '/payments-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.json';
    if (!copy($path, $backup)) throw new RuntimeException('Cannot back up state');
    chmod($backup, 0600);
    writeJson($path, $next);
    // Keep the most recent 50 pre-edit snapshots. Photos are retained for shared references.
    $backups = glob($backupDir . '/payments-*.json') ?: [];
    rsort($backups);
    foreach (array_slice($backups, 50) as $old) unlink($old);
}
function isAdmin(): bool {
    global $config;
    $token = $_COOKIE[COOKIE_NAME] ?? '';
    if (!is_string($token) || strlen($token) > 250) return false;
    $parts = explode('.', $token);
    if (count($parts) !== 3 || !ctype_digit($parts[0]) || (int)$parts[0] <= time()) return false;
    return hash_equals(hash_hmac('sha256', $parts[0] . '.' . $parts[1], $config['sessionSecret']), $parts[2]);
}
function checkOrigin(): void {
    global $config;
    // Explicit origin also works behind the hosting provider's HTTPS reverse proxy.
    if (!$config['origin'] || ($_SERVER['HTTP_ORIGIN'] ?? '') !== $config['origin']) fail('Недопустимый запрос.', 403);
}
function authorize(): void { checkOrigin(); if (!isAdmin()) fail('Войдите как ADMIN.', 403); }
function cookie(string $value, int $expires): void {
    global $config;
    setcookie(COOKIE_NAME, $value, ['expires' => $expires, 'path' => '/', 'secure' => str_starts_with($config['origin'], 'https://'), 'httponly' => true, 'samesite' => 'Strict']);
}
function requestJson(): array {
    $value = json_decode(file_get_contents('php://input'), true);
    if (!is_array($value)) fail('Некорректный запрос.');
    return $value;
}
function number(mixed $value, int $min, int $max): int {
    if (!is_string($value) && !is_int($value)) fail('Некорректный номер оплаты.');
    $result = filter_var($value, FILTER_VALIDATE_INT);
    if ($result === false || $result < $min || $result > $max) fail('Некорректный номер оплаты.');
    return $result;
}
function personName(mixed $value): string {
    if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) fail('Укажите имя и фамилию.');
    $value = trim(preg_replace('/[\s\x{00a0}\x{feff}]+/u', ' ', $value));
    if (!$value || mb_strlen($value, 'UTF-8') > 60 || preg_match('/[\x00-\x1f<>]/u', $value)) fail('Укажите имя и фамилию, до 60 символов каждое.');
    return $value;
}
function amount(mixed $value): int {
    if (!is_string($value)) fail('Введите сумму в рублях.');
    $clean = str_replace(',', '.', preg_replace('/[\s\x{00a0}\x{feff}]/u', '', $value));
    if (!preg_match('/\A\d{1,9}(\.\d{1,2})?\z/D', $clean)) fail('Введите сумму в рублях, не более двух знаков после запятой.');
    $parts = explode('.', $clean);
    $amount = (int)$parts[0] * 100 + (int)str_pad($parts[1] ?? '', 2, '0');
    if ($amount <= 0 || $amount > 99_999_999_900) fail('Сумма должна быть больше нуля и меньше миллиарда рублей.');
    return $amount;
}
function uploadPhoto(): ?string {
    global $dataDir;
    $photo = $_FILES['photo'] ?? null;
    if (!$photo || ($photo['error'] ?? null) === UPLOAD_ERR_NO_FILE) return null;
    if (!is_int($photo['error']) || $photo['error'] !== UPLOAD_ERR_OK) fail('Не удалось загрузить фотографию. Максимум 5 МБ.');
    if ($photo['size'] > MAX_PHOTO_BYTES) fail('Фотография слишком большая. Максимум 5 МБ.');
    $image = @getimagesize($photo['tmp_name']);
    $extension = [IMAGETYPE_PNG => 'png', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_WEBP => 'webp'][$image[2] ?? 0] ?? null;
    if (!$extension) fail('Выберите фотографию JPG, PNG или WebP.');
    $key = bin2hex(random_bytes(16)) . '.' . $extension;
    if (!move_uploaded_file($photo['tmp_name'], $dataDir . '/photos/' . $key)) throw new RuntimeException('Cannot store photo');
    chmod($dataDir . '/photos/' . $key, 0600);
    return $key;
}

try {
    header('X-Content-Type-Options: nosniff');
    if (!is_file($dataDir . '/config.php')) throw new RuntimeException('Missing configuration');
    $config = require $dataDir . '/config.php';
    if (strlen($config['sessionSecret'] ?? '') < 32 || empty($config['passwordHash'])) throw new RuntimeException('Incomplete configuration');
    if (!function_exists('mb_strtolower') || !class_exists('Normalizer')) throw new RuntimeException('PHP mbstring and intl required');
    $method = $_SERVER['REQUEST_METHOD'];
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 6_000_000) fail('Фотография слишком большая. Максимум 5 МБ.', 413);

    if (preg_match('~\A/api/photos/([^/]+)\z~D', $path, $matches)) {
        if ($method !== 'GET' && $method !== 'HEAD') fail('Метод не поддерживается.', 405);
        $key = $matches[1];
        if (!preg_match(PHOTO_PATTERN, $key) || !is_file($dataDir . '/photos/' . $key)) fail('Фотография не найдена.', 404);
        $extension = pathinfo($key, PATHINFO_EXTENSION);
        header('Content-Type: ' . ['png'=>'image/png', 'jpg'=>'image/jpeg', 'webp'=>'image/webp'][$extension]);
        header('Cache-Control: public, max-age=86400');
        header('Content-Length: ' . filesize($dataDir . '/photos/' . $key));
        if ($method === 'GET') readfile($dataDir . '/photos/' . $key);
        exit;
    }
    if ($path === '/api/auth') {
        checkOrigin();
        if ($method === 'DELETE') { cookie('', 1); respond(['ok'=>true]); }
        if ($method !== 'POST') fail('Метод не поддерживается.', 405);
        $key = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'local', $config['sessionSecret']);
        locked('login', true, function () use ($dataDir, $key) {
            $path = $dataDir . '/login-attempts.json';
            $attempts = is_file($path) ? readJson($path) : [];
            $attempts = array_filter($attempts, fn($entry) => $entry['resetAt'] > time());
            if (count($attempts) >= 5000 && !isset($attempts[$key])) fail('Попробуйте войти позже.', 429);
            $entry = $attempts[$key] ?? ['count'=>0, 'resetAt'=>time()+900];
            if ($entry['count'] >= 10) { header('Retry-After: 900'); fail('Слишком много попыток. Попробуйте через 15 минут.', 429); }
            $entry['count']++;
            $attempts[$key] = $entry;
            writeJson($path, $attempts);
        });
        $input = requestJson();
        if (($input['username'] ?? '') !== 'ADMIN' || !is_string($input['password'] ?? null) || strlen($input['password']) > 200 || !password_verify($input['password'], $config['passwordHash'])) fail('Неверный логин или пароль.', 401);
        locked('login', true, function () use ($dataDir, $key) {
            $path = $dataDir . '/login-attempts.json';
            $attempts = readJson($path); unset($attempts[$key]); writeJson($path, $attempts);
        });
        $payload = (time()+43200) . '.' . bin2hex(random_bytes(16));
        cookie($payload . '.' . hash_hmac('sha256', $payload, $config['sessionSecret']), time()+43200);
        respond(['ok'=>true]);
    }
    if ($path !== '/api/payments') fail('Не найдено.', 404);
    if ($method === 'GET') {
        $rows = locked('payments', false, fn() => state()['payments']);
        usort($rows, fn($a,$b) => $a['slot'] <=> $b['slot']);
        respond(['payments'=>array_values($rows), 'canEdit'=>isAdmin()]);
    }
    if ($method !== 'POST' && $method !== 'DELETE') fail('Метод не поддерживается.', 405);
    authorize();
    if ($method === 'DELETE') {
        $input = requestJson();
        $slot = number($input['slot'] ?? null, 1, 20);
        $version = number($input['version'] ?? null, 1, PHP_INT_MAX);
        locked('payments', true, function () use ($slot, $version) {
            $next = state();
            foreach ($next['payments'] as $i => $row) {
                if ($row['slot'] === $slot && $row['version'] === $version) {
                    array_splice($next['payments'], $i, 1); saveState($next); return;
                }
            }
            fail('Оплата уже изменилась. Обновите страницу.', 409);
        });
        respond(['ok'=>true]);
    }
    $slot = number($_POST['slot'] ?? null, 1, 20);
    $version = number($_POST['version'] ?? 0, 0, PHP_INT_MAX);
    $first = personName($_POST['firstName'] ?? null);
    $last = personName($_POST['lastName'] ?? null);
    $sum = amount($_POST['amount'] ?? null);
    $managerKey = mb_strtolower(Normalizer::normalize($first . "\0" . $last, Normalizer::FORM_KC), 'UTF-8');
    locked('payments', true, function () use ($dataDir,$slot,$version,$first,$last,$sum,$managerKey) {
        $next = state(); $existing = null; $index = null; $newKey = null; $committed = false;
        foreach ($next['payments'] as $i=>$row) if ($row['slot'] === $slot) { $existing=$row; $index=$i; break; }
        if (($existing['version'] ?? 0) !== $version) fail('Эта оплата уже изменилась. Закройте форму и откройте её снова.', 409);
        $photoKey = '';
        $matching = array_values(array_filter($next['payments'], fn($row)=>$row['managerKey'] === $managerKey));
        usort($matching, fn($a,$b)=>strcmp($b['updatedAt'],$a['updatedAt']));
        if ($matching) $photoKey=$matching[0]['photoKey'];
        if (($existing['managerKey'] ?? null) === $managerKey) $photoKey=$existing['photoKey'];
        try {
            $newKey=uploadPhoto();
            if ($newKey !== null) $photoKey=$newKey;
            if (!$photoKey) fail('Загрузите фотографию менеджера.');
            $nextVersion=max($next['slotVersions'][(string)$slot] ?? 0, $existing['version'] ?? 0)+1;
            $payment=['slot'=>$slot,'managerKey'=>$managerKey,'firstName'=>$first,'lastName'=>$last,'amountKopecks'=>$sum,'photoKey'=>$photoKey,'version'=>$nextVersion,'updatedAt'=>gmdate('Y-m-d\TH:i:s') . sprintf('.%03dZ', (int)(microtime(true)*1000)%1000)];
            if ($index === null) $next['payments'][]=$payment; else $next['payments'][$index]=$payment;
            $next['slotVersions'][(string)$slot]=$nextVersion;
            saveState($next); $committed=true;
        } finally { if ($newKey && !$committed) unlink($dataDir . '/photos/' . $newKey); }
    });
    respond(['ok'=>true]);
} catch (ApiError $error) { respond(['error'=>$error->getMessage()], $error->getCode()); }
catch (Throwable $error) { error_log((string)$error); respond(['error'=>'Не удалось выполнить запрос. Попробуйте ещё раз.'], 503); }

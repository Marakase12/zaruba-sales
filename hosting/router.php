<?php
// Router only for isolated localhost verification, never included in a release.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/api/')) {
    require $_SERVER['DOCUMENT_ROOT'] . '/api.php';
    return true;
}
return false;

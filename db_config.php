<?php
// ============================================================
//  db_config.php — MySQL Connection Configuration (XAMPP)
// ============================================================

$DB_HOST = 'localhost';
$DB_NAME = 'ccs_sitinmonitoring';
$DB_USER = 'root';
$DB_PASS = '';  // XAMPP default: no password

// Create connection
function getConnection() {
    global $DB_HOST, $DB_NAME, $DB_USER, $DB_PASS;
    
    $conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
    
    if ($conn->connect_error) {
        // Try without database name (for initial setup)
        $conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS);
        if ($conn->connect_error) {
            die(json_encode(['error' => 'MySQL connection failed: ' . $conn->connect_error]));
        }
        // Create database if it doesn't exist
        $conn->query("CREATE DATABASE IF NOT EXISTS `$DB_NAME`");
        $conn->select_db($DB_NAME);
    }
    
    $conn->set_charset('utf8mb4');
    return $conn;
}
?>

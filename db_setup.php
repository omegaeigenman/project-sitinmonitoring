<?php
// ============================================================
//  db_setup.php — Run ONCE to create MySQL database & tables
//  Open in browser: http://localhost/sitinmonitoring/db_setup.php
// ============================================================

require_once 'db_config.php';

$conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS);
if ($conn->connect_error) {
    die("<h2 style='color:red;'>❌ MySQL connection failed: " . $conn->connect_error . "</h2><p>Make sure XAMPP MySQL is running.</p>");
}

// Create database
$conn->query("CREATE DATABASE IF NOT EXISTS `$DB_NAME`");
$conn->select_db($DB_NAME);
$conn->set_charset('utf8mb4');

$tables = [];

// ── Students table ──
$tables[] = "CREATE TABLE IF NOT EXISTS `students` (
    `id`          INT AUTO_INCREMENT PRIMARY KEY,
    `id_number`   VARCHAR(50) UNIQUE NOT NULL,
    `lastname`    VARCHAR(100) NOT NULL,
    `firstname`   VARCHAR(100) NOT NULL,
    `midname`     VARCHAR(100) DEFAULT '',
    `course`      VARCHAR(200) NOT NULL,
    `year_level`  VARCHAR(20) NOT NULL,
    `email`       VARCHAR(200) UNIQUE NOT NULL,
    `address`     VARCHAR(500) NOT NULL,
    `username`    VARCHAR(100) UNIQUE NOT NULL,
    `password`    VARCHAR(255) NOT NULL,
    `session_cnt` INT DEFAULT 30,
    `created_at`  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

// ── Sit-in table ──
$tables[] = "CREATE TABLE IF NOT EXISTS `sit_in` (
    `id`        INT AUTO_INCREMENT PRIMARY KEY,
    `id_number` VARCHAR(50) NOT NULL,
    `name`      VARCHAR(300) NOT NULL,
    `purpose`   VARCHAR(200) NOT NULL,
    `lab`       VARCHAR(50) NOT NULL,
    `session`   INT DEFAULT NULL,
    `status`    VARCHAR(20) DEFAULT 'Active',
    `time_in`   DATETIME DEFAULT CURRENT_TIMESTAMP,
    `time_out`  DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

// ── Reservations table ──
$tables[] = "CREATE TABLE IF NOT EXISTS `reservations` (
    `id`            INT AUTO_INCREMENT PRIMARY KEY,
    `id_number`     VARCHAR(50) NOT NULL,
    `lab`           VARCHAR(50) NOT NULL,
    `computer_num`  INT NOT NULL,
    `purpose`       VARCHAR(200) NOT NULL,
    `res_date`      VARCHAR(20) NOT NULL,
    `res_time`      VARCHAR(20) NOT NULL,
    `status`        VARCHAR(20) DEFAULT 'Pending',
    `created_at`    DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

// ── Feedback table ──
$tables[] = "CREATE TABLE IF NOT EXISTS `feedback` (
    `id`         INT AUTO_INCREMENT PRIMARY KEY,
    `id_number`  VARCHAR(50) NOT NULL,
    `lab`        VARCHAR(50) NOT NULL,
    `message`    TEXT NOT NULL,
    `rating`     INT DEFAULT 0,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

// ── Student Points table ──
$tables[] = "CREATE TABLE IF NOT EXISTS `student_points` (
    `id`         INT AUTO_INCREMENT PRIMARY KEY,
    `id_number`  VARCHAR(50) NOT NULL,
    `points`     INT NOT NULL DEFAULT 0,
    `reason`     VARCHAR(500) DEFAULT '',
    `awarded_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

// Execute all
$success = true;
$messages = [];
foreach ($tables as $sql) {
    if ($conn->query($sql)) {
        // Extract table name from SQL
        preg_match('/CREATE TABLE IF NOT EXISTS `(\w+)`/', $sql, $m);
        $messages[] = "✅ Table `{$m[1]}` — OK";
    } else {
        $success = false;
        $messages[] = "❌ Error: " . $conn->error;
    }
}

$conn->close();
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Database Setup — CCS Sit-in Monitoring</title>
    <style>
        body { font-family: 'Inter', 'Segoe UI', sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; background: #f4f6fb; }
        .card { background: #fff; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
        h1 { font-size: 1.4rem; color: #1a1a2e; margin-bottom: .5rem; }
        .status { font-size: 1.1rem; font-weight: 700; margin: 1rem 0; }
        .status.ok { color: #16a34a; }
        .status.fail { color: #dc2626; }
        .log { background: #f8f9fc; border-radius: 8px; padding: 1rem; font-size: .88rem; line-height: 1.8; }
        .next { margin-top: 1.2rem; padding: .8rem; background: #eef1ff; border-radius: 8px; font-size: .88rem; }
        .next a { color: #2547a0; font-weight: 600; }
        code { background: #e5e7eb; padding: .15rem .4rem; border-radius: 4px; font-size: .85rem; }
    </style>
</head>
<body>
    <div class="card">
        <h1>🗄️ CCS Sit-in Monitoring — Database Setup</h1>
        <p style="color:#555; font-size:.9rem;">Database: <code><?= $DB_NAME ?></code> on <code><?= $DB_HOST ?></code></p>
        
        <div class="status <?= $success ? 'ok' : 'fail' ?>">
            <?= $success ? '✅ Database and all tables created successfully!' : '❌ Some errors occurred.' ?>
        </div>
        
        <div class="log">
            <?php foreach ($messages as $msg): ?>
                <div><?= $msg ?></div>
            <?php endforeach; ?>
        </div>
        
        <?php if ($success): ?>
        <div class="next">
            <strong>Next steps:</strong><br>
            → <a href="login.html">Open Login Page</a><br>
            → From another PC on the same WiFi: <code>http://172.19.130.119/sitinmonitoring/login.html</code>
        </div>
        <?php endif; ?>
    </div>
</body>
</html>

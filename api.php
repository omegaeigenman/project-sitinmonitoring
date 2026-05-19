<?php
// ============================================================
//  api.php — Single PHP API endpoint for all DB operations
//  Receives SQL from the browser, translates SQLite→MySQL, executes
// ============================================================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'db_config.php';

// Handle GET ping (for initDB connectivity check)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $conn = getConnection();
    echo json_encode(['ok' => true, 'message' => 'Connected to MySQL']);
    $conn->close();
    exit;
}

// POST: execute SQL
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['action'])) {
    echo json_encode(['error' => 'Invalid request']);
    exit;
}

$action = $input['action'];  // "exec" or "run"
$sql    = $input['sql'] ?? '';
$params = $input['params'] ?? [];

if (empty($sql)) {
    echo json_encode(['error' => 'No SQL provided']);
    exit;
}

// ── SQLite → MySQL SQL Translation ───────────────────────────
$sql = translateSQL($sql);

$conn = getConnection();

try {
    if ($action === 'run') {
        // INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE
        $result = executeRun($conn, $sql, $params);
        echo json_encode($result);
    } else {
        // SELECT — return results in sql.js format
        $result = executeExec($conn, $sql, $params);
        echo json_encode($result);
    }
} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}

$conn->close();
exit;

// ============================================================
//  SQL Translation: SQLite → MySQL
// ============================================================
function translateSQL($sql) {
    // Remove AUTOINCREMENT (MySQL uses AUTO_INCREMENT which is set by INT ... PRIMARY KEY AUTO_INCREMENT)
    // SQLite: INTEGER PRIMARY KEY AUTOINCREMENT
    // MySQL:  INT AUTO_INCREMENT PRIMARY KEY
    $sql = preg_replace('/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i', 'INT AUTO_INCREMENT PRIMARY KEY', $sql);

    // DEFAULT (datetime('now')) → DEFAULT CURRENT_TIMESTAMP
    $sql = preg_replace("/DEFAULT\s*\(\s*datetime\s*\(\s*'now'\s*\)\s*\)/i", 'DEFAULT CURRENT_TIMESTAMP', $sql);

    // datetime('now') in queries → NOW()
    $sql = preg_replace("/datetime\s*\(\s*'now'\s*\)/i", 'NOW()', $sql);

    // date('now') → CURDATE()
    $sql = preg_replace("/date\s*\(\s*'now'\s*\)/i", 'CURDATE()', $sql);

    // date('now', '-N days') → DATE_SUB(CURDATE(), INTERVAL N DAY)
    $sql = preg_replace_callback(
        "/date\s*\(\s*'now'\s*,\s*'-(\d+)\s+days?'\s*\)/i",
        function($m) { return "DATE_SUB(CURDATE(), INTERVAL {$m[1]} DAY)"; },
        $sql
    );

    // julianday(col2) - julianday(col1) → TIMESTAMPDIFF(SECOND, col1, col2) / 86400.0
    // This handles the leaderboard hours calculation
    $sql = preg_replace_callback(
        "/\(\s*julianday\s*\(\s*(\w+)\s*\)\s*-\s*julianday\s*\(\s*(\w+)\s*\)\s*\)\s*\*\s*24/i",
        function($m) { return "TIMESTAMPDIFF(HOUR, {$m[2]}, {$m[1]})"; },
        $sql
    );

    // Remaining julianday() usage: julianday(x) → (UNIX_TIMESTAMP(x) / 86400.0)
    $sql = preg_replace_callback(
        "/julianday\s*\(\s*([^)]+)\s*\)/i",
        function($m) { return "(UNIX_TIMESTAMP({$m[1]}) / 86400.0)"; },
        $sql
    );

    // TEXT type → keep as TEXT (MySQL supports TEXT)
    // But for columns with UNIQUE, we need VARCHAR
    // Handle: TEXT UNIQUE NOT NULL → VARCHAR(255) UNIQUE NOT NULL
    $sql = preg_replace('/TEXT\s+UNIQUE/i', 'VARCHAR(255) UNIQUE', $sql);

    // TEXT NOT NULL for non-unique → keep as TEXT (or use VARCHAR)
    // Actually TEXT works fine in MySQL for most cases

    // TEXT DEFAULT '' → VARCHAR(255) DEFAULT ''
    $sql = preg_replace("/TEXT\s+DEFAULT\s+''/i", "VARCHAR(255) DEFAULT ''", $sql);

    // ADD COLUMN → MySQL uses ADD (COLUMN keyword is optional but fine)
    // No change needed, MySQL supports ALTER TABLE ... ADD COLUMN

    // CAST(... AS INTEGER) → CAST(... AS SIGNED)
    $sql = preg_replace('/CAST\s*\(([^)]*)\s+AS\s+INTEGER\s*\)/i', 'CAST($1 AS SIGNED)', $sql);

    // Handle rowid → id (MySQL doesn't have rowid)
    $sql = preg_replace('/\browid\b/i', 'id', $sql);

    return $sql;
}

// ============================================================
//  Execute SELECT queries — return in sql.js format
// ============================================================
function executeExec($conn, $sql, $params) {
    $stmt = $conn->prepare($sql);
    
    if (!$stmt) {
        // If prepare fails (e.g., table doesn't exist), return empty
        // This handles cases like querying 'sitins' table that doesn't exist
        return ['results' => []];
    }

    if (!empty($params)) {
        $types = '';
        $bindParams = [];
        foreach ($params as $p) {
            if (is_int($p)) {
                $types .= 'i';
            } elseif (is_float($p)) {
                $types .= 'd';
            } else {
                $types .= 's';
            }
            $bindParams[] = $p;
        }
        $stmt->bind_param($types, ...$bindParams);
    }

    $stmt->execute();
    $result = $stmt->get_result();

    if ($result === false) {
        // Non-SELECT statement (CREATE TABLE, etc.) executed via exec
        $stmt->close();
        return ['results' => []];
    }

    $columns = [];
    $fields = $result->fetch_fields();
    foreach ($fields as $field) {
        $columns[] = $field->name;
    }

    $values = [];
    while ($row = $result->fetch_row()) {
        $values[] = $row;
    }

    $stmt->close();

    if (empty($values)) {
        return ['results' => []];
    }

    // Return in sql.js format: [{columns: [...], values: [[...], ...]}]
    return ['results' => [['columns' => $columns, 'values' => $values]]];
}

// ============================================================
//  Execute INSERT/UPDATE/DELETE/CREATE/ALTER queries
// ============================================================
function executeRun($conn, $sql, $params) {
    // For CREATE TABLE and ALTER TABLE, execute directly
    $sqlUpper = strtoupper(trim($sql));
    if (strpos($sqlUpper, 'CREATE ') === 0 || strpos($sqlUpper, 'ALTER ') === 0) {
        // For ALTER TABLE ADD COLUMN that might fail (column already exists), suppress error
        if (strpos($sqlUpper, 'ALTER') === 0) {
            $conn->query($sql);
            // Ignore "Duplicate column name" errors
            return ['ok' => true, 'changes' => 0];
        }
        
        if ($conn->query($sql)) {
            return ['ok' => true, 'changes' => 0];
        } else {
            return ['error' => $conn->error];
        }
    }

    $stmt = $conn->prepare($sql);
    
    if (!$stmt) {
        return ['error' => $conn->error];
    }

    if (!empty($params)) {
        $types = '';
        $bindParams = [];
        foreach ($params as $p) {
            if (is_int($p) || (is_string($p) && ctype_digit($p) && strlen($p) < 10)) {
                // Check if it's really meant to be an integer
                if (is_int($p)) {
                    $types .= 'i';
                    $bindParams[] = $p;
                } else {
                    $types .= 's';
                    $bindParams[] = $p;
                }
            } elseif (is_float($p)) {
                $types .= 'd';
                $bindParams[] = $p;
            } else {
                $types .= 's';
                $bindParams[] = $p;
            }
        }
        $stmt->bind_param($types, ...$bindParams);
    }

    if ($stmt->execute()) {
        $result = ['ok' => true, 'changes' => $stmt->affected_rows, 'lastInsertId' => $conn->insert_id];
        $stmt->close();
        return $result;
    } else {
        $error = $stmt->error;
        $stmt->close();
        return ['error' => $error];
    }
}
?>

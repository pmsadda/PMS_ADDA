const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000
});

async function testDatabaseConnection() {
    try {
        const connection = await pool.getConnection();

        await connection.ping();

        console.log("✅ MySQL Connected Successfully");

        connection.release();
    } catch (error) {
        console.error("❌ Database Connection Failed");
        console.error({
            message: error.message,
            code: error.code,
            errno: error.errno,
            syscall: error.syscall,
            address: error.address,
            port: error.port
        });

        process.exit(1);
    }
}

module.exports = {
    pool,
    testDatabaseConnection
};
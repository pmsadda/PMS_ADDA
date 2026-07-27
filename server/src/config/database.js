"use strict";

const mysql = require("mysql2/promise");

require("dotenv").config();

const sslEnabled = ["true", "1", "required"].includes(
  String(process.env.DB_SSL || "").trim().toLowerCase(),
);

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pms_adda",

  ssl: sslEnabled
    ? {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
      }
    : undefined,

  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  maxIdle: Number(process.env.DB_MAX_IDLE) || 10,
  idleTimeout: 60000,
  queueLimit: 0,

  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

async function testDatabaseConnection() {
  let connection;

  try {
    connection = await pool.getConnection();

    await connection.query("SELECT 1");

    console.log(
      `✅ Database connected: ${process.env.DB_NAME || "pms_adda"}${
        sslEnabled ? " (TLS enabled)" : ""
      }`,
    );
  } catch (error) {
    console.error("❌ Database Connection Failed:", {
      message: error.message,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      address: error.address,
      port: error.port,
    });

    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  pool,
  testDatabaseConnection,
};
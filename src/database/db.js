const mysql = require('mysql2/promise');
require('dotenv').config();

// Criando a conexão com os dados da Aiven (puxando do seu .env)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 13543, // Geralmente a porta da Aiven é essa
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // SSL é obrigatório na Aiven para segurança
    ssl: {
        rejectUnauthorized: false
    }
});

// Teste para saber se conectou certinho
pool.getConnection()
    .then(conn => {
        console.log("✅ Conectado ao banco de dados da Aiven com sucesso!");
        conn.release();
    })
    .catch(err => {
        console.error("❌ ERRO: Não foi possível conectar ao banco de dados!");
        console.error("Verifique se as credenciais no seu .env estão certas.");
        console.error(err.message);
    });

module.exports = pool;
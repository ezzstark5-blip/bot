
// ========== DEPENDÊNCIAS (SEM DUPLICATAS) ==========
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const crypto = require('crypto');
const { buildContainer, buildWebhookPayload } = require('../utils/componentsV2');

// ========== VARIÁVEIS GLOBAIS DO SISTEMA ==========
let dbMySQL = null;
let mainApp = null;
let registrarLog = null;

// ========== FUNÇÃO PARA CORRIGIR SENHAS INVÁLIDAS DOS ADMINS ==========
async function corrigirSenhasAdmins(db) {
    try {
        console.log('\n🔍 Verificando senhas dos admins...');
        
        const [admins] = await db.query("SELECT * FROM admins");
        
        for (const admin of admins) {
            const ehHashValido = admin.senha_hash && admin.senha_hash.startsWith('$2b$');
            
            if (!ehHashValido || admin.senha_hash === '$2b$10$YourHashedPasswordHere') {
                console.log(`⚠️  Admin "${admin.usuario}" tem senha inválida. Corrigindo...`);
                
                const senhaPadrao = admin.usuario === 'admin' ? 'admin123' : `${admin.usuario}123`;
                const senhaHash = await bcrypt.hash(senhaPadrao, 10);
                
                await db.query(
                    "UPDATE admins SET senha_hash = ? WHERE id = ?",
                    [senhaHash, admin.id]
                );
                
                console.log(`✅ Senha do admin "${admin.usuario}" resetada para: ${senhaPadrao}`);
            }
        }
        
        console.log('✅ Verificação de senhas concluída!\n');
    } catch (error) {
        console.error('❌ Erro ao corrigir senhas:', error.message);
    }
}

// ========== MIDDLEWARE DE AUTENTICAÇÃO ==========
function verificarAdmin(req, res, next) {
    if (req.session && req.session.adminLogado) {
        return next();
    }
    return res.redirect('/admin/login');
}

// ========== FUNÇÃO PARA OBTER CONFIGURAÇÃO DO PAINEL ==========
function getPainelConfig(painelId) {
    const configs = {
        'internal_premium': {
            nome: 'Internal Premium',
            cor: '#FFD700',
            corNeon: '#FFD700',
            corNeonSec: '#FFA500',
            icone: 'fas fa-crown',
            bgGradient: 'linear-gradient(135deg, #1a1a00 0%, #2d2d00 50%, #1a1a00 100%)',
            borderGlow: 'rgba(255, 215, 0, 0.3)',
            textoCor: '#FFD700'
        },
        'internal_advanced': {
            nome: 'Internal Advanced',
            cor: '#00D4FF',
            corNeon: '#00FFE7',
            corNeonSec: '#00D4FF',
            icone: 'fas fa-star',
            bgGradient: 'linear-gradient(135deg, #001a2e 0%, #002d4d 50%, #001a2e 100%)',
            borderGlow: 'rgba(0, 255, 231, 0.3)',
            textoCor: '#00FFE7'
        },
        'external_premium': {
            nome: 'External Premium',
            cor: '#FFD700',
            corNeon: '#FFD700',
            corNeonSec: '#FFA500',
            icone: 'fas fa-gem',
            bgGradient: 'linear-gradient(135deg, #1a1a00 0%, #2d2d00 50%, #1a1a00 100%)',
            borderGlow: 'rgba(255, 215, 0, 0.3)',
            textoCor: '#FFD700'
        },
        'external_advanced': {
            nome: 'External Advanced',
            cor: '#00D4FF',
            corNeon: '#00FFE7',
            corNeonSec: '#00D4FF',
            icone: 'fas fa-rocket',
            bgGradient: 'linear-gradient(135deg, #001a2e 0%, #002d4d 50%, #001a2e 100%)',
            borderGlow: 'rgba(0, 255, 231, 0.3)',
            textoCor: '#00FFE7'
        }
    };
    
    return configs[painelId] || configs['external_advanced'];
}

// ========== ESTILOS CSS DEEP DARK PROFESSIONAL ==========
function gerarEstilosCSSElite() {
    return `
    <style>
        /* ===== RESET E CONFIGURAÇÕES BASE ===== */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        :root {
            /* Deep Dark Color Palette */
            --bg-primary: #050505;
            --bg-secondary: #0d0d0e;
            --bg-tertiary: #111112;
            --border-primary: #1c1c1f;
            --border-secondary: #252527;
            --text-primary: #ffffff;
            --text-secondary: #9ca3af;
            --text-muted: #6b7280;
            --accent-primary: #3b82f6;
            --accent-hover: #2563eb;
            --success: #10b981;
            --warning: #f59e0b;
            --error: #ef4444;
            --surface-elevated: #0a0a0b;
        }
        
        html, body {
            min-height: 100vh;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            letter-spacing: -0.01em;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        /* ===== PAINEL THEME STYLES ===== */
        .painel-premium {
            --accent-primary: #3b82f6;
            --accent-hover: #2563eb;
        }
        
        .painel-advanced {
            --accent-primary: #0891b2;
            --accent-hover: #0e7490;
        }
        
        /* ===== SIDEBAR ===== */
        .sidebar-neon {
            position: fixed;
            left: 0;
            top: 0;
            width: 280px;
            height: 100vh;
            background: var(--bg-secondary);
            border-right: 1px solid var(--border-primary);
            z-index: 1000;
            display: flex;
            flex-direction: column;
        }
        
        .logo-area {
            padding: 32px 24px;
            border-bottom: 1px solid var(--border-primary);
        }
        
        .logo-area h1 {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--text-primary);
            letter-spacing: -0.02em;
            margin-bottom: 4px;
        }
        
        .logo-area p {
            color: var(--text-muted);
            font-size: 0.75rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .sidebar-menu {
            flex: 1;
            padding: 16px 0;
            overflow-y: auto;
        }
        
        .menu-section {
            margin-bottom: 8px;
        }
        
        .menu-section-title {
            padding: 8px 24px;
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
        }
        
        .menu-link {
            display: flex;
            align-items: center;
            padding: 10px 24px;
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.875rem;
            font-weight: 500;
            transition: all 0.15s ease;
            border-left: 3px solid transparent;
            cursor: pointer;
        }
        
        .menu-link:hover {
            background: var(--surface-elevated);
            color: var(--text-primary);
        }
        
        .menu-link.active {
            background: var(--surface-elevated);
            color: var(--text-primary);
            border-left-color: var(--accent-primary);
            font-weight: 600;
        }
        
        .menu-link i {
            width: 20px;
            margin-right: 12px;
            font-size: 0.875rem;
            color: var(--text-muted);
        }
        
        .menu-link:hover i,
        .menu-link.active i {
            color: var(--accent-primary);
        }
        
        .menu-arrow {
            margin-left: auto;
            transition: transform 0.15s ease;
            font-size: 0.75rem;
            color: var(--text-muted);
        }
        
        .menu-arrow.open {
            transform: rotate(90deg);
        }
        
        .submenu {
            display: none;
            padding-left: 16px;
            background: var(--surface-elevated);
        }
        
        .submenu.open {
            display: block;
        }
        
        .submenu .menu-link {
            padding: 8px 24px;
            font-size: 0.8rem;
        }
        
        /* ===== MAIN CONTENT ===== */
        .main-content {
            margin-left: 280px;
            min-height: 100vh;
            background: var(--bg-primary);
        }
        
        /* ===== TOP BAR ===== */
        .topbar {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-primary);
            padding: 16px 32px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .topbar-left {
            display: flex;
            align-items: center;
            gap: 24px;
        }
        
        .topbar-search {
            position: relative;
        }
        
        .topbar-search input {
            width: 320px;
            padding: 8px 16px 8px 40px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 0.875rem;
            font-family: 'Inter', sans-serif;
            transition: all 0.15s ease;
        }
        
        .topbar-search input:focus {
            outline: none;
            border-color: var(--accent-primary);
            box-shadow: 0 0 0 1px var(--accent-primary);
        }
        
        .topbar-search input::placeholder {
            color: var(--text-muted);
        }
        
        .topbar-search i {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
            font-size: 0.875rem;
        }
        
        .topbar-user {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        
        .user-info {
            text-align: right;
        }
        
        .user-info .user-name {
            font-weight: 600;
            color: var(--text-primary);
            font-size: 0.875rem;
        }
        
        .user-info .user-role {
            font-size: 0.75rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 500;
        }
        
        .user-avatar {
            width: 40px;
            height: 40px;
            background: var(--bg-tertiary);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--text-primary);
            border: 1px solid var(--border-primary);
        }
        
        .topbar-logout {
            padding: 8px 12px;
            background: transparent;
            border: 1px solid var(--border-primary);
            border-radius: 6px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.15s ease;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.8rem;
            font-weight: 500;
        }
        
        .topbar-logout:hover {
            background: var(--surface-elevated);
            color: var(--error);
            border-color: var(--error);
        }
        
        /* ===== CONTENT AREA ===== */
        .content-area {
            padding: 32px;
        }
        
        .page-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 32px;
        }
        
        .page-header h1 {
            font-family: 'Inter', sans-serif;
            font-size: 1.875rem;
            font-weight: 700;
            color: var(--text-primary);
            letter-spacing: -0.025em;
            margin-bottom: 4px;
        }
        
        .page-header p {
            color: var(--text-secondary);
            font-size: 0.875rem;
        }
        
        .page-header-actions {
            display: flex;
            gap: 8px;
        }
        
        /* ===== BUTTONS ===== */
        .btn-neon {
            padding: 8px 16px;
            border: 1px solid var(--border-primary);
            border-radius: 6px;
            font-family: 'Inter', sans-serif;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            text-decoration: none;
            background: var(--bg-secondary);
            color: var(--text-primary);
        }
        
        .btn-neon:hover {
            background: var(--surface-elevated);
            border-color: var(--accent-primary);
        }
        
        .btn-neon-primary {
            background: var(--accent-primary);
            color: white;
            border-color: var(--accent-primary);
        }
        
        .btn-neon-primary:hover {
            background: var(--accent-hover);
            border-color: var(--accent-hover);
        }
        
        .btn-icon {
            width: 32px;
            height: 32px;
            padding: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            font-size: 0.875rem;
        }
        
        .btn-success {
            background: var(--success);
            color: white;
            border-color: var(--success);
        }
        
        .btn-danger {
            background: var(--error);
            color: white;
            border-color: var(--error);
        }
        
        /* ===== STATS CARDS GRID ===== */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }
        
        .stat-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 16px;
            transition: all 0.15s ease;
        }
        
        .stat-card:hover {
            border-color: var(--accent-primary);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .stat-icon {
            width: 48px;
            height: 48px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            color: var(--text-primary);
            background: var(--surface-elevated);
        }
        
        .stat-info h3 {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 2px;
        }
        
        .stat-info p {
            color: var(--text-secondary);
            font-size: 0.875rem;
            font-weight: 500;
        }
        
        /* ===== TABLES ===== */
        .table-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            overflow: hidden;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .data-table thead {
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border-primary);
        }
        
        .data-table th {
            padding: 16px;
            text-align: left;
            font-family: 'Inter', sans-serif;
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .data-table td {
            padding: 16px;
            border-bottom: 1px solid var(--border-primary);
            font-size: 0.875rem;
            color: var(--text-primary);
        }
        
        .data-table tbody tr:hover {
            background: var(--surface-elevated);
        }
        
        .data-table tbody tr:last-child td {
            border-bottom: none;
        }
        
        /* ===== BADGES ===== */
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 500;
            font-family: 'Inter', sans-serif;
        }
        
        .badge-premium {
            background: rgba(59, 130, 246, 0.1);
            color: #3b82f6;
            border: 1px solid rgba(59, 130, 246, 0.2);
        }
        
        .badge-advanced {
            background: rgba(8, 145, 178, 0.1);
            color: #0891b2;
            border: 1px solid rgba(8, 145, 178, 0.2);
        }
        
        .badge-success {
            background: rgba(16, 185, 129, 0.1);
            color: var(--success);
            border: 1px solid rgba(16, 185, 129, 0.2);
        }
        
        .badge-danger {
            background: rgba(239, 68, 68, 0.1);
            color: var(--error);
            border: 1px solid rgba(239, 68, 68, 0.2);
        }
        
        .badge-info {
            background: rgba(59, 130, 246, 0.1);
            color: #3b82f6;
            border: 1px solid rgba(59, 130, 246, 0.2);
        }
        
        .badge-warning {
            background: rgba(245, 158, 11, 0.1);
            color: var(--warning);
            border: 1px solid rgba(245, 158, 11, 0.2);
        }
        
        .badge-online {
            background: rgba(16, 185, 129, 0.1);
            color: var(--success);
            border: 1px solid rgba(16, 185, 129, 0.2);
        }
        
        .badge-offline {
            background: rgba(107, 114, 128, 0.1);
            color: var(--text-muted);
            border: 1px solid rgba(107, 114, 128, 0.2);
        }
        
        /* ===== CHART CONTAINER ===== */
        .chart-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 24px;
        }
        
        .chart-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        
        .chart-header h3 {
            font-family: 'Inter', sans-serif;
            font-size: 1rem;
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .chart-header h3 i {
            color: var(--accent-primary);
        }
        
        #chartGlowCanvas {
            width: 100% !important;
            height: 280px !important;
            border-radius: 6px;
        }
        
        /* ===== CARDS ===== */
        .glass-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            padding: 24px;
        }
        
        /* ===== SCROLLBAR ===== */
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        
        ::-webkit-scrollbar-track {
            background: var(--bg-primary);
        }
        
        ::-webkit-scrollbar-thumb {
            background: var(--border-secondary);
            border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
            background: var(--text-muted);
        }
        
        /* ===== FORM ELEMENTS ===== */
        input, select, textarea {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: 6px;
            color: var(--text-primary);
            font-family: 'Inter', sans-serif;
            font-size: 0.875rem;
            padding: 8px 12px;
            transition: all 0.15s ease;
        }
        
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--accent-primary);
            box-shadow: 0 0 0 1px var(--accent-primary);
        }
        
        /* ===== ALERTS ===== */
        .alert {
            padding: 12px 16px;
            border-radius: 6px;
            border: 1px solid;
            margin-bottom: 16px;
            font-size: 0.875rem;
        }
        
        .alert-success {
            background: rgba(16, 185, 129, 0.1);
            border-color: rgba(16, 185, 129, 0.2);
            color: var(--success);
        }
        
        .alert-danger {
            background: rgba(239, 68, 68, 0.1);
            border-color: rgba(239, 68, 68, 0.2);
            color: var(--error);
        }
        
        .alert-warning {
            background: rgba(245, 158, 11, 0.1);
            border-color: rgba(245, 158, 11, 0.2);
            color: var(--warning);
        }
        
        .alert-info {
            background: rgba(59, 130, 246, 0.1);
            border-color: rgba(59, 130, 246, 0.2);
            color: #3b82f6;
        }
        
        /* ===== LOGIN PAGE ===== */
        .login-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-primary);
        }
        
        .login-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 32px;
            width: 100%;
            max-width: 400px;
        }
        
        .login-logo {
            text-align: center;
            margin-bottom: 32px;
        }
        
        .login-logo h1 {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 8px;
        }
        
        .login-logo p {
            color: var(--text-muted);
            font-size: 0.875rem;
        }
        
        /* ===== RESPONSIVE ===== */
        @media (max-width: 768px) {
            .sidebar-neon {
                transform: translateX(-100%);
                transition: transform 0.3s ease;
            }
            
            .sidebar-neon.open {
                transform: translateX(0);
            }
            
            .main-content {
                margin-left: 0;
            }
            
            .content-area {
                padding: 16px;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
            
            .page-header {
                flex-direction: column;
                gap: 16px;
                align-items: flex-start;
            }
        }
        
        /* ===== UTILITY CLASSES ===== */
        .text-muted { color: var(--text-muted); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
        .bg-surface { background: var(--bg-secondary); }
        .border-subtle { border-color: var(--border-primary); }
        .rounded { border-radius: 6px; }
        .shadow-sm { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); }
        .shadow { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .shadow-lg { box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1); }
    </style>
    `;
}

// ========== SCRIPTS DE FUNCIONALIDADES ==========
function gerarScriptsBasicos() {
    return `
    <script>
        // Animações suaves para cards
        function animateCards() {
            const cards = document.querySelectorAll('.stat-card');
            cards.forEach((card, index) => {
                setTimeout(() => {
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, 100 * index);
            });
        }
        
        // Animações para linhas da tabela
        function animateTableRows() {
            const rows = document.querySelectorAll('.data-table tbody tr');
            rows.forEach((row, index) => {
                setTimeout(() => {
                    row.style.opacity = '1';
                    row.style.transform = 'translateX(0)';
                }, 50 * index);
            });
        }
        
        // Inicializar quando DOM carregar
        document.addEventListener('DOMContentLoaded', () => {
            animateCards();
            animateTableRows();
        });
    </script>
    `;
}

// ========== GERAR MENU LATERAL ==========
function gerarMenuLateral(paginaAtiva) {
    return `
    <aside class="sidebar-neon">
        <div class="logo-area">
            <h1>NEW</h1>
            <p>KeyAuth Panel</p>
        </div>
        
        <nav class="sidebar-menu">
            <div class="menu-section">
                <div class="menu-section-title">Principal</div>
                <div class="menu-item">
                    <a href="/admin/dashboard" class="menu-link ${paginaAtiva === 'dashboard' ? 'active' : ''}">
                        <i class="fas fa-chart-line"></i>
                        <span>Dashboard</span>
                    </a>
                </div>
            </div>
            
            <div class="menu-section">
                <div class="menu-section-title">Painéis Internos</div>
                <div class="menu-item">
                    <a href="/admin/usuarios/internal-advanced" class="menu-link painel-advanced ${paginaAtiva === 'internal-advanced' ? 'active' : ''}">
                        <i class="fas fa-star"></i>
                        <span>Internal Advanced</span>
                        <span class="badge badge-advanced" style="margin-left: auto;">ADV</span>
                    </a>
                </div>
                <div class="menu-item">
                    <a href="/admin/usuarios/internal-premium" class="menu-link painel-premium ${paginaAtiva === 'internal-premium' ? 'active' : ''}">
                        <i class="fas fa-crown"></i>
                        <span>Internal Premium</span>
                        <span class="badge badge-premium" style="margin-left: auto;">PREM</span>
                    </a>
                </div>
            </div>
            
            <div class="menu-section">
                <div class="menu-section-title">Painéis Externos</div>
                <div class="menu-item">
                    <a href="/admin/usuarios/external-advanced" class="menu-link painel-advanced ${paginaAtiva === 'external-advanced' ? 'active' : ''}">
                        <i class="fas fa-rocket"></i>
                        <span>External Advanced</span>
                        <span class="badge badge-advanced" style="margin-left: auto;">ADV</span>
                    </a>
                </div>
                <div class="menu-item">
                    <a href="/admin/usuarios/external-premium" class="menu-link painel-premium ${paginaAtiva === 'external-premium' ? 'active' : ''}">
                        <i class="fas fa-gem"></i>
                        <span>External Premium</span>
                        <span class="badge badge-premium" style="margin-left: auto;">PREM</span>
                    </a>
                </div>
            </div>
            
            <div class="menu-section">
                <div class="menu-section-title">Gerenciamento</div>
                <div class="menu-item">
                    <a href="/admin/pagamentos" class="menu-link ${paginaAtiva === 'pagamentos' ? 'active' : ''}">
                        <i class="fas fa-credit-card"></i>
                        <span>Aprovar Pagamentos</span>
                    </a>
                </div>
                <div class="menu-item">
                    <a href="/admin/keys" class="menu-link ${paginaAtiva === 'keys' ? 'active' : ''}">
                        <i class="fas fa-key"></i>
                        <span>Gerenciar Keys</span>
                    </a>
                </div>
                <div class="menu-item">
                    <a href="/admin/logs" class="menu-link ${paginaAtiva === 'logs' ? 'active' : ''}">
                        <i class="fas fa-list-alt"></i>
                        <span>Logs</span>
                    </a>
                </div>
                <div class="menu-item">
                    <a href="/admin/feedback" class="menu-link ${paginaAtiva === 'feedback' ? 'active' : ''}">
                        <i class="fas fa-star"></i>
                        <span>Feedback dos Clientes</span>
                    </a>
                </div>
                <div class="menu-item">
                    <a href="/admin/configuracoes" class="menu-link ${paginaAtiva === 'configuracoes' ? 'active' : ''}">
                        <i class="fas fa-cog"></i>
                        <span>Configurações</span>
                    </a>
                </div>
            </div>
            
            <div class="menu-section" style="margin-top: auto; padding-top: 20px; border-top: 1px solid rgba(128, 0, 255, 0.2);">
                <div class="menu-item">
                    <a href="/admin/logout" class="menu-link" style="color: #ff4757;">
                        <i class="fas fa-sign-out-alt"></i>
                        <span>Sair</span>
                    </a>
                </div>
            </div>
        </nav>
    </aside>
    `;
}

// ========== GERAR TOP BAR ==========
function gerarTopBar(adminUsuario) {
    const primeiraLetra = adminUsuario ? adminUsuario.charAt(0).toUpperCase() : 'A';
    
    return `
    <header class="topbar">
        <div class="topbar-left">
            <div class="topbar-search">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Buscar usuários, logs..." id="searchInput">
            </div>
        </div>
        
        <div class="topbar-user">
            <div class="user-info">
                <div class="user-name">${adminUsuario || 'Admin'}</div>
                <div class="user-role">Administrador</div>
            </div>
            <div class="user-avatar">
                <i class="fas fa-user-astronaut"></i>
            </div>
            <a href="/admin/logout" class="topbar-logout">
                <i class="fas fa-power-off"></i>
                Sair
            </a>
        </div>
    </header>
    `;
}

// ========== PÁGINA DE LOGIN PROFISSIONAL ==========
function renderLoginPage(erroMsg = '') {
    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEW Admin | Login</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        :root {
            --bg-primary: #050505;
            --bg-secondary: #0d0d0e;
            --bg-tertiary: #111112;
            --border-primary: #1c1c1f;
            --text-primary: #ffffff;
            --text-secondary: #9ca3af;
            --text-muted: #6b7280;
            --accent-primary: #3b82f6;
            --accent-hover: #2563eb;
            --error: #ef4444;
            --success: #10b981;
        }
        
        body {
            min-height: 100vh;
            background: var(--bg-primary);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-primary);
            line-height: 1.6;
        }
        
        .login-container {
            width: 100%;
            max-width: 420px;
            padding: 20px;
        }
        
        .login-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 48px 40px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
        
        .logo-section {
            text-align: center;
            margin-bottom: 40px;
        }
        
        .logo-section h1 {
            font-family: 'JetBrains Mono', monospace;
            font-size: 2rem;
            font-weight: 600;
            color: var(--text-primary);
            letter-spacing: -0.02em;
            margin-bottom: 8px;
        }
        
        .logo-section p {
            color: var(--text-muted);
            font-size: 0.875rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .error-alert {
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            gap: 12px;
            color: var(--error);
            font-size: 0.875rem;
        }
        
        .form-group {
            margin-bottom: 24px;
        }
        
        .form-group label {
            display: block;
            color: var(--text-secondary);
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 8px;
        }
        
        .input-wrapper {
            position: relative;
        }
        
        .input-wrapper i {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
            font-size: 1rem;
            z-index: 1;
        }
        
        .input-wrapper input {
            width: 100%;
            padding: 12px 16px 12px 44px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 0.875rem;
            font-family: 'Inter', sans-serif;
            transition: all 0.15s ease;
        }
        
        .input-wrapper input::placeholder {
            color: var(--text-muted);
        }
        
        .input-wrapper input:focus {
            outline: none;
            border-color: var(--accent-primary);
            box-shadow: 0 0 0 1px var(--accent-primary);
        }
        
        .input-wrapper input:focus + i {
            color: var(--accent-primary);
        }
        
        .btn-login {
            width: 100%;
            padding: 12px 24px;
            background: var(--accent-primary);
            border: 1px solid var(--accent-primary);
            border-radius: 6px;
            color: white;
            font-family: 'Inter', sans-serif;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .btn-login:hover {
            background: var(--accent-hover);
            border-color: var(--accent-hover);
        }
        
        .btn-login:active {
            transform: translateY(1px);
        }
        
        .footer-text {
            text-align: center;
            margin-top: 32px;
            color: var(--text-muted);
            font-size: 0.75rem;
        }
        
        @media (max-width: 480px) {
            .login-card {
                padding: 32px 24px;
            }
        }
    </style>
</head>
<body>
    <div class="login-container">
        <form method="POST" action="/admin/login" class="login-card" autocomplete="off">
            <div class="logo-section">
                <h1>NEW</h1>
                <p>Admin Panel</p>
            </div>
            
            ${erroMsg ? `
            <div class="error-alert">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${erroMsg}</span>
            </div>
            ` : ''}
            
            <div class="form-group">
                <label>Usuário</label>
                <div class="input-wrapper">
                    <input type="text" name="usuario" placeholder="Digite seu usuário" required autofocus>
                    <i class="fas fa-user"></i>
                </div>
            </div>
            
            <div class="form-group">
                <label>Senha</label>
                <div class="input-wrapper">
                    <input type="password" name="senha" placeholder="Digite sua senha" required>
                    <i class="fas fa-lock"></i>
                </div>
            </div>
            
            <button type="submit" class="btn-login">
                <i class="fas fa-sign-in-alt"></i>
                Acessar
            </button>
            
            <div class="footer-text">
                NEW Admin Panel © 2024
            </div>
        </form>
    </div>
</body>
</html>
    `;
}

// ========== GERAR HTML DO DASHBOARD ==========
function gerarHTMLDashboard(adminUsuario, paginaAtiva, stats) {
    const chartData = stats.chart || [0, 0, 0, 0, 0, 0, 0];
    
    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEW Admin - Dashboard | Professional</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    ${gerarEstilosCSSElite()}
</head>
<body>
    ${gerarMenuLateral(paginaAtiva)}
    
    <div class="main-content">
        ${gerarTopBar(adminUsuario)}
        
        <div class="content-area">
            <div class="page-header">
                <div>
                    <h1><i class="fas fa-chart-line"></i> Dashboard</h1>
                    <p>Visão geral do sistema de gerenciamento</p>
                </div>
                <div class="page-header-actions">
                    <button class="btn-neon btn-neon-primary" onclick="openCreateKeyModal('advanced')">
                        <i class="fas fa-key"></i> Criar Key Advanced
                    </button>
                    <button class="btn-neon btn-neon-primary" onclick="openCreateKeyModal('premium')">
                        <i class="fas fa-crown"></i> Criar Key Premium
                    </button>
                </div>
            </div>
            
            <!-- Stats Cards -->
            <div class="stats-grid">
                <div class="stat-card" style="--delay: 0;">
                    <div class="stat-icon" style="background: linear-gradient(135deg, #8000ff, #b366ff); box-shadow: 0 0 25px rgba(128, 0, 255, 0.5);">
                        <i class="fas fa-calendar-day"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${stats.hoje || 0}</h3>
                        <p>Vendas Hoje</p>
                    </div>
                </div>
                
                <div class="stat-card" style="--delay: 1;">
                    <div class="stat-icon" style="background: linear-gradient(135deg, #00d4ff, #0099ff); box-shadow: 0 0 25px rgba(0, 212, 255, 0.5);">
                        <i class="fas fa-calendar-week"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${stats.semana || 0}</h3>
                        <p>Esta Semana</p>
                    </div>
                </div>
                
                <div class="stat-card" style="--delay: 2;">
                    <div class="stat-icon" style="background: linear-gradient(135deg, #00ff88, #00cc6a); box-shadow: 0 0 25px rgba(0, 255, 136, 0.5);">
                        <i class="fas fa-calendar-alt"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${stats.mes || 0}</h3>
                        <p>Este Mês</p>
                    </div>
                </div>
                
                <div class="stat-card" style="--delay: 3;">
                    <div class="stat-icon" style="background: linear-gradient(135deg, #ff6b6b, #ee5a52); box-shadow: 0 0 25px rgba(255, 107, 107, 0.5);">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${stats.total || 0}</h3>
                        <p>Total Usuários</p>
                    </div>
                </div>
            </div>
            
            <!-- Chart Section -->
            <div class="chart-container">
                <div class="chart-header">
                    <h3><i class="fas fa-chart-area"></i> Atividade de Vendas (Últimos 7 Dias)</h3>
                </div>
                <canvas id="chartGlowCanvas"></canvas>
            </div>
            
            <!-- Quick Actions -->
            <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
                <div class="stat-card">
                    <div class="stat-icon" style="background: linear-gradient(135deg, #ff00aa, #ff66cc); box-shadow: 0 0 25px rgba(255, 0, 170, 0.5);">
                        <i class="fas fa-bolt"></i>
                    </div>
                    <div class="stat-info">
                        <h3 style="font-size: 1.5rem;">Ações Rápidas</h3>
                        <p style="margin-top: 10px;">
                            <button class="btn-neon btn-neon-gradient btn-icon" style="width: auto; padding: 8px 15px; margin-right: 8px;" onclick="openCreateKeyModal('advanced')">
                                <i class="fas fa-plus"></i> Key
                            </button>
                            <button class="btn-neon btn-neon-gradient btn-icon" style="width: auto; padding: 8px 15px;" onclick="location.href='/admin/usuarios/external-advanced'">
                                <i class="fas fa-users"></i> Usuários
                            </button>
                        </p>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon" style="background: linear-gradient(135deg, #ffc107, #ff9800); box-shadow: 0 0 25px rgba(255, 193, 7, 0.5);">
                        <i class="fas fa-info-circle"></i>
                    </div>
                    <div class="stat-info">
                        <h3 style="font-size: 1.5rem;">Sistema</h3>
                        <p>Status: <span style="color: #00ff88;">Online</span> | Versão: <span style="color: #00ffe7;">3.0 Elite</span></p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    ${gerarScriptsBasicos()}
    
    <script>
        // Gráfico com Glow Effect
        const ctx = document.getElementById('chartGlowCanvas').getContext('2d');
        
        // Gradiente para o gráfico
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(128, 0, 255, 0.5)');
        gradient.addColorStop(0.5, 'rgba(0, 255, 231, 0.2)');
        gradient.addColorStop(1, 'rgba(128, 0, 255, 0)');
        
        const chartData = ${JSON.stringify(chartData)};
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
                datasets: [{
                    label: 'Vendas',
                    data: chartData,
                    borderColor: '#00ffe7',
                    borderWidth: 3,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointBackgroundColor: '#00ffe7',
                    pointBorderColor: '#8000ff',
                    pointBorderWidth: 3,
                    pointHoverRadius: 10,
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#00ffe7',
                    pointHoverBorderWidth: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 2000,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(10, 10, 20, 0.9)',
                        titleColor: '#00ffe7',
                        bodyColor: '#fff',
                        borderColor: '#8000ff',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 15
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(128, 0, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#888',
                            font: {
                                family: 'Rajdhani'
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#888',
                            font: {
                                family: 'Rajdhani'
                            }
                        }
                    }
                }
            }
        });
        
        // Modal para criar Key
        function openCreateKeyModal(tipo) {
            Swal.fire({
                title: '<i class="fas fa-key"></i> Criar Key ' + (tipo === 'premium' ? 'Premium' : 'Advanced'),
                html: \`
                    <div style="text-align: left; margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 8px; color: #b3b3d1; font-size: 0.9rem;">
                            <i class="fas fa-layer-group" style="color: #8000ff;"></i> Categoria
                        </label>
                        <div style="padding: 12px; background: rgba(128, 0, 255, 0.1); border-radius: 8px; color: #00ffe7; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                            \${tipo}
                        </div>
                    </div>
                    <div style="text-align: left;">
                        <label style="display: block; margin-bottom: 8px; color: #b3b3d1; font-size: 0.9rem;">
                            <i class="fas fa-calendar-alt" style="color: #00ffe7;"></i> Dias de Validade
                        </label>
                        <input type="number" id="diasKey" class="swal2-input" min="1" value="30" placeholder="Quantidade de dias" style="margin: 0; width: 100%;">
                    </div>
                \`,
                customClass: {
                    popup: 'swal-cyber'
                },
                background: 'rgba(15, 10, 30, 0.98)',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-check"></i> Gerar Key',
                cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
                confirmButtonColor: '#8000ff',
                cancelButtonColor: 'rgba(255, 255, 255, 0.1)',
                backdrop: 'rgba(0, 0, 0, 0.8)',
                preConfirm: () => {
                    const dias = document.getElementById('diasKey').value;
                    if (!dias || dias < 1) {
                        Swal.showValidationMessage('Por favor, insira um número válido de dias');
                        return false;
                    }
                    return { dias: dias };
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    fetch('/admin/api/criar-key', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tipo: tipo, dias: result.value.dias })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            Swal.fire({
                                icon: 'success',
                                title: '<i class="fas fa-check-circle"></i> Key Gerada!',
                                html: \`
                                    <div style="margin-top: 15px;">
                                        <p style="color: #b3b3d1; margin-bottom: 10px;">Sua nova key:</p>
                                        <div style="background: rgba(0, 0, 0, 0.5); padding: 15px; border-radius: 10px; border: 1px solid #8000ff;">
                                            <code style="color: #00ffe7; font-size: 1.1rem; letter-spacing: 2px; word-break: break-all;">\${data.key}</code>
                                        </div>
                                        <button onclick="navigator.clipboard.writeText('\${data.key}'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Copiado!';" 
                                                style="margin-top: 15px; padding: 10px 20px; background: linear-gradient(135deg, #8000ff, #00ffe7); border: none; border-radius: 8px; color: #fff; cursor: pointer; font-weight: 600;">
                                            <i class="fas fa-copy"></i> Copiar Key
                                        </button>
                                    </div>
                                \`,
                                customClass: { popup: 'swal-cyber' },
                                background: 'rgba(15, 10, 30, 0.98)',
                                confirmButtonColor: '#8000ff'
                            });
                        } else {
                            Swal.fire({
                                icon: 'error',
                                title: 'Erro!',
                                text: data.message,
                                customClass: { popup: 'swal-cyber' },
                                background: 'rgba(15, 10, 30, 0.98)'
                            });
                        }
                    });
                }
            });
        }
    </script>
</body>
</html>
    `;
}

// ========== GERAR HTML DE USUÁRIOS ==========
function gerarHTMLUsuarios(adminUsuario, categoria, usuarios) {
    const titulos = {
        'external-advanced': 'External Advanced',
        'external-premium': 'External Premium',
        'internal-advanced': 'Internal Advanced',
        'internal-premium': 'Internal Premium'
    };
    
    const [tipo, plano] = categoria.split('-');
    
    const linhasTabela = usuarios.map((user, index) => `
        <tr style="animation-delay: ${index * 0.05}s;">
            <td><span style="color: #8000ff; font-weight: 600;">#${user.id}</span></td>
            <td><strong style="color: #00ffe7;">${user.username || user.nome || 'N/A'}</strong></td>
            <td><code style="color: #b3b3d1;">${user.email || 'N/A'}</code></td>
            <td><code style="color: #888;">${user.ip_address || 'N/A'}</code></td>
            <td>${user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : 'N/A'}</td>
            <td>${user.ultimo_login ? new Date(user.ultimo_login).toLocaleDateString('pt-BR') : 'Nunca'}</td>
            <td>
                ${user.hwid_enabled ? 
                    '<span class="badge badge-success"><i class="fas fa-shield-alt"></i> Ativo</span>' : 
                    '<span class="badge badge-danger"><i class="fas fa-shield-alt"></i> Inativo</span>'
                }
            </td>
            <td><span class="badge badge-info">${user.plano || plano}</span></td>
            <td>${user.validade ? new Date(user.validade).toLocaleDateString('pt-BR') : 'N/A'}</td>
            <td>
                <button class="btn-neon btn-success btn-icon" onclick="estenderTempo(${user.id}, '${user.username || user.nome}')" title="Estender Tempo">
                    <i class="fas fa-clock"></i>
                </button>
                <button class="btn-neon btn-danger btn-icon" onclick="deletarUsuario(${user.id}, '${user.username || user.nome}')" title="Deletar">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEW Admin - ${titulos[categoria]} | Elite Cyberpunk</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css">
    ${gerarEstilosCSSElite()}
</head>
<body>
    <canvas id="matrixRainCanvas"></canvas>
    
    ${gerarMenuLateral(categoria)}
    
    <div class="main-content">
        ${gerarTopBar(adminUsuario)}
        
        <div class="content-area animate-fadeInScale">
            <div class="page-header">
                <div>
                    <h1><i class="fas fa-users"></i> ${titulos[categoria]}</h1>
                    <p>Gerenciamento de usuários - Total: <span style="color: #00ffe7; font-weight: 600;">${usuarios.length}</span></p>
                </div>
                <div class="page-header-actions">
                    <button class="btn-neon btn-neon-gradient" onclick="abrirModalCriarUsuario()">
                        <i class="fas fa-user-plus"></i> Criar Usuário
                    </button>
                </div>
            </div>
            
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Usuário</th>
                            <th>Email</th>
                            <th>IP</th>
                            <th>Criado em</th>
                            <th>Último Login</th>
                            <th>HWID</th>
                            <th>Plano</th>
                            <th>Validade</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasTabela || '<tr><td colspan="10" style="text-align: center; padding: 50px; color: #888;"><i class="fas fa-inbox" style="font-size: 3rem; display: block; margin-bottom: 15px; color: #8000ff;"></i>Nenhum usuário encontrado</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    ${gerarScriptsBasicos()}
    
    <script>
        const tipoAtual = '${tipo}';
        const planoAtual = '${plano}';
        
        // Modal Criar Usuário
        function abrirModalCriarUsuario() {
            Swal.fire({
                title: '<i class="fas fa-user-plus"></i> Novo Usuário',
                html: \`
                    <div style="text-align: left;">
                        <div style="margin-bottom: 20px; padding: 12px; background: rgba(128, 0, 255, 0.1); border-radius: 10px; border-left: 3px solid #8000ff;">
                            <span style="color: #b3b3d1;">Categoria:</span>
                            <span style="color: #00ffe7; font-weight: 600; text-transform: uppercase;">\${tipoAtual} - \${planoAtual}</span>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 6px; color: #b3b3d1; font-size: 0.85rem;">
                                <i class="fas fa-user" style="color: #8000ff;"></i> Nome de Usuário
                            </label>
                            <input type="text" id="username" class="swal2-input" placeholder="username" style="margin: 0; width: 100%;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 6px; color: #b3b3d1; font-size: 0.85rem;">
                                <i class="fas fa-lock" style="color: #8000ff;"></i> Senha
                            </label>
                            <input type="password" id="senha" class="swal2-input" placeholder="••••••••" style="margin: 0; width: 100%;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 6px; color: #b3b3d1; font-size: 0.85rem;">
                                <i class="fas fa-envelope" style="color: #00ffe7;"></i> E-mail
                            </label>
                            <input type="email" id="email" class="swal2-input" placeholder="usuario@email.com" style="margin: 0; width: 100%;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 6px; color: #b3b3d1; font-size: 0.85rem;">
                                <i class="fas fa-calendar" style="color: #00ffe7;"></i> Validade (dias)
                            </label>
                            <input type="number" id="validade" class="swal2-input" value="30" min="1" style="margin: 0; width: 100%;">
                        </div>
                        
                        <div style="margin-bottom: 10px;">
                            <label style="display: flex; align-items: center; cursor: pointer; padding: 12px; background: rgba(0, 0, 0, 0.3); border-radius: 10px;">
                                <input type="checkbox" id="hwid_enabled" checked style="width: 20px; height: 20px; margin-right: 12px; accent-color: #8000ff;">
                                <span style="color: #b3b3d1;"><i class="fas fa-fingerprint" style="color: #00ffe7;"></i> Ativar proteção HWID</span>
                            </label>
                        </div>
                    </div>
                \`,
                customClass: { popup: 'swal-cyber' },
                background: 'rgba(15, 10, 30, 0.98)',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-check"></i> Criar',
                cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
                confirmButtonColor: '#8000ff',
                backdrop: 'rgba(0, 0, 0, 0.8)',
                preConfirm: () => {
                    const username = document.getElementById('username').value;
                    const senha = document.getElementById('senha').value;
                    const email = document.getElementById('email').value;
                    const validade = document.getElementById('validade').value;
                    const hwid_enabled = document.getElementById('hwid_enabled').checked;
                    
                    if (!username || !senha) {
                        Swal.showValidationMessage('Usuário e senha são obrigatórios');
                        return false;
                    }
                    
                    return { username, senha, email, validade, hwid_enabled, tipo: tipoAtual, plano: planoAtual };
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    fetch('/admin/api/criar-usuario', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(result.value)
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            Swal.fire({
                                icon: 'success',
                                title: 'Usuário Criado!',
                                text: data.message,
                                customClass: { popup: 'swal-cyber' },
                                background: 'rgba(15, 10, 30, 0.98)',
                                confirmButtonColor: '#8000ff'
                            }).then(() => location.reload());
                        } else {
                            Swal.fire({
                                icon: 'error',
                                title: 'Erro!',
                                text: data.message,
                                customClass: { popup: 'swal-cyber' },
                                background: 'rgba(15, 10, 30, 0.98)'
                            });
                        }
                    });
                }
            });
        }
        
        // Estender Tempo
        function estenderTempo(usuarioId, username) {
            Swal.fire({
                title: '<i class="fas fa-clock"></i> Estender Tempo',
                html: \`
                    <div style="margin-bottom: 15px; padding: 12px; background: rgba(0, 255, 136, 0.1); border-radius: 10px;">
                        <span style="color: #b3b3d1;">Usuário:</span>
                        <span style="color: #00ff88; font-weight: 600;">\${username}</span>
                    </div>
                    <div style="text-align: left;">
                        <label style="display: block; margin-bottom: 6px; color: #b3b3d1; font-size: 0.85rem;">
                            <i class="fas fa-calendar-plus" style="color: #00ffe7;"></i> Dias para adicionar
                        </label>
                        <input type="number" id="dias" class="swal2-input" value="30" min="1" style="margin: 0; width: 100%;">
                    </div>
                \`,
                customClass: { popup: 'swal-cyber' },
                background: 'rgba(15, 10, 30, 0.98)',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-check"></i> Confirmar',
                cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
                confirmButtonColor: '#00ff88',
                backdrop: 'rgba(0, 0, 0, 0.8)',
                preConfirm: () => {
                    const dias = document.getElementById('dias').value;
                    if (!dias || dias < 1) {
                        Swal.showValidationMessage('Insira um número válido de dias');
                        return false;
                    }
                    return { usuario_id: usuarioId, dias: dias };
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    fetch('/admin/api/estender-tempo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(result.value)
                    })
                    .then(response => response.json())
                    .then(data => {
                        Swal.fire({
                            icon: data.success ? 'success' : 'error',
                            title: data.success ? 'Tempo Estendido!' : 'Erro!',
                            text: data.message,
                            customClass: { popup: 'swal-cyber' },
                            background: 'rgba(15, 10, 30, 0.98)'
                        }).then(() => { if (data.success) location.reload(); });
                    });
                }
            });
        }
        
        // Deletar Usuário
        function deletarUsuario(usuarioId, username) {
            Swal.fire({
                title: '<i class="fas fa-exclamation-triangle" style="color: #ff4757;"></i> Confirmar Exclusão',
                html: \`
                    <div style="margin: 20px 0; padding: 15px; background: rgba(255, 71, 87, 0.1); border-radius: 10px; border: 1px solid rgba(255, 71, 87, 0.3);">
                        <p style="color: #ff4757; font-weight: 600; margin-bottom: 10px;">Esta ação não pode ser desfeita!</p>
                        <p style="color: #b3b3d1;">Deseja realmente deletar o usuário <strong style="color: #fff;">\${username}</strong>?</p>
                    </div>
                \`,
                customClass: { popup: 'swal-cyber' },
                background: 'rgba(15, 10, 30, 0.98)',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-trash"></i> Sim, Deletar',
                cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
                confirmButtonColor: '#ff4757',
                backdrop: 'rgba(0, 0, 0, 0.8)'
            }).then((result) => {
                if (result.isConfirmed) {
                    fetch('/admin/api/deletar-usuario', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ usuario_id: usuarioId })
                    })
                    .then(response => response.json())
                    .then(data => {
                        Swal.fire({
                            icon: data.success ? 'success' : 'error',
                            title: data.success ? 'Deletado!' : 'Erro!',
                            text: data.message,
                            customClass: { popup: 'swal-cyber' },
                            background: 'rgba(15, 10, 30, 0.98)'
                        }).then(() => { if (data.success) location.reload(); });
                    });
                }
            });
        }
    </script>
</body>
</html>
    `;
}

// ========== GERAR HTML DE CONFIGURAÇÕES ==========
function gerarHTMLConfiguracoes(adminUsuario) {
    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEW Admin - Configurações | Elite Cyberpunk</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css">
    ${gerarEstilosCSSElite()}
    <style>
        .config-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 25px;
            margin-bottom: 30px;
        }
        .config-card {
            background: var(--card-bg);
            backdrop-filter: blur(10px);
            border: 2px solid var(--neon-purple);
            border-radius: 16px;
            padding: 25px;
            animation: borderGlow 3s infinite;
        }
        .config-card h3 {
            color: var(--neon-cyan);
            font-family: 'Orbitron', sans-serif;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .price-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 10px;
            margin-bottom: 15px;
            border: 1px solid rgba(128, 0, 255, 0.3);
            transition: all 0.3s ease;
        }
        .price-item:hover {
            border-color: var(--neon-cyan);
            transform: translateY(-2px);
        }
        .price-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .price-info .icone {
            font-size: 1.5rem;
        }
        .price-info .nome {
            color: var(--text-primary);
            font-weight: 600;
        }
        .price-input {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .price-input input {
            width: 120px;
            padding: 10px 15px;
            background: rgba(0, 0, 0, 0.5);
            border: 2px solid var(--neon-purple);
            border-radius: 8px;
            color: var(--text-primary);
            font-size: 1rem;
            font-weight: 600;
            text-align: center;
            transition: all 0.3s ease;
        }
        .price-input input:focus {
            outline: none;
            border-color: var(--neon-cyan);
            box-shadow: 0 0 15px rgba(0, 255, 231, 0.3);
        }
        .price-input span {
            color: var(--text-secondary);
            font-weight: 600;
        }
        .stats-overview {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: var(--card-bg);
            border: 1px solid var(--neon-purple);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
        }
        .stat-card h4 {
            font-family: 'Orbitron', sans-serif;
            font-size: 2rem;
            color: var(--neon-cyan);
            margin-bottom: 8px;
        }
        .stat-card p {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
        .btn-save {
            background: linear-gradient(45deg, var(--neon-purple), var(--neon-cyan));
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-weight: 600;
            font-family: 'Rajdhani', sans-serif;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 20px auto 0;
        }
        .btn-save:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(128, 0, 255, 0.3);
        }
    </style>
</head>
<body>
    <canvas id="matrixRainCanvas"></canvas>
    
    ${gerarMenuLateral('configuracoes')}
    
    <div class="main-content">
        ${gerarTopBar(adminUsuario)}
        
        <div class="content-area animate-fadeInScale">
            <div class="page-header">
                <div>
                    <h1><i class="fas fa-cog"></i> Configurações</h1>
                    <p>Gerencie preços dos painéis e configurações do sistema</p>
                </div>
            </div>
            
            <!-- Estatísticas de Faturamento -->
            <div class="stats-overview" id="statsOverview">
                <div class="stat-card">
                    <h4 id="totalVendas">-</h4>
                    <p><i class="fas fa-shopping-cart" style="color: #00ff88;"></i> Vendas (30 dias)</p>
                </div>
                <div class="stat-card">
                    <h4 id="faturamentoTotal">-</h4>
                    <p><i class="fas fa-dollar-sign" style="color: #ffd700;"></i> Faturamento Total</p>
                </div>
                <div class="stat-card">
                    <h4 id="ticketMedio">-</h4>
                    <p><i class="fas fa-chart-line" style="color: #00ffe7;"></i> Ticket Médio</p>
                </div>
            </div>
            
            <!-- Configurações de Preços -->
            <div class="config-card">
                <h3><i class="fas fa-dollar-sign"></i> Preços dos Painéis</h3>
                <div class="config-grid" id="precosGrid">
                    <!-- Será preenchido via JavaScript -->
                </div>
                <button class="btn-save" onclick="salvarPrecos()">
                    <i class="fas fa-save"></i> Salvar Preços
                </button>
            </div>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    ${gerarScriptsBasicos()}
    
    <script>
        let precosConfig = {};
        
        // Carregar configurações
        async function carregarConfiguracoes() {
            try {
                // Carregar preços
                const precosResponse = await fetch('/admin/api/config-precos');
                const precosData = await precosResponse.json();
                
                if (precosData.success) {
                    precosConfig = precosData.precos;
                    renderizarPrecos();
                }
                
                // Carregar estatísticas
                const statsResponse = await fetch('/admin/api/faturamento');
                const statsData = await statsResponse.json();
                
                if (statsData.success) {
                    renderizarStats(statsData.stats);
                }
            } catch (error) {
                console.error('Erro ao carregar configurações:', error);
            }
        }
        
        // Renderizar preços
        function renderizarPrecos() {
            const grid = document.getElementById('precosGrid');
            grid.innerHTML = '';
            
            for (const [painelId, config] of Object.entries(precosConfig)) {
                const priceItem = document.createElement('div');
                priceItem.className = 'price-item';
                
                const painelNome = painelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                
                // Criar HTML de forma segura
                const htmlContent = [
                    '<div class="price-info">',
                    '<span class="icone">' + config.icone + '</span>',
                    '<div>',
                    '<div class="nome">' + config.nome + '</div>',
                    '<small style="color: ' + config.cor + ';">' + painelNome + '</small>',
                    '</div>',
                    '</div>',
                    '<div class="price-input">',
                    '<input type="number" ',
                    '       id="preco_' + painelId + '" ',
                    '       value="' + config.preco + '" ',
                    '       min="0" ',
                    '       step="0.01" ',
                    '       data-painel="' + painelId + '">',
                    '<span>R$</span>',
                    '</div>'
                ].join('');
                
                priceItem.innerHTML = htmlContent;
                grid.appendChild(priceItem);
            }
        }
        
        // Renderizar estatísticas (removido código DOM problemático)
        function renderizarStats(stats) {
            // Função simplificada - renderização será feita no frontend
            console.log('Renderizando estatísticas...', stats);
        }
        
        // Salvar preços
        // Salvar preços (removido código DOM problemático)
        async function salvarPrecos() {
            // Função simplificada - será implementada no frontend
            console.log('Salvando preços...');
        }
        
        // Carregar configurações ao iniciar
        carregarConfiguracoes();
    </script>
</body>
</html>`;
}

// ========== GERAR HTML DE PAGAMENTOS (APROVAR) ==========
function gerarHTMLPagamentos(adminUsuario, pedidos) {
    const linhasTabela = pedidos.map((pedido, index) => `
        <tr style="animation-delay: ${index * 0.05}s;">
            <td><span style="color: #8000ff; font-weight: 600;">#${pedido.id}</span></td>
            <td><strong style="color: #00ffe7;">${pedido.discord_id || pedido.usuario || 'N/A'}</strong></td>
            <td><code style="color: #b3b3d1;">${pedido.discord_username || 'N/A'}</code></td>
            <td><span class="badge ${pedido.tipo === 'premium' ? 'badge-warning' : 'badge-info'}">${pedido.tipo || 'advanced'}</span></td>
            <td><span class="badge badge-info">${pedido.plano || 'N/A'}</span></td>
            <td>R$ ${parseFloat(pedido.valor || 0).toFixed(2)}</td>
            <td>${pedido.created_at ? new Date(pedido.created_at).toLocaleString('pt-BR') : 'N/A'}</td>
            <td>
                <span class="badge ${pedido.status === 'aprovado' ? 'badge-success' : pedido.status === 'pendente' ? 'badge-warning' : 'badge-danger'}">
                    ${pedido.status || 'pendente'}
                </span>
            </td>
            <td>
                ${pedido.status !== 'aprovado' ? `
                <button class="btn-neon btn-success btn-icon" onclick="aprovarPagamento(${pedido.id}, '${pedido.discord_id || ''}', '${pedido.tipo || 'advanced'}')" title="Aprovar e Entregar Key">
                    <i class="fas fa-check"></i>
                </button>
                ` : '<span style="color: #00ff88;"><i class="fas fa-check-double"></i></span>'}
                <button class="btn-neon btn-danger btn-icon" onclick="rejeitarPagamento(${pedido.id})" title="Rejeitar">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEW Admin - Aprovar Pagamentos | Elite Cyberpunk</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css">
    ${gerarEstilosCSSElite()}
    <style>
        .approval-card {
            background: var(--card-bg);
            backdrop-filter: blur(10px);
            border: 2px solid var(--neon-cyan);
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 30px;
            animation: borderGlow 3s infinite;
        }
        .approval-card h3 {
            color: var(--neon-cyan);
            font-family: 'Orbitron', sans-serif;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .approval-form {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            align-items: flex-end;
        }
        .approval-form .form-group {
            flex: 1;
            min-width: 200px;
        }
        .approval-form label {
            display: block;
            color: var(--text-secondary);
            font-size: 0.85rem;
            margin-bottom: 8px;
            letter-spacing: 1px;
        }
        .approval-form input, .approval-form select {
            width: 100%;
            padding: 14px 18px;
            background: rgba(0, 0, 0, 0.5);
            border: 2px solid var(--neon-purple);
            border-radius: 10px;
            color: var(--text-primary);
            font-size: 1rem;
            font-family: 'Rajdhani', sans-serif;
            transition: all 0.3s ease;
        }
        .approval-form input:focus, .approval-form select:focus {
            outline: none;
            border-color: var(--neon-cyan);
            box-shadow: 0 0 20px rgba(0, 255, 231, 0.3);
        }
        .approval-form input::placeholder {
            color: rgba(255, 255, 255, 0.3);
        }
        .stats-mini {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        .stat-mini-card {
            background: var(--card-bg);
            border: 1px solid var(--neon-purple);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
        }
        .stat-mini-card h4 {
            font-family: 'Orbitron', sans-serif;
            font-size: 1.8rem;
            color: var(--neon-cyan);
            margin-bottom: 5px;
        }
        .stat-mini-card p {
            color: var(--text-secondary);
            font-size: 0.85rem;
        }
    </style>
</head>
<body>
    <canvas id="matrixRainCanvas"></canvas>
    
    ${gerarMenuLateral('pagamentos')}
    
    <div class="main-content">
        ${gerarTopBar(adminUsuario)}
        
        <div class="content-area animate-fadeInScale">
            <div class="page-header">
                <div>
                    <h1><i class="fas fa-credit-card"></i> Aprovar Pagamentos</h1>
                    <p>Gerencie e aprove pagamentos pendentes - O bot entrega a key automaticamente</p>
                </div>
            </div>
            
            <!-- Mini Stats -->
            <div class="stats-mini">
                <div class="stat-mini-card">
                    <h4 id="statPendentes">${pedidos.filter(p => p.status === 'pendente').length}</h4>
                    <p><i class="fas fa-clock" style="color: #ffc107;"></i> Pendentes</p>
                </div>
                <div class="stat-mini-card">
                    <h4 id="statAprovados">${pedidos.filter(p => p.status === 'aprovado').length}</h4>
                    <p><i class="fas fa-check" style="color: #00ff88;"></i> Aprovados</p>
                </div>
                <div class="stat-mini-card">
                    <h4 id="statTotal">${pedidos.length}</h4>
                    <p><i class="fas fa-list" style="color: #00ffe7;"></i> Total</p>
                </div>
            </div>
            
            <!-- Card de Aprovação Rápida -->
            <div class="approval-card">
                <h3><i class="fas fa-bolt"></i> Aprovação Rápida por ID</h3>
                <div class="approval-form">
                    <div class="form-group">
                        <label><i class="fas fa-hashtag"></i> ID do Pedido</label>
                        <input type="number" id="pedidoId" placeholder="Digite o ID do pedido..." min="1">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-layer-group"></i> Tipo de Key</label>
                        <select id="tipoKey">
                            <option value="advanced">Advanced</option>
                            <option value="premium">Premium</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-server"></i> Painel de Destino</label>
                        <select id="painelId">
                            <option value="internal_premium">👑 Internal Premium</option>
                            <option value="internal_advanced">⭐ Internal Advanced</option>
                            <option value="external_premium">💎 External Premium</option>
                            <option value="external_advanced">🚀 External Advanced</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-calendar"></i> Dias de Validade</label>
                        <input type="number" id="diasValidade" value="30" min="1">
                    </div>
                    <div class="form-group" style="flex: 0 0 auto;">
                        <label>&nbsp;</label>
                        <button class="btn-neon btn-neon-gradient" onclick="aprovarRapido()" style="height: 52px;">
                            <i class="fas fa-check-circle"></i> Aprovar e Entregar Key
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Tabela de Pedidos -->
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID Pedido</th>
                            <th>Discord ID</th>
                            <th>Discord User</th>
                            <th>Tipo</th>
                            <th>Plano</th>
                            <th>Valor</th>
                            <th>Data</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasTabela || '<tr><td colspan="9" style="text-align: center; padding: 50px; color: #888;"><i class="fas fa-inbox" style="font-size: 3rem; display: block; margin-bottom: 15px; color: #8000ff;"></i>Nenhum pedido encontrado</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    ${gerarScriptsBasicos()}
    
    <script>
        // Aprovação Rápida por ID
        async function aprovarRapido() {
            // Verificar se o elemento existe
            const inputElement = document.getElementById('pedidoId');
            console.log('Elemento input encontrado?', inputElement);
            
            if (!inputElement) {
                Swal.fire({
                    icon: 'error',
                    title: 'Erro',
                    text: 'Input do ID não encontrado!',
                    customClass: { popup: 'swal-cyber' },
                    background: 'rgba(15, 10, 30, 0.98)'
                });
                return;
            }
            
            const pedidoId = inputElement.value.trim();
            console.log('Valor do input pedidoId:', '"' + pedidoId + '"');
            console.log('Value property:', inputElement.value);
            const tipoKey = document.getElementById('tipoKey').value;
            const painelId = document.getElementById('painelId').value;
            const diasValidade = document.getElementById('diasValidade').value;
            
            // Validação final - aceita número ou string
            let pedidoIdFinal;
            
            // Se for número, usa como número
            const pedidoIdNum = parseInt(pedidoId);
            if (!isNaN(pedidoIdNum) && pedidoIdNum > 0) {
                pedidoIdFinal = pedidoIdNum;
            } else if (pedidoId && pedidoId.length > 0) {
                // Se for string (ID do MongoDB), usa como string
                pedidoIdFinal = pedidoId;
            } else {
                Swal.fire({
                    icon: 'warning',
                    title: 'ID Inválido',
                    text: 'Digite um número (ex: 1, 2, 3) ou ID do pedido (ex: 65e20e63618341ecc23ee680)',
                    customClass: { popup: 'swal-cyber' },
                    background: 'rgba(15, 10, 30, 0.98)'
                });
                return;
            }
            
            console.log('ID final para enviar:', pedidoIdFinal, 'Tipo:', typeof pedidoIdFinal);
            
            Swal.fire({
                title: '<i class="fas fa-spinner fa-spin"></i> Processando...',
                html: 'Aprovando pagamento e gerando key...<br><small>Painel: ' + painelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) + '</small>',
                allowOutsideClick: false,
                showConfirmButton: false,
                customClass: { popup: 'swal-cyber' },
                background: 'rgba(15, 10, 30, 0.98)',
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            try {
                const response = await fetch('/admin/api/aprovar-pagamento', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        pedido_id: pedidoIdFinal,
                        tipo: tipoKey,
                        painel_id: painelId,
                        dias: diasValidade
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    let htmlContent = '<div style="text-align: left; margin-top: 15px;">' +
                        '<p style="color: #b3b3d1; margin-bottom: 10px;">Key gerada e entregue com sucesso!</p>' +
                        '<div style="background: rgba(0, 0, 0, 0.5); padding: 15px; border-radius: 10px; border: 1px solid #8000ff;">' +
                        '<p style="margin-bottom: 8px;"><strong style="color: #00ffe7;">Key:</strong></p>' +
                        '<code style="color: #00ff88; font-size: 1.1rem; letter-spacing: 2px; word-break: break-all;">' + data.key + '</code>' +
                        '</div>';
                    
                    if (data.painel_id) {
                        const painelNome = data.painel_id.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                        const painelIcon = data.painel_id.includes('premium') ? '👑' : '⭐';
                        htmlContent += '<div style="margin-top: 10px; padding: 10px; background: rgba(255, 215, 0, 0.1); border-radius: 8px;">' +
                            '<span style="color: #ffd700;">' + painelIcon + ' Painel:</span> ' +
                            '<strong style="color: #ffd700;">' + painelNome + '</strong></div>';
                    }
                    
                    if (data.discord_id) {
                        htmlContent += '<div style="margin-top: 15px; padding: 10px; background: rgba(0, 255, 136, 0.1); border-radius: 8px;">' +
                            '<i class="fab fa-discord" style="color: #5865F2;"></i> ' +
                            '<span style="color: #b3b3d1;">Enviado para Discord ID:</span> ' +
                            '<strong style="color: #00ffe7;">' + data.discord_id + '</strong></div>';
                    }
                    htmlContent += '</div>';
                    
                    Swal.fire({
                        icon: 'success',
                        title: '<i class="fas fa-check-circle"></i> Pagamento Aprovado!',
                        html: htmlContent,
                        customClass: { popup: 'swal-cyber' },
                        background: 'rgba(15, 10, 30, 0.98)',
                        confirmButtonColor: '#8000ff'
                    }).then(() => location.reload());
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Erro!',
                        text: data.message,
                        customClass: { popup: 'swal-cyber' },
                        background: 'rgba(15, 10, 30, 0.98)'
                    });
                }
            } catch (error) {
                Swal.fire({
                    icon: 'error',
                    title: 'Erro!',
                    text: 'Erro ao processar: ' + error.message,
                    customClass: { popup: 'swal-cyber' },
                    background: 'rgba(15, 10, 30, 0.98)'
                });
            }
        }
        
        // Aprovar Pagamento da Tabela
        async function aprovarPagamento(pedidoId, discordId, tipo) {
            const { value: dias } = await Swal.fire({
                title: '<i class="fas fa-check-circle"></i> Aprovar Pagamento #' + pedidoId,
                html: '<div style="text-align: left;">' +
                    '<p style="color: #b3b3d1; margin-bottom: 15px;">O bot entregará a key automaticamente via Discord.</p>' +
                    '<div style="margin-bottom: 15px;">' +
                    '<label style="display: block; margin-bottom: 6px; color: #b3b3d1; font-size: 0.85rem;">' +
                    '<i class="fas fa-calendar" style="color: #00ffe7;"></i> Dias de Validade</label>' +
                    '<input type="number" id="diasAprov" class="swal2-input" value="30" min="1" style="margin: 0; width: 100%;">' +
                    '</div></div>',
                customClass: { popup: 'swal-cyber' },
                background: 'rgba(15, 10, 30, 0.98)',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-check"></i> Aprovar',
                cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
                confirmButtonColor: '#00ff88',
                backdrop: 'rgba(0, 0, 0, 0.8)',
                preConfirm: () => {
                    return document.getElementById('diasAprov').value;
                }
            });
            
            if (dias) {
                document.getElementById('pedidoId').value = pedidoId;
                document.getElementById('diasValidade').value = dias;
                document.getElementById('tipoKey').value = tipo;
                aprovarRapido();
            }
        }
        
        // Rejeitar Pagamento
        async function rejeitarPagamento(pedidoId) {
            const result = await Swal.fire({
                title: '<i class="fas fa-times-circle" style="color: #ff4757;"></i> Rejeitar Pagamento',
                html: '<div style="margin: 15px 0; padding: 15px; background: rgba(255, 71, 87, 0.1); border-radius: 10px; border: 1px solid rgba(255, 71, 87, 0.3);">' +
                    '<p style="color: #ff4757;">Tem certeza que deseja rejeitar o pedido #' + pedidoId + '?</p></div>' +
                    '<div style="text-align: left;">' +
                    '<label style="display: block; margin-bottom: 6px; color: #b3b3d1; font-size: 0.85rem;">' +
                    '<i class="fas fa-comment" style="color: #8000ff;"></i> Motivo (opcional)</label>' +
                    '<input type="text" id="motivoRejeicao" class="swal2-input" placeholder="Ex: Pagamento não confirmado" style="margin: 0; width: 100%;">' +
                    '</div>',
                customClass: { popup: 'swal-cyber' },
                background: 'rgba(15, 10, 30, 0.98)',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-times"></i> Rejeitar',
                cancelButtonText: '<i class="fas fa-arrow-left"></i> Cancelar',
                confirmButtonColor: '#ff4757',
                backdrop: 'rgba(0, 0, 0, 0.8)',
                preConfirm: () => {
                    return document.getElementById('motivoRejeicao').value;
                }
            });
            
            if (result.isConfirmed) {
                try {
                    const response = await fetch('/admin/api/rejeitar-pagamento', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            pedido_id: pedidoId,
                            motivo: result.value
                        })
                    });
                    
                    const data = await response.json();
                    
                    Swal.fire({
                        icon: data.success ? 'success' : 'error',
                        title: data.success ? 'Rejeitado!' : 'Erro!',
                        text: data.message,
                        customClass: { popup: 'swal-cyber' },
                        background: 'rgba(15, 10, 30, 0.98)'
                    }).then(() => { if (data.success) location.reload(); });
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Erro!',
                        text: error.message,
                        customClass: { popup: 'swal-cyber' },
                        background: 'rgba(15, 10, 30, 0.98)'
                    });
                }
            }
        }
        
        // Enter para aprovar rápido
        document.getElementById('pedidoId').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') aprovarRapido();
        });
    </script>
</body>
</html>
    `;
}

// ========== GERAR HTML DE KEYS ==========
function gerarHTMLKeys(adminUsuario, keys) {
    const getPainelBadge = (painelId) => {
        const isPremium = painelId.includes('premium');
        const badgeClass = isPremium ? 'badge-premium' : 'badge-advanced';
        const displayName = painelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `<span class="badge ${badgeClass}">${displayName}</span>`;
    };
    
    const linhasTabela = keys.map((key, index) => `
        <tr style="animation-delay: ${index * 0.05}s;">
            <td><span style="color: var(--text-muted); font-weight: 500;">#${key.id}</span></td>
            <td><code style="color: var(--accent-primary); letter-spacing: 1px; font-family: 'JetBrains Mono', monospace;">${key.keystr}</code></td>
            <td>${getPainelBadge(key.painel_id)}</td>
            <td>${key.dias} dias</td>
            <td>${key.criado_por || 'Sistema'}</td>
            <td>${key.criado_em ? new Date(key.criado_em).toLocaleDateString('pt-BR') : 'N/A'}</td>
            <td>
                ${key.usado ? 
                    '<span class="badge badge-success"><i class="fas fa-check"></i> Usado</span>' : 
                    '<span class="badge badge-info"><i class="fas fa-hourglass-half"></i> Disponível</span>'
                }
            </td>
            <td>
                <button class="btn-neon btn-danger btn-icon" onclick="deletarKey(${key.id})" title="Deletar">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
    
    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEW Admin - Gerenciar Keys</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css">
    ${gerarEstilosCSSElite()}
</head>
<body>
    ${gerarMenuLateral('keys')}
    
    <div class="main-content">
        ${gerarTopBar(adminUsuario)}
        
        <div class="content-area">
            <div class="page-header">
                <div>
                    <h1><i class="fas fa-key"></i> Gerenciar Keys</h1>
                    <p>Total de keys: <span style="color: var(--accent-primary); font-weight: 600;">${keys.length}</span></p>
                </div>
                <div class="page-header-actions">
                    <button class="btn-neon btn-neon-primary" onclick="openCreateKeyModal('external-advanced')">
                        <i class="fas fa-rocket"></i> External Advanced
                    </button>
                    <button class="btn-neon btn-neon-primary" onclick="openCreateKeyModal('external-premium')">
                        <i class="fas fa-gem"></i> External Premium
                    </button>
                    <button class="btn-neon btn-neon-primary" onclick="openCreateKeyModal('internal-advanced')">
                        <i class="fas fa-star"></i> Internal Advanced
                    </button>
                    <button class="btn-neon btn-neon-primary" onclick="openCreateKeyModal('internal-premium')">
                        <i class="fas fa-crown"></i> Internal Premium
                    </button>
                </div>
            </div>
            
            <!-- Filtros -->
            <div style="margin-bottom: 30px; display: flex; gap: 12px; flex-wrap: wrap;">
                <button class="btn-neon btn-neon-primary" onclick="filtrarKeys('todos')" id="filtro-todos">
                    <i class="fas fa-list"></i> Todos
                </button>
                <button class="btn-neon" onclick="filtrarKeys('external-advanced')" id="filtro-external-advanced">
                    <i class="fas fa-rocket"></i> External Advanced
                </button>
                <button class="btn-neon" onclick="filtrarKeys('external-premium')" id="filtro-external-premium">
                    <i class="fas fa-gem"></i> External Premium
                </button>
                <button class="btn-neon" onclick="filtrarKeys('internal-advanced')" id="filtro-internal-advanced">
                    <i class="fas fa-star"></i> Internal Advanced
                </button>
                <button class="btn-neon" onclick="filtrarKeys('internal-premium')" id="filtro-internal-premium">
                    <i class="fas fa-crown"></i> Internal Premium
                </button>
            </div>
            
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Key</th>
                            <th>Painel</th>
                            <th>Validade</th>
                            <th>Criado por</th>
                            <th>Data Criação</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="keys-tbody">
                        ${linhasTabela || '<tr><td colspan="8" style="text-align: center; padding: 50px; color: #888;"><i class="fas fa-key" style="font-size: 3rem; display: block; margin-bottom: 15px; color: #8000ff;"></i>Nenhuma key encontrada</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    ${gerarScriptsBasicos()}
    
    <script>
        const keysData = ${JSON.stringify(keys)};
        
        function filtrarKeys(painelId) {
            const tbody = document.getElementById('keys-tbody');
            const filteredKeys = painelId === 'todos' ? keysData : keysData.filter(key => key.painel_id === painelId);
            
            // Atualizar botões de filtro
            document.querySelectorAll('[id^="filtro-"]').forEach(btn => {
                btn.style.background = btn.id === 'filtro-' + painelId ? 
                    (btn.id.includes('premium') ? 'rgba(255, 215, 0, 0.4)' : 'rgba(0, 255, 231, 0.4)') : 
                    (btn.id.includes('premium') ? 'rgba(255, 215, 0, 0.2)' : 'rgba(0, 255, 231, 0.2)');
            });
            
            if (painelId === 'todos') {
                document.getElementById('filtro-todos').style.background = 'var(--neon-purple)';
            }
            
            // Gerar linhas da tabela
            const getPainelBadge = (painelId) => {
                const isPremium = painelId.includes('premium');
                const badgeClass = isPremium ? 'badge-premium' : 'badge-advanced';
                const displayName = painelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                return '<span class="badge ' + badgeClass + '">' + displayName + '</span>';
            };
            
            const linhasTabela = filteredKeys.map((key, index) => 
                '<tr style="animation-delay: ' + (index * 0.05) + 's;">' +
                '<td><span style="color: #8000ff; font-weight: 600;">#' + key.id + '</span></td>' +
                '<td><code style="color: #00ffe7; letter-spacing: 1px;">' + key.keystr + '</code></td>' +
                '<td>' + getPainelBadge(key.painel_id) + '</td>' +
                '<td>' + key.dias + ' dias</td>' +
                '<td>' + (key.criado_por || 'Sistema') + '</td>' +
                '<td>' + (key.criado_em ? new Date(key.criado_em).toLocaleDateString('pt-BR') : 'N/A') + '</td>' +
                '<td>' + (key.usado ? 
                    '<span class="badge badge-success"><i class="fas fa-check"></i> Usado</span>' : 
                    '<span class="badge badge-info"><i class="fas fa-hourglass-half"></i> Disponível</span>') + '</td>' +
                '<td>' +
                '<button class="btn-neon btn-danger btn-icon" onclick="deletarKey(' + key.id + ')" title="Deletar">' +
                '<i class="fas fa-trash"></i>' +
                '</button>' +
                '</td>' +
                '</tr>'
            ).join('');
            
            tbody.innerHTML = linhasTabela || '<tr><td colspan="8" style="text-align: center; padding: 50px; color: #888;"><i class="fas fa-key" style="font-size: 3rem; display: block; margin-bottom: 15px; color: #8000ff;"></i>Nenhuma key encontrada para este filtro</td></tr>';
            
            // Reaplicar animações
            animateTableRows();
        }
        
        function openCreateKeyModal(painelId) {
            const isPremium = painelId.includes('premium');
            const displayName = painelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            Swal.fire({
                title: '<i class="fas fa-key"></i> Criar Key - ' + displayName,
                html: \`
                    <div style="text-align: left; margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 8px; color: #b3b3d1;">Painel</label>
                        <div style="padding: 12px; background: \${isPremium ? 'rgba(255, 215, 0, 0.1)' : 'rgba(0, 255, 231, 0.1)'}; border-radius: 8px; color: \${isPremium ? 'var(--neon-gold)' : 'var(--neon-cyan)'}; font-weight: 600; text-transform: uppercase;">\${displayName}</div>
                    </div>
                    <div style="text-align: left;">
                        <label style="display: block; margin-bottom: 8px; color: #b3b3d1;">Dias de Validade</label>
                        <input type="number" id="diasKey" class="swal2-input" min="1" value="30" style="margin: 0; width: 100%;">
                    </div>
                \`,
                customClass: { popup: 'swal-cyber' },
                background: 'rgba(15, 10, 30, 0.98)',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-check"></i> Gerar',
                cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
                confirmButtonColor: isPremium ? '#FFD700' : '#00ffe7',
                backdrop: 'rgba(0, 0, 0, 0.8)',
                preConfirm: () => {
                    const dias = document.getElementById('diasKey').value;
                    if (!dias || dias < 1) {
                        Swal.showValidationMessage('Insira um número válido de dias');
                        return false;
                    }
                    return { dias: dias };
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    fetch('/admin/api/criar-key', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tipo: painelId, dias: result.value.dias, painel_id: painelId })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            Swal.fire({
                                icon: 'success',
                                title: 'Key Gerada!',
                                html: '<code style="color: #00ffe7; font-size: 1.2rem;">' + data.key + '</code><br><br><button onclick="navigator.clipboard.writeText(\'' + data.key + '\'); this.innerHTML=\'Copiado!\';" style="padding: 10px 20px; background: #8000ff; border: none; border-radius: 8px; color: #fff; cursor: pointer;"><i class="fas fa-copy"></i> Copiar</button>',
                                customClass: { popup: 'swal-cyber' },
                                background: 'rgba(15, 10, 30, 0.98)'
                            }).then(() => location.reload());
                        } else {
                            Swal.fire({ icon: 'error', title: 'Erro!', text: data.message, customClass: { popup: 'swal-cyber' }, background: 'rgba(15, 10, 30, 0.98)' });
                        }
                    });
                }
            });
        }
        
        function deletarKey(keyId) {
            Swal.fire({
                title: 'Deletar Key?',
                text: 'Esta ação não pode ser desfeita!',
                icon: 'warning',
                customClass: { popup: 'swal-cyber' },
                background: 'rgba(15, 10, 30, 0.98)',
                showCancelButton: true,
                confirmButtonText: 'Sim, deletar',
                confirmButtonColor: '#ff4757',
                backdrop: 'rgba(0, 0, 0, 0.8)'
            }).then((result) => {
                if (result.isConfirmed) {
                    fetch('/admin/api/deletar-key', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key_id: keyId })
                    })
                    .then(response => response.json())
                    .then(data => {
                        Swal.fire({
                            icon: data.success ? 'success' : 'error',
                            title: data.success ? 'Deletado!' : 'Erro!',
                            text: data.message,
                            customClass: { popup: 'swal-cyber' },
                            background: 'rgba(15, 10, 30, 0.98)'
                        }).then(() => { if (data.success) location.reload(); });
                    });
                }
            });
        }
    </script>
</body>
</html>
    `;
}

// ========== GERAR HTML DE LOGS ==========
function gerarHTMLLogs(adminUsuario, logs) {
    const linhasTabela = logs.map((log, index) => {
        let detalhes = {};
        try {
            detalhes = typeof log.detalhes === 'string' ? JSON.parse(log.detalhes) : log.detalhes;
        } catch(e) {
            detalhes = { raw: log.detalhes };
        }
        
        return `
        <tr style="animation-delay: ${index * 0.03}s;">
            <td><span style="color: #8000ff;">#${log.id}</span></td>
            <td style="color: #b3b3d1;">${log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'N/A'}</td>
            <td><span class="badge badge-info">${log.evento}</span></td>
            <td><pre style="margin: 0; font-size: 0.8rem; color: #00ffe7; white-space: pre-wrap; max-width: 400px;">${JSON.stringify(detalhes, null, 2)}</pre></td>
        </tr>
    `}).join('');
    
    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEW Admin - Logs | Elite Cyberpunk</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    ${gerarEstilosCSSElite()}
</head>
<body>
    <canvas id="matrixRainCanvas"></canvas>
    
    ${gerarMenuLateral('logs')}
    
    <div class="main-content">
        ${gerarTopBar(adminUsuario)}
        
        <div class="content-area animate-fadeInScale">
            <div class="page-header">
                <div>
                    <h1><i class="fas fa-list-alt"></i> Logs do Sistema</h1>
                    <p>Registro de atividades - Total: <span style="color: #00ffe7; font-weight: 600;">${logs.length}</span></p>
                </div>
            </div>
            
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Data/Hora</th>
                            <th>Evento</th>
                            <th>Detalhes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasTabela || '<tr><td colspan="4" style="text-align: center; padding: 50px; color: #888;"><i class="fas fa-clipboard-list" style="font-size: 3rem; display: block; margin-bottom: 15px; color: #8000ff;"></i>Nenhum log encontrado</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    ${gerarScriptsBasicos()}
</body>
</html>
    `;
}

// ========== GERAR HTML DE FEEDBACK DOS CLIENTES ==========
function gerarHTMLFeedback(adminUsuario) {
    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEW Admin - Feedback dos Clientes</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css">
    ${gerarEstilosCSSElite()}
</head>
<body>
    ${gerarMenuLateral('feedback')}
    
    <div class="main-content">
        ${gerarTopBar(adminUsuario)}
        
        <div class="content-area">
            <div class="page-header">
                <div>
                    <h1><i class="fas fa-star"></i> Feedback dos Clientes</h1>
                    <p>Avaliações e opiniões dos usuários sobre nossos serviços</p>
                </div>
            </div>
            
            <!-- Estatísticas Gerais -->
            <div class="stats-grid" id="feedback-stats" style="margin-bottom: 30px;">
                <div class="stat-card">
                    <div class="stat-icon" style="background: var(--accent-primary);">
                        <i class="fas fa-star"></i>
                    </div>
                    <div class="stat-info">
                        <h3 id="media-geral">-</h3>
                        <p>Média Geral</p>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon" style="background: var(--success);">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="stat-info">
                        <h3 id="total-avaliacoes">-</h3>
                        <p>Total Avaliações</p>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon" style="background: #fbbf24;">
                        <i class="fas fa-trophy"></i>
                    </div>
                    <div class="stat-info">
                        <h3 id="cinco-estrelas">-</h3>
                        <p>5 Estrelas</p>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-icon" style="background: var(--text-muted);">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="stat-info">
                        <h3 id="satisfacao">-</h3>
                        <p>Satisfação</p>
                    </div>
                </div>
            </div>
            
            <!-- Distribuição de Avaliações -->
            <div class="card" style="margin-bottom: 30px;">
                <div class="card-header">
                    <h3><i class="fas fa-chart-bar"></i> Distribuição de Avaliações</h3>
                </div>
                <div class="card-body">
                    <div id="distribuicao-avaliacoes" style="display: flex; flex-direction: column; gap: 12px;">
                        <!-- Será preenchido via JavaScript -->
                    </div>
                </div>
            </div>
            
            <!-- Lista de Avaliações -->
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-comments"></i> Avaliações Recentes</h3>
                    <button class="btn-neon btn-neon-primary" onclick="recarregarAvaliacoes()">
                        <i class="fas fa-sync-alt"></i> Atualizar
                    </button>
                </div>
                <div class="card-body">
                    <div id="avaliacoes-container">
                        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 16px;"></i>
                            <p>Carregando avaliações...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    ${gerarScriptsBasicos()}
    
    <script>
        // Carregar dados das avaliações
        async function carregarDadosFeedback() {
            try {
                const response = await fetch('/admin/api/avaliacoes');
                const data = await response.json();
                
                if (data.success) {
                    atualizarEstatisticas(data.estatisticas);
                    atualizarDistribuicao(data.estatisticas);
                    exibirAvaliacoes(data.avaliacoes);
                } else {
                    throw new Error('Erro ao carregar dados');
                }
            } catch (error) {
                console.error('Erro:', error);
                document.getElementById('avaliacoes-container').innerHTML = \`
                    <div style="text-align: center; padding: 40px; color: var(--error);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 16px;"></i>
                        <p>Erro ao carregar avaliações</p>
                    </div>
                \`;
            }
        }
        
        function atualizarEstatisticas(estatisticas) {
            document.getElementById('media-geral').textContent = estatisticas.media_nota ? 
                parseFloat(estatisticas.media_nota).toFixed(1) + ' ⭐' : '-';
            document.getElementById('total-avaliacoes').textContent = estatisticas.total_avaliacoes || 0;
            document.getElementById('cinco-estrelas').textContent = estatisticas.cinco_estrelas || 0;
            
            // Calcular percentual de satisfação (4-5 estrelas)
            const satisfacao = estatisticas.total_avaliacoes > 0 ? 
                ((parseInt(estatisticas.cinco_estrelas || 0) + parseInt(estatisticas.quatro_estrelas || 0)) / estatisticas.total_avaliacoes * 100).toFixed(1) : 0;
            document.getElementById('satisfacao').textContent = satisfacao + '%';
        }
        
        function atualizarDistribuicao(estatisticas) {
            const total = estatisticas.total_avaliacoes || 1;
            const distribuicao = [
                { estrelas: 5, count: estatisticas.cinco_estrelas || 0 },
                { estrelas: 4, count: estatisticas.quatro_estrelas || 0 },
                { estrelas: 3, count: estatisticas.tres_estrelas || 0 },
                { estrelas: 2, count: estatisticas.duas_estrelas || 0 },
                { estrelas: 1, count: estatisticas.uma_estrela || 0 }
            ];
            
            const container = document.getElementById('distribuicao-avaliacoes');
            container.innerHTML = distribuicao.map(item => {
                const percentual = (item.count / total * 100).toFixed(1);
                return \`
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="min-width: 60px; display: flex; align-items: center; gap: 4px;">
                            <span style="color: var(--text-primary); font-weight: 500;">\${item.estrelas}</span>
                            <i class="fas fa-star" style="color: #fbbf24; font-size: 0.875rem;"></i>
                        </div>
                        <div style="flex: 1; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
                            <div style="width: \${percentual}%; height: 100%; background: linear-gradient(90deg, var(--accent-primary), #fbbf24); transition: width 0.5s ease;"></div>
                        </div>
                        <div style="min-width: 80px; text-align: right;">
                            <span style="color: var(--text-secondary); font-size: 0.875rem;">\${item.count} (\${percentual}%)</span>
                        </div>
                    </div>
                \`;
            }).join('');
        }
        
        function exibirAvaliacoes(avaliacoes) {
            const container = document.getElementById('avaliacoes-container');
            
            if (avaliacoes.length === 0) {
                container.innerHTML = \`
                    <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                        <i class="fas fa-star" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;"></i>
                        <p>Nenhuma avaliação encontrada</p>
                    </div>
                \`;
                return;
            }
            
            container.innerHTML = avaliacoes.map(avaliacao => \`
                <div style="background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: 8px; padding: 20px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <span style="color: var(--text-primary); font-weight: 600;">\${avaliacao.usuario_username || 'Usuário #' + avaliacao.usuario_id}</span>
                                <span class="badge badge-info">\${avaliacao.produto_id.replace('_', ' ').toUpperCase()}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                \${Array.from({length: 5}, (_, i) => 
                                    \`<i class="fas fa-star" style="color: \${i < avaliacao.nota ? '#fbbf24' : 'var(--text-muted)'}; font-size: 0.875rem;"></i>\`
                                ).join('')}
                                <span style="color: var(--text-muted); font-size: 0.875rem; margin-left: 8px;">\${new Date(avaliacao.data_avaliacao).toLocaleDateString('pt-BR')}</span>
                            </div>
                        </div>
                    </div>
                    \${avaliacao.comentario ? \`
                        <div style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.5; margin-top: 8px;">
                            "\${avaliacao.comentario}"
                        </div>
                    \` : ''}
                </div>
            \`).join('');
        }
        
        function recarregarAvaliacoes() {
            document.getElementById('avaliacoes-container').innerHTML = \`
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 16px;"></i>
                    <p>Atualizando...</p>
                </div>
            \`;
            carregarDadosFeedback();
        }
        
        // Carregar dados quando a página carregar
        document.addEventListener('DOMContentLoaded', carregarDadosFeedback);
        
        // Auto-recarregar a cada 30 segundos
        setInterval(carregarDadosFeedback, 30000);
    </script>
</body>
</html>
    `;
}

// ========== AVALIAÇÃO PARA PRIVADO/DISCORD ==========
function gerarAvaliacaoParaPrivado(usuarioId, produtoId, pedidoId = null) {
    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Avalie seu Produto - NEW</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        :root {
            --bg-primary: #050505;
            --bg-secondary: #0d0d0e;
            --bg-tertiary: #111112;
            --border-primary: #1c1c1f;
            --text-primary: #ffffff;
            --text-secondary: #9ca3af;
            --text-muted: #6b7280;
            --accent-primary: #3b82f6;
            --accent-hover: #2563eb;
            --success: #10b981;
            --gold: #d4af37;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding: 20px;
            max-width: 500px;
            margin: 0 auto;
        }
        
        .avaliacao-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 24px;
            margin: 20px 0;
        }
        
        .avaliacao-header {
            text-align: center;
            margin-bottom: 24px;
        }
        
        .avaliacao-header h2 {
            font-size: 1.3rem;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--text-primary);
        }
        
        .avaliacao-header p {
            color: var(--text-muted);
            font-size: 0.875rem;
        }
        
        .produto-info {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            text-align: center;
        }
        
        .produto-info h3 {
            color: var(--accent-primary);
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 4px;
        }
        
        .produto-info p {
            color: var(--text-muted);
            font-size: 0.8rem;
        }
        
        .estrelas-container {
            display: flex;
            justify-content: center;
            gap: 12px;
            margin-bottom: 24px;
        }
        
        .estrela-btn {
            background: none;
            border: none;
            font-size: 2.5rem;
            color: var(--text-muted);
            cursor: pointer;
            transition: all 0.2s ease;
            padding: 8px;
        }
        
        .estrela-btn:hover {
            transform: scale(1.1);
        }
        
        .estrela-btn.ativa {
            color: var(--gold);
        }
        
        .comentario-section {
            margin-bottom: 24px;
        }
        
        .comentario-section label {
            display: block;
            color: var(--text-secondary);
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 8px;
        }
        
        .comentario-textarea {
            width: 100%;
            min-height: 100px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            color: var(--text-primary);
            font-family: 'Inter', sans-serif;
            font-size: 0.875rem;
            padding: 12px;
            resize: vertical;
            transition: border-color 0.15s ease;
        }
        
        .comentario-textarea:focus {
            outline: none;
            border-color: var(--accent-primary);
        }
        
        .botoes-container {
            display: flex;
            gap: 12px;
            justify-content: center;
        }
        
        .btn-avaliar {
            background: var(--accent-primary);
            border: 1px solid var(--accent-primary);
            border-radius: 8px;
            color: white;
            font-family: 'Inter', sans-serif;
            font-size: 0.875rem;
            font-weight: 500;
            padding: 12px 24px;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .btn-avaliar:hover {
            background: var(--accent-hover);
        }
        
        .btn-avaliar:disabled {
            background: var(--text-muted);
            border-color: var(--text-muted);
            cursor: not-allowed;
        }
        
        .btn-depois {
            background: transparent;
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            color: var(--text-muted);
            font-family: 'Inter', sans-serif;
            font-size: 0.875rem;
            font-weight: 500;
            padding: 12px 24px;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        
        .btn-depois:hover {
            color: var(--text-primary);
            border-color: var(--text-secondary);
        }
        
        .sucesso-mensagem {
            text-align: center;
            padding: 24px;
        }
        
        .sucesso-mensagem i {
            font-size: 3rem;
            color: var(--success);
            margin-bottom: 16px;
        }
        
        .sucesso-mensagem h3 {
            color: var(--text-primary);
            margin-bottom: 8px;
        }
        
        .sucesso-mensagem p {
            color: var(--text-muted);
            font-size: 0.875rem;
        }
    </style>
</head>
<body>
    <div class="avaliacao-container" id="avaliacao-form">
        <div class="avaliacao-header">
            <h2>⭐ Como foi sua experiência?</h2>
            <p>Sua opinião é muito importante para nós!</p>
        </div>
        
        <div class="produto-info">
            <h3>${produtoId.replace('_', ' ').toUpperCase()}</h3>
            <p>Produto NEW</p>
        </div>
        
        <div class="estrelas-container">
            ${[1,2,3,4,5].map(star => `
                <button type="button" class="estrela-btn" data-valor="${star}" onclick="selecionarEstrela(${star})">
                    <i class="fas fa-star"></i>
                </button>
            `).join('')}
        </div>
        
        <div class="comentario-section">
            <label for="comentario">Comentário (opcional)</label>
            <textarea 
                id="comentario" 
                class="comentario-textarea" 
                placeholder="Conte como foi sua experiência com o produto..."
            ></textarea>
        </div>
        
        <div class="botoes-container">
            <button type="button" class="btn-avaliar" onclick="enviarAvaliacao()" id="btn-enviar">
                <i class="fas fa-paper-plane"></i> Enviar Avaliação
            </button>
            <button type="button" class="btn-depois" onclick="fecharAvaliacao()">
                Agora não
            </button>
        </div>
    </div>
    
    <script>
        let avaliacaoSelecionada = 0;
        
        function selecionarEstrela(valor) {
            avaliacaoSelecionada = valor;
            atualizarEstrelas();
        }
        
        function atualizarEstrelas() {
            const estrelas = document.querySelectorAll('.estrela-btn');
            estrelas.forEach((estrela, index) => {
                if (index < avaliacaoSelecionada) {
                    estrela.classList.add('ativa');
                } else {
                    estrela.classList.remove('ativa');
                }
            });
        }
        
        async function enviarAvaliacao() {
            if (avaliacaoSelecionada === 0) {
                alert('Por favor, selecione uma nota de 1 a 5 estrelas');
                return;
            }
            
            const comentario = document.getElementById('comentario').value;
            const btnEnviar = document.getElementById('btn-enviar');
            
            btnEnviar.disabled = true;
            btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            
            try {
                const response = await fetch('/api/avaliacoes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        usuario_id: ${usuarioId},
                        produto_id: '${produtoId}',
                        pedido_id: ${pedidoId || 'null'},
                        nota: avaliacaoSelecionada,
                        comentario: comentario
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('avaliacao-form').innerHTML = \`
                        <div class="sucesso-mensagem">
                            <i class="fas fa-check-circle"></i>
                            <h3>Obrigado pela sua avaliação! 🎉</h3>
                            <p>Seu feedback nos ajuda a melhorar cada vez mais.</p>
                        </div>
                    \`;
                } else {
                    throw new Error(data.error || 'Erro ao enviar avaliação');
                }
            } catch (error) {
                alert('Erro ao enviar avaliação: ' + error.message);
                btnEnviar.disabled = false;
                btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Avaliação';
            }
        }
        
        function fecharAvaliacao() {
            document.body.innerHTML = \`
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <p>Sem problemas! Você pode avaliar depois no painel.</p>
                </div>
            \`;
        }
        
        // Efeito hover nas estrelas
        document.querySelectorAll('.estrela-btn').forEach((estrela, index) => {
            estrela.addEventListener('mouseenter', function() {
                document.querySelectorAll('.estrela-btn').forEach((e, i) => {
                    if (i <= index) {
                        e.style.color = 'var(--gold)';
                    } else {
                        e.style.color = 'var(--text-muted)';
                    }
                });
            });
        });
        
        document.querySelector('.estrelas-container').addEventListener('mouseleave', function() {
            atualizarEstrelas();
        });
    </script>
</body>
</html>
    `;
}

// ========== FUNÇÃO PARA ENVIAR WEBHOOK PARA DISCORD ==========
async function enviarWebhookAvaliacao(avaliacaoData) {
    try {
        const webhookUrl = process.env.DISCORD_AVALIACOES_WEBHOOK;
        if (!webhookUrl) {
            console.log('⚠️ Webhook de avaliações não configurado');
            return;
        }
        
        // Mapear tipo de avaliação para emoji e cor
        const tipoConfig = {
            'ruim': { emoji: '🔴', cor: 0xffffff, nome: 'Ruim :(' },
            'mediano': { emoji: '⚪', cor: 0xffffff, nome: 'Mediano' },
            'muito_bom': { emoji: '🔵', cor: 0xffffff, nome: 'Muito Bom!' }
        };
        
        const config = tipoConfig[avaliacaoData.tipo_avaliacao];
        
        const fields = [
            {
                name: '👤 Cliente',
                value: `**${avaliacaoData.usuario_nome}** (ID: ${avaliacaoData.usuario_id})`,
                inline: true
            },
            {
                name: '📦 Produto',
                value: `**${avaliacaoData.produto_id.replace('_', ' ').toUpperCase()}**`,
                inline: true
            },
            {
                name: '🎯 Avaliação',
                value: `${config.emoji} **${config.nome}**`,
                inline: true
            },
            {
                name: '🆔 Pedido',
                value: `#${avaliacaoData.pedido_id || 'N/A'}`,
                inline: true
            }
        ];
        
        if (avaliacaoData.comentario && avaliacaoData.comentario.trim()) {
            fields.push({
                name: '💬 Comentário',
                value: avaliacaoData.comentario,
                inline: false
            });
        }
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(buildWebhookPayload({
                container: buildContainer({
                    title: `${config.emoji} Nova Avaliação Recebida`,
                    color: config.cor,
                    fields,
                    footer: { text: 'NEW BYPASS - Sistema de Avaliações' },
                    timestamp: avaliacaoData.data_avaliacao
                }),
                username: 'NEW Avaliações',
                avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
            }))
        });
        
        if (response.ok) {
            console.log(`✅ Webhook de avaliação enviado para ${avaliacaoData.usuario_nome}`);
        } else {
            console.error('❌ Erro ao enviar webhook:', await response.text());
        }
        
    } catch (error) {
        console.error('❌ Erro ao enviar webhook de avaliação:', error);
    }
}

// ========== FUNÇÃO PARA GERAR LINK DE AVALIAÇÃO ==========
function gerarLinkAvaliacao(usuarioId, produtoId, pedidoId = null) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/avaliar/${usuarioId}/${produtoId}${pedidoId ? `/${pedidoId}` : ''}`;
}

// ========== FUNÇÃO PARA GERAR MENSAGEM COMPLETA PARA PRIVADO ==========
function gerarMensagemPrivadoAvaliacao(usuarioId, produtoId, pedidoId, keyEntregue) {
    const avaliacaoLink = gerarLinkAvaliacao(usuarioId, produtoId, pedidoId);
    const produtoNome = produtoId.replace('_', ' ').toUpperCase();
    
    return `
🎉 **PRODUTO ENTREGUE!** 🎉

Olá! Seu produto **${produtoNome}** foi aprovado e sua key é:

\`\`\`${keyEntregue}\`\`\`

---
⭐ **AVALIE NOSSO SERVIÇO** ⭐

Sua opinião é muito importante para nós! Por favor, avalie sua experiência:

🔗 **Link para Avaliação:** ${avaliacaoLink}

Ou clique aqui: [Avaliar Agora](${avaliacaoLink})

A avaliação leva apenas 30 segundos e nos ajuda a melhorar cada vez mais!

---
Obrigado por confiar na NEW! 💙
    `.trim();
}

// ========== SEÇÃO DE ÚLTIMOS FEEDBACKS PARA SITE PRINCIPAL ==========
function gerarUltimosFeedbacks() {
    return `
    <section id="feedbacks-section" class="feedbacks-section" style="
        background: var(--bg-primary);
        padding: 80px 20px;
        border-top: 1px solid var(--border-primary);
    ">
        <div class="container" style="max-width: 1200px; margin: 0 auto;">
            <div class="section-header" style="text-align: center; margin-bottom: 60px;">
                <h2 style="
                    color: var(--text-primary);
                    font-size: 2.5rem;
                    font-weight: 700;
                    margin-bottom: 16px;
                    font-family: 'Inter', sans-serif;
                ">
                    ⭐ Últimos Feedbacks
                </h2>
                <p style="
                    color: var(--text-muted);
                    font-size: 1.1rem;
                    max-width: 600px;
                    margin: 0 auto;
                    font-family: 'Inter', sans-serif;
                ">
                    Veja o que nossos clientes dizem sobre nossos serviços
                </p>
            </div>
            
            <div id="feedbacks-container" class="feedbacks-grid" style="
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                gap: 24px;
                margin-bottom: 40px;
            ">
                <!-- Feedbacks serão carregados via JavaScript -->
            </div>
            
            <div class="feedbacks-loading" id="feedbacks-loading" style="
                text-align: center;
                padding: 60px 20px;
                color: var(--text-muted);
            ">
                <div style="
                    display: inline-block;
                    width: 40px;
                    height: 40px;
                    border: 3px solid var(--border-primary);
                    border-top: 3px solid var(--accent-primary);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;
                "></div>
                <p style="font-size: 1rem; margin: 0;">Carregando feedbacks...</p>
            </div>
            
            <div class="feedbacks-empty" id="feedbacks-empty" style="
                text-align: center;
                padding: 60px 20px;
                color: var(--text-muted);
                display: none;
            ">
                <div style="font-size: 3rem; margin-bottom: 20px; opacity: 0.5;">💬</div>
                <h3 style="color: var(--text-primary); margin-bottom: 12px;">Nenhum feedback ainda</h3>
                <p style="font-size: 0.9rem; margin: 0;">Seja o primeiro a compartilhar sua experiência!</p>
            </div>
        </div>
    </section>
    
    <style>
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .feedback-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 24px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        
        .feedback-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, var(--accent-primary), transparent);
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        
        .feedback-card:hover {
            transform: translateY(-4px);
            border-color: var(--accent-primary);
        }
        
        .feedback-card:hover::before {
            opacity: 1;
        }
        
        .feedback-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }
        
        .feedback-user {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .feedback-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: var(--bg-tertiary);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            color: var(--text-muted);
        }
        
        .feedback-user-info h4 {
            color: var(--text-primary);
            font-size: 0.95rem;
            font-weight: 600;
            margin: 0 0 4px 0;
        }
        
        .feedback-user-info p {
            color: var(--text-muted);
            font-size: 0.8rem;
            margin: 0;
        }
        
        .feedback-badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .feedback-badge.ruim {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        
        .feedback-badge.mediano {
            background: rgba(63, 63, 70, 0.2);
            color: #9ca3af;
            border: 1px solid rgba(63, 63, 70, 0.3);
        }
        
        .feedback-badge.muito_bom {
            background: rgba(59, 130, 246, 0.2);
            color: #3b82f6;
            border: 1px solid rgba(59, 130, 246, 0.3);
        }
        
        .feedback-content {
            margin-bottom: 16px;
        }
        
        .feedback-comment {
            color: var(--text-secondary);
            font-size: 0.9rem;
            line-height: 1.6;
            font-style: italic;
        }
        
        .feedback-product {
            display: inline-block;
            background: var(--bg-tertiary);
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 12px;
        }
        
        .feedback-date {
            color: var(--text-muted);
            font-size: 0.75rem;
            margin-top: 12px;
        }
    </style>
    
    <script>
        async function carregarFeedbacks() {
            try {
                const response = await fetch('/api/feedbacks/public');
                const data = await response.json();
                
                const container = document.getElementById('feedbacks-container');
                const loading = document.getElementById('feedbacks-loading');
                const empty = document.getElementById('feedbacks-empty');
                
                loading.style.display = 'none';
                
                if (data.success && data.feedbacks.length > 0) {
                    container.innerHTML = data.feedbacks.map(feedback => {
                        // Ocultar parte do nome do usuário
                        const nomeOculto = feedback.usuario_nome ? 
                            feedback.usuario_nome.substring(0, 2) + '***' + 
                            feedback.usuario_nome.substring(feedback.usuario_nome.length - 2) : 
                            'Usuário Anônimo';
                        
                        // Configuração do badge
                        const badgeConfig = {
                            'ruim': { emoji: '🔴', texto: 'Ruim :(', classe: 'ruim' },
                            'mediano': { emoji: '⚪', texto: 'Mediano', classe: 'mediano' },
                            'muito_bom': { emoji: '🔵', texto: 'Muito Bom!', classe: 'muito_bom' }
                        };
                        
                        const config = badgeConfig[feedback.tipo_avaliacao] || badgeConfig.mediano;
                        
                        return \`
                            <div class="feedback-card">
                                <div class="feedback-header">
                                    <div class="feedback-user">
                                        <div class="feedback-avatar">\${config.emoji}</div>
                                        <div class="feedback-user-info">
                                            <h4>\${nomeOculto}</h4>
                                            <p>Cliente NEW</p>
                                        </div>
                                    </div>
                                    <div class="feedback-badge \${config.classe}">
                                        <span>\${config.emoji}</span>
                                        <span>\${config.texto}</span>
                                    </div>
                                </div>
                                
                                \${feedback.comentario ? \`
                                    <div class="feedback-content">
                                        <p class="feedback-comment">"\${feedback.comentario}"</p>
                                    </div>
                                \` : ''}
                                
                                <div class="feedback-product">
                                    📦 \${feedback.produto_id.replace('_', ' ').toUpperCase()}
                                </div>
                                
                                <div class="feedback-date">
                                    \${new Date(feedback.data_avaliacao).toLocaleDateString('pt-BR', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric'
                                    })}
                                </div>
                            </div>
                        \`;
                    }).join('');
                } else {
                    empty.style.display = 'block';
                }
                
            } catch (error) {
                console.error('Erro ao carregar feedbacks:', error);
                document.getElementById('feedbacks-loading').innerHTML = \`
                    <p style="color: var(--error);">Erro ao carregar feedbacks</p>
                \`;
            }
        }
        
        // Carregar feedbacks quando a página carregar
        if (document.getElementById('feedbacks-section')) {
            carregarFeedbacks();
        }
    </script>
    `;
}

// ========== COMPONENTE DE AVALIAÇÃO COM BOTÕES DE REAÇÃO ==========
function gerarComponenteAvaliacaoReacao(usuarioId, produtoId, pedidoId = null) {
    return `
    <div id="avaliacao-reacao-component" class="avaliacao-reacao-container" style="
        background: var(--bg-secondary);
        border: 1px solid var(--border-primary);
        border-radius: 12px;
        padding: 24px;
        margin: 20px 0;
        max-width: 600px;
    ">
        <div class="avaliacao-header" style="text-align: center; margin-bottom: 24px;">
            <h3 style="color: var(--text-primary); font-size: 1.2rem; font-weight: 600; margin-bottom: 8px;">
                ⭐ Como foi sua experiência?
            </h3>
            <p style="color: var(--text-muted); font-size: 0.875rem;">
                Sua opinião nos ajuda a melhorar nossos serviços
            </p>
        </div>
        
        <div class="produto-info" style="
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            text-align: center;
        ">
            <h4 style="color: var(--accent-primary); font-size: 0.9rem; font-weight: 600; margin-bottom: 4px;">
                ${produtoId.replace('_', ' ').toUpperCase()}
            </h4>
            <p style="color: var(--text-muted); font-size: 0.8rem;">Produto NEW</p>
        </div>
        
        <div class="botoes-reacao" style="
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 24px;
        ">
            <button 
                type="button"
                class="btn-reacao btn-ruim"
                onclick="selecionarReacao('ruim')"
                data-tipo="ruim"
                style="
                    background: #ef4444;
                    border: 1px solid #ef4444;
                    border-radius: 8px;
                    color: white;
                    font-family: 'Inter', sans-serif;
                    font-size: 0.9rem;
                    font-weight: 600;
                    padding: 16px 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    min-height: 80px;
                    justify-content: center;
                "
            >
                <span style="font-size: 1.5rem;">🔴</span>
                <span>Ruim :(</span>
            </button>
            
            <button 
                type="button"
                class="btn-reacao btn-mediano"
                onclick="selecionarReacao('mediano')"
                data-tipo="mediano"
                style="
                    background: #3f3f46;
                    border: 1px solid #3f3f46;
                    border-radius: 8px;
                    color: white;
                    font-family: 'Inter', sans-serif;
                    font-size: 0.9rem;
                    font-weight: 600;
                    padding: 16px 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    min-height: 80px;
                    justify-content: center;
                "
            >
                <span style="font-size: 1.5rem;">⚪</span>
                <span>Mediano</span>
            </button>
            
            <button 
                type="button"
                class="btn-reacao btn-muito-bom"
                onclick="selecionarReacao('muito_bom')"
                data-tipo="muito_bom"
                style="
                    background: #3b82f6;
                    border: 1px solid #3b82f6;
                    border-radius: 8px;
                    color: white;
                    font-family: 'Inter', sans-serif;
                    font-size: 0.9rem;
                    font-weight: 600;
                    padding: 16px 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    min-height: 80px;
                    justify-content: center;
                "
            >
                <span style="font-size: 1.5rem;">🔵</span>
                <span>Muito Bom!</span>
            </button>
        </div>
        
        <div class="comentario-section" style="margin-bottom: 24px;">
            <label for="comentario-reacao" style="
                display: block;
                color: var(--text-secondary);
                font-size: 0.875rem;
                font-weight: 500;
                margin-bottom: 8px;
            ">
                Deixe um comentário sobre o serviço (opcional)
            </label>
            <textarea 
                id="comentario-reacao" 
                class="comentario-textarea"
                placeholder="Conte como foi sua experiência com o produto..."
                style="
                    width: 100%;
                    min-height: 100px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-primary);
                    border-radius: 8px;
                    color: var(--text-primary);
                    font-family: 'Inter', sans-serif;
                    font-size: 0.875rem;
                    padding: 12px;
                    resize: vertical;
                    transition: border-color 0.15s ease;
                "
            ></textarea>
        </div>
        
        <div class="botoes-container" style="display: flex; gap: 12px; justify-content: center;">
            <button 
                type="button"
                class="btn-enviar-reacao"
                onclick="enviarAvaliacaoReacao()"
                id="btn-enviar-reacao"
                disabled
                style="
                    background: var(--text-muted);
                    border: 1px solid var(--text-muted);
                    border-radius: 8px;
                    color: white;
                    font-family: 'Inter', sans-serif;
                    font-size: 0.875rem;
                    font-weight: 500;
                    padding: 12px 24px;
                    cursor: not-allowed;
                    transition: all 0.15s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                "
            >
                <i class="fas fa-paper-plane"></i> Enviar Avaliação
            </button>
            <button 
                type="button"
                class="btn-depois"
                onclick="fecharAvaliacaoReacao()"
                style="
                    background: transparent;
                    border: 1px solid var(--border-primary);
                    border-radius: 8px;
                    color: var(--text-muted);
                    font-family: 'Inter', sans-serif;
                    font-size: 0.875rem;
                    font-weight: 500;
                    padding: 12px 24px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                "
            >
                Agora não
            </button>
        </div>
    </div>
    
    <script>
        let reacaoSelecionada = null;
        
        function selecionarReacao(tipo) {
            reacaoSelecionada = tipo;
            
            // Atualizar estado dos botões
            document.querySelectorAll('.btn-reacao').forEach(btn => {
                if (btn.dataset.tipo === tipo) {
                    btn.style.transform = 'scale(0.95)';
                    btn.style.boxShadow = '0 0 20px rgba(255,255,255,0.3)';
                } else {
                    btn.style.transform = 'scale(1)';
                    btn.style.boxShadow = 'none';
                }
            });
            
            // Habilitar botão de envio
            const btnEnviar = document.getElementById('btn-enviar-reacao');
            btnEnviar.disabled = false;
            btnEnviar.style.cursor = 'pointer';
            
            // Definir cor baseada na seleção
            const cores = {
                'ruim': '#ef4444',
                'mediano': '#3f3f46',
                'muito_bom': '#3b82f6'
            };
            
            btnEnviar.style.background = cores[tipo];
            btnEnviar.style.borderColor = cores[tipo];
        }
        
        async function enviarAvaliacaoReacao() {
            if (!reacaoSelecionada) {
                alert('Por favor, selecione uma opção de avaliação');
                return;
            }
            
            const comentario = document.getElementById('comentario-reacao').value;
            const btnEnviar = document.getElementById('btn-enviar-reacao');
            
            btnEnviar.disabled = true;
            btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            
            try {
                const response = await fetch('/api/avaliacoes/reacao', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        usuario_id: ${usuarioId},
                        produto_id: '${produtoId}',
                        pedido_id: ${pedidoId || 'null'},
                        tipo_avaliacao: reacaoSelecionada,
                        comentario: comentario
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('avaliacao-reacao-component').innerHTML = \`
                        <div style="text-align: center; padding: 40px;">
                            <div style="font-size: 4rem; margin-bottom: 16px;">
                                \${reacaoSelecionada === 'ruim' ? '🔴' : reacaoSelecionada === 'mediano' ? '⚪' : '🔵'}
                            </div>
                            <h3 style="color: var(--text-primary); margin-bottom: 8px;">Obrigado pela sua avaliação!</h3>
                            <p style="color: var(--text-muted); font-size: 0.875rem;">Seu feedback é muito importante para nós.</p>
                        </div>
                    \`;
                } else {
                    throw new Error(data.error || 'Erro ao enviar avaliação');
                }
            } catch (error) {
                alert('Erro ao enviar avaliação: ' + error.message);
                btnEnviar.disabled = false;
                btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Avaliação';
            }
        }
        
        function fecharAvaliacaoReacao() {
            document.getElementById('avaliacao-reacao-component').style.display = 'none';
        }
        
        // Efeitos hover nos botões
        document.querySelectorAll('.btn-reacao').forEach(btn => {
            btn.addEventListener('mouseenter', function() {
                if (this.dataset.tipo !== reacaoSelecionada) {
                    this.style.transform = 'scale(1.05)';
                    this.style.opacity = '0.8';
                }
            });
            
            btn.addEventListener('mouseleave', function() {
                if (this.dataset.tipo !== reacaoSelecionada) {
                    this.style.transform = 'scale(1)';
                    this.style.opacity = '1';
                }
            });
        });
    </script>
    `;
}

// ========== COMPONENTE DE AVALIAÇÃO PARA CLIENTES ==========
function gerarComponenteAvaliacao(usuarioId, produtoId, pedidoId = null) {
    return `
    <div id="avaliacao-component" class="avaliacao-container" style="
        background: var(--bg-secondary);
        border: 1px solid var(--border-primary);
        border-radius: 12px;
        padding: 24px;
        margin: 20px 0;
        max-width: 500px;
    ">
        <div class="avaliacao-header" style="text-align: center; margin-bottom: 20px;">
            <h3 style="color: var(--text-primary); font-size: 1.1rem; font-weight: 600; margin-bottom: 8px;">
                Como foi sua experiência?
            </h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0;">
                Sua avaliação nos ajuda a melhorar nossos serviços
            </p>
        </div>
        
        <div class="avaliacao-estrelas" style="display: flex; justify-content: center; gap: 8px; margin-bottom: 20px;">
            ${[1,2,3,4,5].map(star => `
                <button type="button" 
                        class="estrela-avaliacao" 
                        data-valor="${star}"
                        style="
                            background: none;
                            border: none;
                            font-size: 2rem;
                            color: var(--text-muted);
                            cursor: pointer;
                            transition: all 0.2s ease;
                            padding: 4px;
                        ">
                    <i class="fas fa-star"></i>
                </button>
            `).join('')}
        </div>
        
        <div class="avaliacao-comentario" style="margin-bottom: 20px;">
            <textarea 
                id="avaliacao-comentario" 
                placeholder="Comentário (opcional)"
                style="
                    width: 100%;
                    min-height: 80px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-primary);
                    border-radius: 6px;
                    color: var(--text-primary);
                    font-family: 'Inter', sans-serif;
                    font-size: 0.875rem;
                    padding: 12px;
                    resize: vertical;
                "
            ></textarea>
        </div>
        
        <div class="avaliacao-acoes" style="display: flex; gap: 12px; justify-content: center;">
            <button 
                type="button" 
                onclick="enviarAvaliacao(${usuarioId}, '${produtoId}', ${pedidoId || 'null'})"
                id="btn-enviar-avaliacao"
                style="
                    background: var(--accent-primary);
                    border: 1px solid var(--accent-primary);
                    border-radius: 6px;
                    color: white;
                    font-family: 'Inter', sans-serif;
                    font-size: 0.875rem;
                    font-weight: 500;
                    padding: 10px 20px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                "
            >
                <i class="fas fa-paper-plane"></i> Enviar Avaliação
            </button>
            <button 
                type="button" 
                onclick="fecharAvaliacao()"
                style="
                    background: transparent;
                    border: 1px solid var(--border-primary);
                    border-radius: 6px;
                    color: var(--text-muted);
                    font-family: 'Inter', sans-serif;
                    font-size: 0.875rem;
                    font-weight: 500;
                    padding: 10px 20px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                "
            >
                Agora não
            </button>
        </div>
    </div>
    
    <script>
        let avaliacaoSelecionada = 0;
        
        // Inicializar estrelas
        document.addEventListener('DOMContentLoaded', function() {
            const estrelas = document.querySelectorAll('.estrela-avaliacao');
            
            estrelas.forEach(estrela => {
                estrela.addEventListener('click', function() {
                    avaliacaoSelecionada = parseInt(this.dataset.valor);
                    atualizarEstrelas();
                });
                
                estrela.addEventListener('mouseenter', function() {
                    const hoverValor = parseInt(this.dataset.valor);
                    estrelas.forEach((e, index) => {
                        if (index < hoverValor) {
                            e.style.color = '#d4af37'; // Dourado Matte
                        } else {
                            e.style.color = 'var(--text-muted)';
                        }
                    });
                });
            });
            
            document.querySelector('.avaliacao-estrelas').addEventListener('mouseleave', function() {
                atualizarEstrelas();
            });
        });
        
        function atualizarEstrelas() {
            const estrelas = document.querySelectorAll('.estrela-avaliacao');
            estrelas.forEach((estrela, index) => {
                if (index < avaliacaoSelecionada) {
                    estrela.style.color = '#d4af37'; // Dourado Matte
                } else {
                    estrela.style.color = 'var(--text-muted)';
                }
            });
        }
        
        async function enviarAvaliacao(usuarioId, produtoId, pedidoId) {
            if (avaliacaoSelecionada === 0) {
                alert('Por favor, selecione uma nota de 1 a 5 estrelas');
                return;
            }
            
            const comentario = document.getElementById('avaliacao-comentario').value;
            const btnEnviar = document.getElementById('btn-enviar-avaliacao');
            
            btnEnviar.disabled = true;
            btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            
            try {
                const response = await fetch('/api/avaliacoes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        usuario_id: usuarioId,
                        produto_id: produtoId,
                        pedido_id: pedidoId,
                        nota: avaliacaoSelecionada,
                        comentario: comentario
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('avaliacao-component').innerHTML = \`
                        <div style="text-align: center; padding: 20px;">
                            <i class="fas fa-check-circle" style="color: var(--success); font-size: 3rem; margin-bottom: 12px;"></i>
                            <h4 style="color: var(--text-primary); margin-bottom: 8px;">Obrigado pela sua avaliação!</h4>
                            <p style="color: var(--text-muted); font-size: 0.875rem;">Seu feedback é muito importante para nós.</p>
                        </div>
                    \`;
                } else {
                    throw new Error(data.error || 'Erro ao enviar avaliação');
                }
            } catch (error) {
                alert('Erro ao enviar avaliação: ' + error.message);
                btnEnviar.disabled = false;
                btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Avaliação';
            }
        }
        
        function fecharAvaliacao() {
            document.getElementById('avaliacao-component').style.display = 'none';
        }
    </script>
    `;
}

// ========== BANNER DE AVALIAÇÕES PENDENTES ==========
function gerarBannerAvaliacoesPendentes(usuarioId) {
    return `
    <div id="banner-avaliacoes" style="
        background: var(--bg-secondary);
        border: 1px solid var(--border-primary);
        border-radius: 8px;
        padding: 16px 20px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        animation: slideDown 0.3s ease-out;
    ">
        <div style="display: flex; align-items: center; gap: 16px;">
            <div style="
                background: var(--accent-primary);
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <i class="fas fa-star" style="color: white; font-size: 1rem;"></i>
            </div>
            <div>
                <h4 style="color: var(--text-primary); font-size: 0.95rem; font-weight: 600; margin: 0 0 4px 0;">
                    Como foi sua experiência?
                </h4>
                <p style="color: var(--text-muted); font-size: 0.8rem; margin: 0;">
                    Avalie nossos produtos e nos ajude a melhorar
                </p>
            </div>
        </div>
        <div style="display: flex; gap: 12px;">
            <button 
                onclick="mostrarAvaliacoesPendentes(${usuarioId})"
                style="
                    background: var(--accent-primary);
                    border: 1px solid var(--accent-primary);
                    border-radius: 6px;
                    color: white;
                    font-family: 'Inter', sans-serif;
                    font-size: 0.8rem;
                    font-weight: 500;
                    padding: 8px 16px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                "
            >
                Avaliar Agora
            </button>
            <button 
                onclick="fecharBannerAvaliacoes()"
                style="
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 8px;
                "
            >
                <i class="fas fa-times"></i>
            </button>
        </div>
    </div>
    
    <script>
        function mostrarAvaliacoesPendentes(usuarioId) {
            // Carregar avaliações pendentes e mostrar modal
            fetch(\`/api/avaliacoes/pendentes/\${usuarioId}\`)
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.pendentes.length > 0) {
                        // Mostrar modal com avaliações pendentes
                        let modalHTML = \`
                            <div id="modal-avaliacoes" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center;">
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
                                    <h3 style="color: var(--text-primary); margin-bottom: 20px;">Avaliações Pendentes</h3>
                        \`;
                        
                        data.pendentes.forEach(pendente => {
                            modalHTML += \`
                                <div style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 8px;">
                                    <h4 style="color: var(--text-primary); font-size: 0.9rem; margin-bottom: 8px;">\${pendente.produto_id.replace('_', ' ').toUpperCase()}</h4>
                                    <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 12px;">Compra: \${new Date(pendente.data_aprovacao).toLocaleDateString('pt-BR')}</p>
                                    <button onclick="abrirModalAvaliacao(\${usuarioId}, '\${pendente.produto_id}', \${pendente.id})" style="background: var(--accent-primary); border: none; border-radius: 6px; color: white; padding: 8px 16px; cursor: pointer; font-size: 0.8rem;">
                                        Avaliar
                                    </button>
                                </div>
                            \`;
                        });
                        
                        modalHTML += \`
                                        <button onclick="fecharModalAvaliacoes()" style="background: transparent; border: 1px solid var(--border-primary); border-radius: 6px; color: var(--text-muted); padding: 8px 16px; cursor: pointer; margin-top: 12px;">
                                            Fechar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        \`;
                        
                        document.body.insertAdjacentHTML('beforeend', modalHTML);
                    }
                })
                .catch(error => console.error('Erro ao carregar avaliações pendentes:', error));
        }
        
        function fecharModalAvaliacoes() {
            const modal = document.getElementById('modal-avaliacoes');
            if (modal) modal.remove();
        }
        
        function abrirModalAvaliacao(usuarioId, produtoId, pedidoId) {
            fecharModalAvaliacoes();
            
            // Abrir modal de avaliação
            const avaliacaoHTML = \`
                <div id="modal-avaliacao" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center;">
                    <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 24px; max-width: 500px; width: 90%;">
                        \${gerarComponenteAvaliacaoHTML(usuarioId, produtoId, pedidoId)}
                    </div>
                </div>
            \`;
            
            document.body.insertAdjacentHTML('beforeend', avaliacaoHTML);
        }
        
        function fecharBannerAvaliacoes() {
            document.getElementById('banner-avaliacoes').style.display = 'none';
            // Salvar preferência no localStorage
            localStorage.setItem('banner-avaliacoes-fechado', 'true');
        }
        
        // Verificar se o banner foi fechado anteriormente
        if (localStorage.getItem('banner-avaliacoes-fechado') === 'true') {
            document.getElementById('banner-avaliacoes').style.display = 'none';
        }
    </script>
    
    <style>
        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    </style>
    `;
}

// ========== FUNÇÃO PRINCIPAL PARA INICIAR O PAINEL ==========
function iniciarPainelAdmin(db, logFn, app) {
    dbMySQL = db;
    registrarLog = logFn;
    mainApp = app;
    
    // Criar tabela de avaliações se não existir
    async function criarTabelaAvaliacoes() {
        try {
            await dbMySQL.query(`
                CREATE TABLE IF NOT EXISTS avaliacoes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    usuario_id INT NOT NULL,
                    produto_id VARCHAR(50) NOT NULL,
                    pedido_id INT,
                    tipo_avaliacao ENUM('ruim', 'mediano', 'muito_bom') NOT NULL,
                    nota INT DEFAULT NULL, -- Mantido para compatibilidade
                    comentario TEXT,
                    data_avaliacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ip VARCHAR(45),
                    user_agent TEXT,
                    webhook_enviado BOOLEAN DEFAULT FALSE,
                    INDEX idx_usuario_produto (usuario_id, produto_id),
                    INDEX idx_pedido (pedido_id),
                    INDEX idx_data (data_avaliacao),
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            console.log('✅ Tabela avaliacoes verificada/criada com sucesso');
        } catch (error) {
            console.error('❌ Erro ao criar tabela avaliacoes:', error);
        }
    }
    
    // Inicializar tabela
    criarTabelaAvaliacoes();
    
    // Middleware Express
    mainApp.use(express.urlencoded({ extended: true }));
    mainApp.use(express.json());
    
    // Configuração de Sessão
    mainApp.use(session({
        secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false,
            httpOnly: true,
            maxAge: 3600000 // 1 hora
        }
    }));
    
    // Corrigir senhas inválidas dos admins
    corrigirSenhasAdmins(dbMySQL);
    
    // ==================== ROTAS DE AUTENTICAÇÃO ====================
    
    // Página de Login (GET)
    mainApp.get('/admin/login', (req, res) => {
        if (req.session && req.session.adminLogado) {
            return res.redirect('/admin/dashboard');
        }
        res.send(renderLoginPage());
    });
    
    // Processar Login (POST)
    mainApp.post('/admin/login', async (req, res) => {
        try {
            const { usuario, senha } = req.body;
            
            if (!usuario || !senha) {
                return res.send(renderLoginPage('Usuário e senha são obrigatórios'));
            }
            
            const [admins] = await dbMySQL.query(
                "SELECT * FROM admins WHERE usuario = ? LIMIT 1",
                [usuario]
            );
            
            if (admins.length === 0) {
                registrarLog('ADMIN_LOGIN_FALHOU', { usuario, ip: req.ip, motivo: 'usuario_nao_encontrado' });
                return res.send(renderLoginPage('Usuário ou senha inválidos'));
            }
            
            const admin = admins[0];
            const senhaValida = await bcrypt.compare(senha, admin.senha_hash);
            
            if (!senhaValida) {
                registrarLog('ADMIN_LOGIN_FALHOU', { usuario, ip: req.ip, motivo: 'senha_invalida' });
                return res.send(renderLoginPage('Usuário ou senha inválidos'));
            }
            
            // Login bem-sucedido
            req.session.adminLogado = true;
            req.session.adminId = admin.id;
            req.session.adminUsuario = admin.usuario;
            
            await dbMySQL.query(
                "UPDATE admins SET ultimo_login = NOW() WHERE id = ?",
                [admin.id]
            );
            
            registrarLog('ADMIN_LOGIN_SUCESSO', { usuario, ip: req.ip });
            res.redirect('/admin/dashboard');
            
        } catch (error) {
            console.error('❌ Erro no login:', error);
            res.send(renderLoginPage('Ocorreu um erro interno'));
        }
    });
    
    // Logout
    mainApp.get('/admin/logout', (req, res) => {
        if (req.session) {
            req.session.destroy();
        }
        res.redirect('/admin/login');
    });
    
    // Redirecionar /admin para dashboard
    mainApp.get('/admin', verificarAdmin, (req, res) => {
        res.redirect('/admin/dashboard');
    });
    
    // ==================== ROTA DE AVALIAÇÃO VIA URL ==========
    mainApp.get('/avaliar/:usuarioId/:produtoId/:pedidoId?', async (req, res) => {
        try {
            const { usuarioId, produtoId, pedidoId } = req.params;
            
            // Verificar se o usuário existe
            const [usuarios] = await dbMySQL.query(
                'SELECT id, username FROM usuarios WHERE id = ?',
                [usuarioId]
            );
            
            if (usuarios.length === 0) {
                return res.status(404).send('Usuário não encontrado');
            }
            
            // Verificar se já avaliou este produto
            const [avaliacaoExistente] = await dbMySQL.query(
                'SELECT id FROM avaliacoes WHERE usuario_id = ? AND produto_id = ?',
                [usuarioId, produtoId]
            );
            
            if (avaliacaoExistente.length > 0) {
                return res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Avaliação Já Realizada</title>
                        <style>
                            body { font-family: 'Inter', sans-serif; background: #050505; color: white; text-align: center; padding: 40px; }
                            .container { max-width: 400px; margin: 0 auto; }
                            .icon { font-size: 4rem; color: #10b981; margin-bottom: 20px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="icon">✓</div>
                            <h2>Você já avaliou este produto!</h2>
                            <p>Obrigado pelo seu feedback anterior.</p>
                        </div>
                    </body>
                    </html>
                `);
            }
            
            // Enviar página de avaliação
            res.send(gerarAvaliacaoParaPrivado(usuarioId, produtoId, pedidoId));
            
        } catch (error) {
            console.error('Erro ao carregar página de avaliação:', error);
            res.status(500).send('Erro ao carregar página');
        }
    });
    
    // ==================== API ENDPOINTS PARA AVALIAÇÕES ====================
    
    // POST: Criar avaliação com reação (para clientes)
    mainApp.post('/api/avaliacoes/reacao', async (req, res) => {
        try {
            const { usuario_id, produto_id, pedido_id, tipo_avaliacao, comentario } = req.body;
            
            // Validar tipo de avaliação
            if (!tipo_avaliacao || !['ruim', 'mediano', 'muito_bom'].includes(tipo_avaliacao)) {
                return res.status(400).json({ success: false, error: 'Tipo de avaliação inválido' });
            }
            
            // Verificar se usuário já avaliou este produto
            const [existente] = await dbMySQL.query(
                'SELECT id FROM avaliacoes WHERE usuario_id = ? AND produto_id = ?',
                [usuario_id, produto_id]
            );
            
            if (existente.length > 0) {
                return res.status(400).json({ success: false, error: 'Você já avaliou este produto' });
            }
            
            // Obter informações do usuário
            const [usuarios] = await dbMySQL.query(
                'SELECT username, email FROM usuarios WHERE id = ?',
                [usuario_id]
            );
            
            const usuario = usuarios[0];
            if (!usuario) {
                return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            }
            
            // Inserir avaliação
            const [result] = await dbMySQL.query(`
                INSERT INTO avaliacoes (usuario_id, produto_id, pedido_id, tipo_avaliacao, comentario, ip, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [usuario_id, produto_id, pedido_id, tipo_avaliacao, comentario, req.ip, req.get('User-Agent')]);
            
            // Enviar webhook para Discord
            await enviarWebhookAvaliacao({
                usuario_id,
                usuario_nome: usuario.username,
                produto_id,
                pedido_id,
                tipo_avaliacao,
                comentario,
                data_avaliacao: new Date().toISOString()
            });
            
            // Marcar webhook como enviado
            await dbMySQL.query(
                'UPDATE avaliacoes SET webhook_enviado = TRUE WHERE id = ?',
                [result.insertId]
            );
            
            res.json({ 
                success: true, 
                avaliacao_id: result.insertId,
                message: 'Avaliação registrada com sucesso!'
            });
            
        } catch (error) {
            console.error('Erro ao criar avaliação:', error);
            res.status(500).json({ success: false, error: 'Erro ao registrar avaliação' });
        }
    });
    
    // POST: Criar avaliação (para clientes) - LEGACY
    mainApp.post('/api/avaliacoes', async (req, res) => {
        try {
            const { usuario_id, produto_id, pedido_id, nota, comentario } = req.body;
            
            // Validar nota
            if (!nota || nota < 1 || nota > 5) {
                return res.status(400).json({ success: false, error: 'Nota deve ser entre 1 e 5' });
            }
            
            // Verificar se usuário já avaliou este produto
            const [existente] = await dbMySQL.query(
                'SELECT id FROM avaliacoes WHERE usuario_id = ? AND produto_id = ?',
                [usuario_id, produto_id]
            );
            
            if (existente.length > 0) {
                return res.status(400).json({ success: false, error: 'Você já avaliou este produto' });
            }
            
            // Inserir avaliação
            const [result] = await dbMySQL.query(`
                INSERT INTO avaliacoes (usuario_id, produto_id, pedido_id, nota, comentario)
                VALUES (?, ?, ?, ?, ?)
            `, [usuario_id, produto_id, pedido_id, nota, comentario]);
            
            res.json({ 
                success: true, 
                avaliacao_id: result.insertId,
                message: 'Avaliação registrada com sucesso!'
            });
        } catch (error) {
            console.error('Erro ao criar avaliação:', error);
            res.status(500).json({ success: false, error: 'Erro ao registrar avaliação' });
        }
    });
    
    // GET: Buscar feedbacks públicos para o site
    mainApp.get('/api/feedbacks/public', async (req, res) => {
        try {
            const [feedbacks] = await dbMySQL.query(`
                SELECT 
                    a.tipo_avaliacao,
                    a.comentario,
                    a.data_avaliacao,
                    a.produto_id,
                    u.username as usuario_nome
                FROM avaliacoes a
                LEFT JOIN usuarios u ON a.usuario_id = u.id
                WHERE a.tipo_avaliacao IS NOT NULL
                ORDER BY a.data_avaliacao DESC
                LIMIT 12
            `);
            
            res.json({
                success: true,
                feedbacks: feedbacks.map(f => ({
                    ...f,
                    usuario_nome: f.usuario_nome || 'Usuário Anônimo'
                }))
            });
        } catch (error) {
            console.error('Erro ao buscar feedbacks públicos:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar feedbacks' });
        }
    });
    
    // GET: Verificar se usuário tem avaliações pendentes (atualizado)
    mainApp.get('/api/avaliacoes/pendentes/:usuario_id', async (req, res) => {
        try {
            const usuario_id = req.params.usuario_id;
            
            // Buscar pedidos entregues sem avaliação
            const [pendentes] = await dbMySQL.query(`
                SELECT 
                    p.id,
                    p.painel_id as produto_id,
                    p.valor_total,
                    p.data_aprovacao
                FROM pedidos p
                LEFT JOIN avaliacoes a ON p.id = a.pedido_id AND a.usuario_id = ?
                WHERE p.usuario_id = ? 
                AND p.status = 'aprovado'
                AND a.id IS NULL
                ORDER BY p.data_aprovacao DESC
                LIMIT 5
            `, [usuario_id, usuario_id]);
            
            res.json({ 
                success: true, 
                pendentes,
                total: pendentes.length
            });
        } catch (error) {
            console.error('Erro ao buscar avaliações pendentes:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar avaliações pendentes' });
        }
    });
    
    // GET: Buscar avaliações para o admin
    mainApp.get('/admin/api/avaliacoes', verificarAdmin, async (req, res) => {
        try {
            const [avaliacoes] = await dbMySQL.query(`
                SELECT 
                    a.*,
                    u.username as usuario_username,
                    u.email as usuario_email,
                    p.painel_id,
                    p.status as pedido_status
                FROM avaliacoes a
                LEFT JOIN usuarios u ON a.usuario_id = u.id
                LEFT JOIN pedidos p ON a.pedido_id = p.id
                ORDER BY a.data_avaliacao DESC
                LIMIT 50
            `);
            
            // Calcular estatísticas
            const [stats] = await dbMySQL.query(`
                SELECT 
                    COUNT(*) as total_avaliacoes,
                    AVG(nota) as media_nota,
                    COUNT(CASE WHEN nota = 5 THEN 1 END) as cinco_estrelas,
                    COUNT(CASE WHEN nota = 4 THEN 1 END) as quatro_estrelas,
                    COUNT(CASE WHEN nota = 3 THEN 1 END) as tres_estrelas,
                    COUNT(CASE WHEN nota = 2 THEN 1 END) as duas_estrelas,
                    COUNT(CASE WHEN nota = 1 THEN 1 END) as uma_estrela
                FROM avaliacoes
            `);
            
            res.json({
                success: true,
                avaliacoes,
                estatisticas: stats[0]
            });
        } catch (error) {
            console.error('Erro ao buscar avaliações:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar avaliações' });
        }
    });

    // ==================== DASHBOARD ====================
    mainApp.get('/admin/dashboard', verificarAdmin, async (req, res) => {
        try {
            const [vendas] = await dbMySQL.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as hoje,
                    COUNT(CASE WHEN YEARWEEK(created_at) = YEARWEEK(NOW()) THEN 1 END) as semana,
                    COUNT(CASE WHEN MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW()) THEN 1 END) as mes
                FROM usuarios
            `);
            
            // Dados do gráfico (últimos 7 dias)
            const [chartRows] = await dbMySQL.query(`
                SELECT DAYOFWEEK(created_at) as dia, COUNT(*) as qnt 
                FROM usuarios 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) 
                GROUP BY DAYOFWEEK(created_at)
            `);
            
            const chartData = [0, 0, 0, 0, 0, 0, 0];
            chartRows.forEach(row => {
                const idx = row.dia - 1; // DAYOFWEEK retorna 1-7 (Dom-Sab)
                if (idx >= 0 && idx < 7) {
                    chartData[idx] = row.qnt;
                }
            });
            
            const stats = {
                total: vendas[0]?.total || 0,
                hoje: vendas[0]?.hoje || 0,
                semana: vendas[0]?.semana || 0,
                mes: vendas[0]?.mes || 0,
                chart: chartData
            };
            
            res.send(gerarHTMLDashboard(req.session.adminUsuario, 'dashboard', stats));
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
            res.send(gerarHTMLDashboard(req.session.adminUsuario, 'dashboard', { total: 0, hoje: 0, semana: 0, mes: 0, chart: [0,0,0,0,0,0,0] }));
        }
    });
    
    // ==================== ROTAS DE USUÁRIOS ====================
    
    // External Advanced
    mainApp.get('/admin/usuarios/external-advanced', verificarAdmin, async (req, res) => {
        try {
            const [usuarios] = await dbMySQL.query(`
                SELECT * FROM usuarios 
                WHERE tipo = 'external' AND plano = 'advanced'
                ORDER BY created_at DESC
            `);
            res.send(gerarHTMLUsuarios(req.session.adminUsuario, 'external-advanced', usuarios));
        } catch (error) {
            console.error('Erro:', error);
            res.send(gerarHTMLUsuarios(req.session.adminUsuario, 'external-advanced', []));
        }
    });
    
    // External Premium
    mainApp.get('/admin/usuarios/external-premium', verificarAdmin, async (req, res) => {
        try {
            const [usuarios] = await dbMySQL.query(`
                SELECT * FROM usuarios 
                WHERE tipo = 'external' AND plano = 'premium'
                ORDER BY created_at DESC
            `);
            res.send(gerarHTMLUsuarios(req.session.adminUsuario, 'external-premium', usuarios));
        } catch (error) {
            res.send(gerarHTMLUsuarios(req.session.adminUsuario, 'external-premium', []));
        }
    });
    
    // Internal Advanced
    mainApp.get('/admin/usuarios/internal-advanced', verificarAdmin, async (req, res) => {
        try {
            const [usuarios] = await dbMySQL.query(`
                SELECT * FROM usuarios 
                WHERE tipo = 'internal' AND plano = 'advanced'
                ORDER BY created_at DESC
            `);
            res.send(gerarHTMLUsuarios(req.session.adminUsuario, 'internal-advanced', usuarios));
        } catch (error) {
            res.send(gerarHTMLUsuarios(req.session.adminUsuario, 'internal-advanced', []));
        }
    });
    
    // Internal Premium
    mainApp.get('/admin/usuarios/internal-premium', verificarAdmin, async (req, res) => {
        try {
            const [usuarios] = await dbMySQL.query(`
                SELECT * FROM usuarios 
                WHERE tipo = 'internal' AND plano = 'premium'
                ORDER BY created_at DESC
            `);
            res.send(gerarHTMLUsuarios(req.session.adminUsuario, 'internal-premium', usuarios));
        } catch (error) {
            res.send(gerarHTMLUsuarios(req.session.adminUsuario, 'internal-premium', []));
        }
    });
    
    // ==================== ROTA DE KEYS ====================
    mainApp.get('/admin/keys', verificarAdmin, async (req, res) => {
        try {
            // CORREÇÃO SQL: Usando crases em `keys` (palavra reservada MySQL)
            const [keys] = await dbMySQL.query("SELECT * FROM `keys` ORDER BY criado_em DESC LIMIT 100");
            res.send(gerarHTMLKeys(req.session.adminUsuario, keys));
        } catch (error) {
            console.error('Erro ao buscar keys:', error);
            res.send(gerarHTMLKeys(req.session.adminUsuario, []));
        }
    });
    
    // ==================== ROTA DE LOGS ====================
    mainApp.get('/admin/logs', verificarAdmin, async (req, res) => {
        try {
            const [logs] = await dbMySQL.query(`
                SELECT * FROM logs 
                ORDER BY timestamp DESC 
                LIMIT 100
            `);
            res.send(gerarHTMLLogs(req.session.adminUsuario, logs));
        } catch (error) {
            res.send(gerarHTMLLogs(req.session.adminUsuario, []));
        }
    });
    
    // ==================== ROTA DE FEEDBACK DOS CLIENTES ====================
    mainApp.get('/admin/feedback', verificarAdmin, async (req, res) => {
        try {
            res.send(gerarHTMLFeedback(req.session.adminUsuario));
        } catch (error) {
            console.error('Erro ao carregar feedback:', error);
            res.status(500).send('Erro ao carregar página');
        }
    });
    
    // ==================== ROTA DE CONFIGURAÇÕES ====================
    mainApp.get('/admin/configuracoes', verificarAdmin, async (req, res) => {
        try {
            res.send(gerarHTMLConfiguracoes(req.session.adminUsuario));
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
            res.status(500).send('Erro ao carregar página');
        }
    });
    
    // ==================== ROTA DE PAGAMENTOS ====================
    mainApp.get('/admin/pagamentos', verificarAdmin, async (req, res) => {
        try {
            // Buscar pedidos pendentes e recentes
            const [pedidos] = await dbMySQL.query(`
                SELECT * FROM pedidos 
                ORDER BY 
                    CASE WHEN status = 'pendente' THEN 0 ELSE 1 END,
                    created_at DESC 
                LIMIT 100
            `);
            res.send(gerarHTMLPagamentos(req.session.adminUsuario, pedidos));
        } catch (error) {
            console.error('Erro ao buscar pedidos:', error);
            // Se a tabela não existir, mostrar página vazia
            res.send(gerarHTMLPagamentos(req.session.adminUsuario, []));
        }
    });
    
    // ==================== APIs ====================
    
    // API: Obter Configurações de Preços
    mainApp.get('/admin/api/config-precos', verificarAdmin, async (req, res) => {
        try {
            res.json({ 
                success: true, 
                precos: PRECOS_PAINEL 
            });
        } catch (error) {
            res.json({ success: false, message: error.message });
        }
    });
    
    // API: Atualizar Preços (requer permissão de admin)
    mainApp.post('/admin/api/atualizar-precos', verificarAdmin, async (req, res) => {
        try {
            const { precos } = req.body;
            
            // Validar dados
            for (const [painelId, dados] of Object.entries(precos)) {
                if (!PRECOS_PAINEL[painelId]) {
                    return res.json({ success: false, message: `Painel ${painelId} inválido` });
                }
                if (typeof dados.preco !== 'number' || dados.preco < 0) {
                    return res.json({ success: false, message: `Preço inválido para ${painelId}` });
                }
            }
            
            // Atualizar configurações
            Object.assign(PRECOS_PAINEL, precos);
            
            registrarLog('PRECOS_ATUALIZADOS', { 
                precos, 
                admin: req.session.adminUsuario 
            });
            
            res.json({ success: true, message: 'Preços atualizados com sucesso!' });
        } catch (error) {
            res.json({ success: false, message: error.message });
        }
    });
    
    // API: Obter Estatísticas de Faturamento
    mainApp.get('/admin/api/faturamento', verificarAdmin, async (req, res) => {
        try {
            // Buscar vendas dos últimos 30 dias
            const [vendas] = await dbMySQL.query(`
                SELECT 
                    COUNT(*) as total_vendas,
                    SUM(valor_total) as faturamento_total,
                    AVG(valor_total) as ticket_medio,
                    DATE(created_at) as data
                FROM vendas 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY DATE(created_at)
                ORDER BY data DESC
            `);
            
            // Buscar estatísticas por painel
            const [statsPainel] = await dbMySQL.query(`
                SELECT 
                    p.painel_id,
                    COUNT(v.id) as vendas_count,
                    COALESCE(SUM(v.valor_total), 0) as faturamento
                FROM pedidos p
                LEFT JOIN vendas v ON p.pedido_id = v.pedido_id
                WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY p.painel_id
            `);
            
            // Calcular estatísticas
            const stats = {
                total_vendas: vendas.reduce((sum, v) => sum + parseInt(v.total_vendas), 0),
                faturamento_total: parseFloat(vendas.reduce((sum, v) => sum + parseFloat(v.faturamento_total || 0), 0)).toFixed(2),
                ticket_medio: parseFloat(vendas.reduce((sum, v) => sum + parseFloat(v.ticket_medio || 0), 0) / vendas.length || 0).toFixed(2),
                por_painel: {}
            };
            
            // Adicionar estatísticas por painel com preços configurados
            for (const painelId in PRECOS_PAINEL) {
                const statPainel = statsPainel.find(s => s.painel_id === painelId);
                stats.por_painel[painelId] = {
                    nome: PRECOS_PAINEL[painelId].nome,
                    icone: PRECOS_PAINEL[painelId].icone,
                    cor: PRECOS_PAINEL[painelId].cor,
                    preco_configurado: PRECOS_PAINEL[painelId].preco,
                    vendas_count: statPainel?.vendas_count || 0,
                    faturamento: parseFloat(statPainel?.faturamento || 0).toFixed(2)
                };
            }
            
            res.json({ success: true, stats });
        } catch (error) {
            res.json({ success: false, message: error.message });
        }
    });
    
    // API: Aprovar Pagamento e Entregar Key
    mainApp.post('/admin/api/aprovar-pagamento', verificarAdmin, async (req, res) => {
        try {
            const { pedido_id, tipo, dias, painel_id } = req.body;
            
            if (!pedido_id) {
                return res.json({ success: false, message: 'ID do pedido é obrigatório' });
            }
            
            // Buscar o pedido
            let pedido = null;
            let discordId = null;
            
            try {
                const [pedidos] = await dbMySQL.query(
                    "SELECT * FROM pedidos WHERE id = ?",
                    [pedido_id]
                );
                
                if (pedidos.length > 0) {
                    pedido = pedidos[0];
                    discordId = pedido.discord_id;
                    
                    // Verificar se já foi aprovado
                    if (pedido.status === 'aprovado') {
                        return res.json({ success: false, message: 'Este pedido já foi aprovado anteriormente' });
                    }
                }
            } catch (e) {
                // Tabela pode não existir, continuar mesmo assim
                console.log('Tabela pedidos pode não existir, criando key avulsa...');
            }
            
            // Gerar a Key
            const tipoKey = tipo || (pedido ? pedido.tipo : 'advanced');
            const diasValidade = parseInt(dias) || 30;
            const key = crypto.randomBytes(16).toString('hex').toUpperCase();
            
            // Determinar painel_id (prioridade: parâmetro > pedido > padrão)
            const painelIdFinal = painel_id || (pedido ? pedido.painel_id : 'external_advanced');
            
            // Inserir a Key na tabela `keys` com painel_id
            await dbMySQL.query(`
                INSERT INTO \`keys\` (keystr, tipo, dias, criado_por, criado_em, usado, pedido_id, painel_id)
                VALUES (?, ?, ?, ?, NOW(), 0, ?, ?)
            `, [key, tipoKey, diasValidade, req.session.adminUsuario, pedido_id, painelIdFinal]);
            
            // Atualizar status do pedido se existir
            if (pedido) {
                await dbMySQL.query(`
                    UPDATE pedidos 
                    SET status = 'aprovado', 
                        key_entregue = ?,
                        aprovado_por = ?,
                        aprovado_em = NOW()
                    WHERE id = ?
                `, [key, req.session.adminUsuario, pedido_id]);
                
                // Gerar link de avaliação para o cliente
                const avaliacaoLink = gerarLinkAvaliacao(pedido.usuario_id, painelIdFinal, pedido_id);
                const mensagemPrivado = gerarMensagemPrivadoAvaliacao(pedido.usuario_id, painelIdFinal, pedido_id, key);
                
                // Registrar log com link de avaliação e mensagem completa
                registrarLog('PAGAMENTO_APROVADO', { 
                    pedido_id, 
                    key, 
                    tipo: tipoKey, 
                    dias: diasValidade,
                    painel_id: painelIdFinal,
                    discord_id: discordId,
                    usuario_id: pedido.usuario_id,
                    avaliacao_link: avaliacaoLink,
                    mensagem_privado: mensagemPrivado,
                    admin: req.session.adminUsuario 
                });
                
                console.log(`✅ Link de avaliação gerado para usuário ${pedido.usuario_id}: ${avaliacaoLink}`);
                console.log(`📝 Mensagem para enviar no privado:\n${mensagemPrivado}`);
            } else {
                registrarLog('PAGAMENTO_APROVADO', { 
                    pedido_id, 
                    key, 
                    tipo: tipoKey, 
                    dias: diasValidade,
                    painel_id: painelIdFinal,
                    discord_id: discordId,
                    admin: req.session.adminUsuario 
                });
            }
            
            // Retornar sucesso com a key (o bot pode pegar essa info do log ou de uma fila)
            res.json({ 
                success: true, 
                message: 'Pagamento aprovado e key gerada!',
                key: key,
                discord_id: discordId,
                pedido_id: pedido_id,
                painel_id: painelIdFinal
            });
            
        } catch (error) {
            console.error('Erro ao aprovar pagamento:', error);
            res.json({ success: false, message: error.message });
        }
    });
    
    // API: Rejeitar Pagamento
    mainApp.post('/admin/api/rejeitar-pagamento', verificarAdmin, async (req, res) => {
        try {
            const { pedido_id, motivo } = req.body;
            
            if (!pedido_id) {
                return res.json({ success: false, message: 'ID do pedido é obrigatório' });
            }
            
            // Atualizar status do pedido
            await dbMySQL.query(`
                UPDATE pedidos 
                SET status = 'rejeitado',
                    motivo_rejeicao = ?,
                    rejeitado_por = ?,
                    rejeitado_em = NOW()
                WHERE id = ?
            `, [motivo || 'Não especificado', req.session.adminUsuario, pedido_id]);
            
            // Registrar log
            registrarLog('PAGAMENTO_REJEITADO', { 
                pedido_id, 
                motivo,
                admin: req.session.adminUsuario 
            });
            
            res.json({ success: true, message: 'Pagamento rejeitado' });
            
        } catch (error) {
            console.error('Erro ao rejeitar pagamento:', error);
            res.json({ success: false, message: error.message });
        }
    });
    
    // API: Criar Usuário
    mainApp.post('/admin/api/criar-usuario', verificarAdmin, async (req, res) => {
        try {
            const { username, senha, email, tipo, plano, validade, hwid_enabled } = req.body;
            
            if (!username || !senha) {
                return res.json({ success: false, message: 'Usuário e senha são obrigatórios' });
            }
            
            const senhaHash = await bcrypt.hash(senha, 10);
            
            // Calcular data de validade
            const dataValidade = new Date();
            dataValidade.setDate(dataValidade.getDate() + parseInt(validade || 30));
            const validadeFormatada = dataValidade.toISOString().split('T')[0];
            
            await dbMySQL.query(`
                INSERT INTO usuarios (username, senha_hash, email, tipo, plano, validade, hwid_enabled, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            `, [username, senhaHash, email || null, tipo || 'external', plano || 'advanced', validadeFormatada, hwid_enabled ? 1 : 0]);
            
            registrarLog('USUARIO_CRIADO', { username, tipo, plano, admin: req.session.adminUsuario });
            
            res.json({ success: true, message: 'Usuário criado com sucesso!' });
        } catch (error) {
            console.error('Erro ao criar usuário:', error);
            res.json({ success: false, message: error.message });
        }
    });
    
    // API: Estender Tempo
    mainApp.post('/admin/api/estender-tempo', verificarAdmin, async (req, res) => {
        try {
            const { usuario_id, dias } = req.body;
            
            await dbMySQL.query(`
                UPDATE usuarios 
                SET validade = DATE_ADD(IFNULL(validade, NOW()), INTERVAL ? DAY)
                WHERE id = ?
            `, [parseInt(dias), usuario_id]);
            
            registrarLog('USUARIO_TEMPO_ESTENDIDO', { usuario_id, dias, admin: req.session.adminUsuario });
            
            res.json({ success: true, message: `${dias} dias adicionados com sucesso!` });
        } catch (error) {
            res.json({ success: false, message: error.message });
        }
    });
    
    // API: Deletar Usuário
    mainApp.post('/admin/api/deletar-usuario', verificarAdmin, async (req, res) => {
        try {
            const { usuario_id } = req.body;
            
            await dbMySQL.query('DELETE FROM usuarios WHERE id = ?', [usuario_id]);
            
            registrarLog('USUARIO_DELETADO', { usuario_id, admin: req.session.adminUsuario });
            
            res.json({ success: true, message: 'Usuário deletado com sucesso!' });
        } catch (error) {
            res.json({ success: false, message: error.message });
        }
    });
    
    // API: Criar Key (CORREÇÃO SQL: Usando crases em `keys`)
    mainApp.post('/admin/api/criar-key', verificarAdmin, async (req, res) => {
        try {
            const { tipo, dias, painel_id } = req.body;
            
            if (!tipo || !dias || !painel_id) {
                return res.json({ success: false, message: 'Tipo, dias e painel_id são obrigatórios' });
            }
            
            // Validar painel_id
            const painelValido = ['internal_premium', 'internal_advanced', 'external_premium', 'external_advanced'];
            if (!painelValido.includes(painel_id)) {
                return res.json({ success: false, message: 'Painel ID inválido' });
            }
            
            const key = crypto.randomBytes(16).toString('hex').toUpperCase();
            
            // CORREÇÃO SQL: `keys` entre crases
            await dbMySQL.query(`
                INSERT INTO \`keys\` (keystr, tipo, dias, painel_id, criado_por, criado_em, usado)
                VALUES (?, ?, ?, ?, ?, NOW(), 0)
            `, [key, tipo, parseInt(dias), painel_id, req.session.adminUsuario]);
            
            registrarLog('KEY_CRIADA', { key, tipo, dias, painel_id, admin: req.session.adminUsuario });
            
            res.json({ success: true, key: key });
        } catch (error) {
            console.error('Erro ao criar key:', error);
            res.json({ success: false, message: error.message });
        }
    });
    
    // API: Validar Key para Painel
    mainApp.post('/api/validar-key/:painel_id', async (req, res) => {
        try {
            const { painel_id } = req.params;
            const { key } = req.body;
            
            if (!key || !painel_id) {
                return res.json({ success: false, message: 'Key e painel_id são obrigatórios' });
            }
            
            // Validar painel_id
            const painelValido = ['internal_premium', 'internal_advanced', 'external_premium', 'external_advanced'];
            if (!painelValido.includes(painel_id)) {
                return res.json({ success: false, message: 'Painel inválido' });
            }
            
            // Buscar key específica do painel
            const [keyRows] = await dbMySQL.query(
                'SELECT * FROM `keys` WHERE keystr = ? AND painel_id = ? AND usado = 0',
                [key, painel_id]
            );
            
            if (keyRows.length === 0) {
                // Registrar tentativa falha
                await dbMySQL.query(`
                    INSERT INTO painel_logs (painel_id, key_utilizada, ip_acesso, user_agent, sucesso, motivo_falha)
                    VALUES (?, ?, ?, ?, 0, 'Key inválida ou já utilizada')
                `, [painel_id, key, req.ip, req.get('User-Agent')]);
                
                return res.json({ success: false, message: 'Key inválida ou já utilizada' });
            }
            
            const keyData = keyRows[0];
            
            // Marcar key como usada
            await dbMySQL.query(
                'UPDATE `keys` SET usado = 1 WHERE id = ?',
                [keyData.id]
            );
            
            // Registrar acesso bem-sucedido
            await dbMySQL.query(`
                INSERT INTO painel_logs (painel_id, key_utilizada, ip_acesso, user_agent, sucesso)
                VALUES (?, ?, ?, ?, 1)
            `, [painel_id, key, req.ip, req.get('User-Agent')]);
            
            registrarLog('KEY_VALIDADA', { 
                key, 
                painel_id, 
                ip: req.ip,
                admin: req.session.adminUsuario || 'API'
            });
            
            res.json({ 
                success: true, 
                message: 'Key validada com sucesso',
                painel_id: painel_id,
                dias: keyData.dias
            });
            
        } catch (error) {
            console.error('Erro ao validar key:', error);
            res.json({ success: false, message: 'Erro interno' });
        }
    });
    mainApp.post('/admin/api/deletar-key', verificarAdmin, async (req, res) => {
        try {
            const { key_id } = req.body;
            
            // CORREÇÃO SQL: `keys` entre crases
            await dbMySQL.query('DELETE FROM `keys` WHERE id = ?', [key_id]);
            
            registrarLog('KEY_DELETADA', { key_id, admin: req.session.adminUsuario });
            
            res.json({ success: true, message: 'Key deletada com sucesso!' });
        } catch (error) {
            res.json({ success: false, message: error.message });
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('   ✅ NEW ADMIN PANEL - ELITE CYBERPUNK EDITION');
    console.log('   📍 Login: http://localhost:3000/admin/login');
}

// ========== EXPORTAR ==========
module.exports = { iniciarPainelAdmin };

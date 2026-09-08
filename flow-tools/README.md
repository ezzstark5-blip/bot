# Self Flow (integrado no Bot Hm)

## Comandos

| Comando | Função |
|---------|--------|
| `/setup-tools` | Admin: configurar e enviar o painel público (Components V2) |
| `/setlogs` | Configurar logs públicos/admin (canal ou webhook) |

## Uso

1. Reinicie o Bot Hm (`npm start`)
2. `/setup-tools` → personalize e **Publicar** no canal
3. No painel público: vincular token → Auto Quest / tools

Owners: `OWNER_ID` no `.env` do Bot Hm.

Token do bot: sempre `DISCORD_TOKEN` no `.env` da raiz (`Bot Hm/.env`).
O `flow-tools/config.json` **não** guarda mais o token.

# Rotacao de Segredos

## Trocar agora
- `GOOGLE_API_KEY`
- `TWILIO_AUTH_TOKEN`
- revisar `TWILIO_ACCOUNT_SID`
- revisar `TWILIO_VERIFY_SID`
- revisar usuario e senha do banco se este Postgres sair do ambiente local

## Confirmar no projeto
- `server/.env` deve ficar apenas local
- `server/.env.example` deve manter apenas placeholders
- `SESSION_TOKEN_SALT` deve existir e ser forte em todos os ambientes
- `CORS_ORIGIN` deve apontar para a origem real do frontend em producao
- `ALLOW_X_USER_ID` deve continuar `false`

## Depois da rotacao
- reiniciar backend
- testar login
- testar logout
- testar envio de OTP
- testar verificacao de OTP
- testar assistente com a nova chave do Google

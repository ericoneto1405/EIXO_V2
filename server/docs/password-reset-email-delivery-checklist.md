# Checklist operacional — e-mail de recuperação de senha

Use este checklist após deploy para confirmar entrega real de e-mails de redefinição.

## 1) Configuração básica
- Confirmar `RESEND_API_KEY` válido no ambiente ativo.
- Confirmar `RESEND_FROM_EMAIL` usando domínio autenticado no Resend.
- Confirmar `APP_BASE_URL` apontando para a URL correta do frontend em produção.

## 2) Autenticação de domínio
- Validar SPF configurado no DNS do domínio remetente.
- Validar DKIM configurado e ativo.
- Validar DMARC configurado com política mínima de monitoramento.

## 3) Teste de entrega real
- Solicitar recuperação para pelo menos 2 provedores (ex.: Gmail e Outlook).
- Verificar recebimento em caixa de entrada e pasta spam.
- Registrar horário da solicitação e horário de recebimento.

## 4) Evidências no backend
- Verificar log `[forgot-password] email-send-success` e capturar `resendMessageId`.
- Se falhar, verificar log `[forgot-password] email-send-failure` e o erro resumido.
- Correlacionar com logs do provedor usando o `resendMessageId`.

## 5) Critério de aceite
- E-mail entregue em ambos os provedores testados.
- Link abre na tela de reset (não volta para landing).
- Redefinição concluída com login válido usando a nova senha.

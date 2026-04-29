# App de Manejo

Aplicativo de campo do EIXO para registrar ocorrencias de manejo pelo celular.

## Identidade visual

Marca atual em uso no app: `public/eixo-logo-render.png`.

### Paleta EIXO

| Papel | Valor |
|------|-------|
| Graphite | `#3f4141` |
| Graphite Dark | `#2f3131` |
| Primary Green | `#76b82a` |
| Primary Green Dark | `#5f9f1f` |
| Green Soft | `#edf7e6` |
| Background | `#f7f8f6` |
| Surface | `#ffffff` |
| Surface Soft | `#f0f2ef` |
| Text | `#202322` |
| Text Muted | `#66706a` |
| Text Soft | `#8a948d` |
| Border | `#dfe4df` |
| Border Strong | `#c7cec7` |
| Success | `#4f9f2f` |
| Warning | `#c58a20` |
| Danger | `#b84232` |
| Info | `#3f6f8f` |

### Uso no app

- fundo principal: `var(--eixo-bg)`
- cards e modais: `var(--eixo-surface)`
- botoes primarios: `var(--eixo-green)`
- botoes escuros e shell do aparelho: `var(--eixo-graphite-dark)`
- textos secundarios: `var(--eixo-text-muted)`

## Como rodar localmente

**Pre-requisito:** Node.js instalado.

1. Instale as dependencias:

   ```bash
   npm install
   ```

2. Configure a URL da API principal do EIXO:

   ```bash
   cp .env.example .env.local
   ```

   Por padrao, o app espera a API em:

   ```txt
   http://localhost:3001
   ```

3. Rode o App de Manejo:

   ```bash
   npm run dev
   ```

## Portas usadas

```txt
http://localhost:3000 -> App de Manejo
http://localhost:3001 -> API principal do EIXO
```

O servidor local deste app serve apenas a tela React. Login, ativacao, sincronizacao de ocorrencias e envio de fotos sao feitos pela API principal do EIXO.

#!/bin/bash
# Teste automático pós-refatoração do server/index.js

BASE_URL="http://localhost:${PORT:-3001}"
PASS=0
FAIL=0
TOTAL=0

test_route() {
  local method=$1
  local route=$2
  local expected=$3
  local desc=$4
  local data=$5
  
  TOTAL=$((TOTAL + 1))
  
  if [ -n "$data" ]; then
    response=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE_URL$route" \
      -H "Content-Type: application/json" \
      -d "$data" 2>/dev/null)
  else
    response=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE_URL$route" 2>/dev/null)
  fi
  
  if [ "$response" = "$expected" ]; then
    echo "✅ $desc ($method $route) → $response"
    PASS=$((PASS + 1))
  else
    echo "❌ $desc ($method $route) → $response (esperado $expected)"
    FAIL=$((FAIL + 1))
  fi
}

echo "🧪 Testando refatoração do server/index.js..."
echo "📍 $BASE_URL"
echo ""

# Health check
echo "=== Health Check ==="
test_route GET "/health" 200 "Health check"

echo ""
echo "=== Rotas Públicas (devem retornar 401 sem auth) ==="
test_route GET "/animals" 401 "Animals sem auth"
test_route GET "/farms" 401 "Farms sem auth"
test_route GET "/lots" 401 "Lots sem auth"
test_route GET "/pastos" 401 "Pastos sem auth"

echo ""
echo "=== Autenticação ==="
test_route POST "/auth/login" 400 "Login com dados vazios"
test_route POST "/auth/login" 401 "Login com credenciais inválidas" '{"email":"invalid@test.com","password":"wrong123"}'

echo ""
echo "=== Rotas Protegidas (com token inválido) ==="
test_route GET "/auth/me" 401 "Auth/me sem sessão"
test_route GET "/users" 401 "Users sem auth"

echo ""
echo "📊 Resultado: $PASS/$TOTAL passed, $FAIL failed"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "✅ Todos os testes passaram!"
  exit 0
else
  echo "⚠️  Alguns testes falharam. Verifique se o servidor está rodando."
  echo "💡 Dica: Execute 'node server/index.js' em outro terminal antes de rodar os testes."
  exit 1
fi

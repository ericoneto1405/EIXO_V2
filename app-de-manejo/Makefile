PORT ?= 3000
HMR_PORT ?= 24678

.PHONY: dev stop restart status

dev:
	npm run dev

stop:
	@echo "Encerrando processos nas portas $(PORT) e $(HMR_PORT), se existirem..."
	@lsof -ti tcp:$(PORT) | xargs kill -9 2>/dev/null || true
	@lsof -ti tcp:$(HMR_PORT) | xargs kill -9 2>/dev/null || true

restart: stop
	@echo "Subindo app-de-manejo na porta $(PORT)..."
	npm run dev

status:
	@echo "Porta $(PORT):"
	@lsof -nP -iTCP:$(PORT) -sTCP:LISTEN || true
	@echo ""
	@echo "Porta $(HMR_PORT):"
	@lsof -nP -iTCP:$(HMR_PORT) -sTCP:LISTEN || true

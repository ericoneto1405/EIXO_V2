.PHONY: install ensure-deps dev dev-frontend dev-backend build preview clean stop-dev restart

install:
	@npm install

ensure-deps:
	@if [ ! -x node_modules/.bin/concurrently ]; then \
		printf "Dependências ausentes. Rodando npm install...\n"; \
		npm install; \
	fi

dev: ensure-deps
	@npm run dev

dev-frontend: ensure-deps
	@npm run dev:frontend

dev-backend: ensure-deps
	@npm run dev:server

build: ensure-deps
	@npm run build

preview: ensure-deps
	@npm run preview

clean:
	@rm -rf node_modules package-lock.json frontend/node_modules server/node_modules frontend/dist

stop-dev:
	@printf "Encerrando processos locais do EIXO...\n"
	@for port in 5173 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do \
		pids="$$(lsof -ti tcp:$$port 2>/dev/null)"; \
		if [ -n "$$pids" ]; then \
			printf "  porta %s -> %s\n" "$$port" "$$pids"; \
			kill $$pids 2>/dev/null || true; \
		fi; \
	done

restart:
	@$(MAKE) --no-print-directory stop-dev
	@$(MAKE) --no-print-directory dev

.DEFAULT_GOAL := help

# typecheck 与 build 共用 TypeScript 缓存，按顺序执行。
.NOTPARALLEL:
.PHONY: help install dev preview build typecheck lint test check contract-check contract-sync clean

PNPM ?= pnpm
HOST ?= 127.0.0.1
DEV_PORT ?= 5173
PREVIEW_PORT ?= 4173
OPENAPI ?= ../bluebell_backend/docs/openapi.yaml

# 依赖安装由 install 显式执行，运行脚本时不触发 pnpm 自动安装。
PNPM_RUN = $(PNPM) --config.verify-deps-before-run=false run

help: ## 显示可用命令
	@awk 'BEGIN { FS = ":.*## "; printf "用法：make <目标> [变量=值]\n\n" } /^[a-zA-Z0-9_-]+:.*## / { printf "  %-18s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## 按锁文件安装依赖
	$(PNPM) install --frozen-lockfile

dev: ## 启动开发服务器（默认 127.0.0.1:5173）
	$(PNPM_RUN) dev --host "$(HOST)" --port "$(DEV_PORT)" --strictPort

preview: build ## 构建并预览生产产物（默认 127.0.0.1:4173）
	$(PNPM_RUN) preview --host "$(HOST)" --port "$(PREVIEW_PORT)" --strictPort

build: ## 类型检查并构建生产产物
	$(PNPM_RUN) build

typecheck: ## 检查 TypeScript 类型
	$(PNPM_RUN) typecheck

lint: ## 执行 ESLint 检查
	$(PNPM_RUN) lint

test: ## 运行全部 Vitest 测试
	$(PNPM_RUN) test

check: typecheck lint test contract-check build ## 顺序执行全部检查和生产构建

contract-check: ## 检查前端 OpenAPI 快照与生成类型是否一致
	$(PNPM_RUN) contract:check

contract-sync: ## 从 OPENAPI 指定的文件同步前端契约与类型
	$(PNPM_RUN) contract:sync "$(OPENAPI)"

clean: ## 清理构建产物和工具缓存，保留依赖与锁文件
	rm -rf -- dist dist-ssr node_modules/.tmp node_modules/.vite node_modules/.vite-temp

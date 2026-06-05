# HealthSync — local development without Docker.
#
# Each app keeps its native toolchain (ADR-0009); this Makefile just orchestrates
# them so you can install and run the three services from the repo root.
#
# Requirements on your machine:
#   - Python >= 3.11   (override with `make PYTHON=python3.x ...`; default: python3.12)
#   - Node + pnpm
#
# Quick start:
#   make install   # install all dependencies
#   make dev       # run the three services in parallel (Ctrl-C stops all)

PYTHON ?= python3.12
PNPM   ?= pnpm

LANGUAGE_DIR   := apps/language
SCHEDULING_DIR := apps/scheduling
WEB_DIR        := apps/web

LANGUAGE_PORT   ?= 8000
SCHEDULING_PORT ?= 3000
WEB_PORT        ?= 5173

VENV := $(LANGUAGE_DIR)/.venv

.DEFAULT_GOAL := help

.PHONY: help install install-language install-scheduling install-web \
        dev dev-language dev-scheduling dev-web \
        build build-scheduling build-web test health clean

help: ## Show this help
	@echo "HealthSync — local dev (no Docker)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- install ---

install: install-language install-scheduling install-web ## Install all dependencies

install-language: ## Create the venv (Python >=3.11) and install language deps
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install --upgrade pip
	$(VENV)/bin/pip install -e $(LANGUAGE_DIR)

install-scheduling: ## Install scheduling (NestJS) deps
	cd $(SCHEDULING_DIR) && $(PNPM) install

install-web: ## Install web (React + Vite) deps
	cd $(WEB_DIR) && $(PNPM) install

# --- dev: a single service ---

dev-language: ## Run the FastAPI language service with reload
	cd $(LANGUAGE_DIR) && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port $(LANGUAGE_PORT)

dev-scheduling: ## Run the NestJS scheduling service in watch mode
	cd $(SCHEDULING_DIR) && PORT=$(SCHEDULING_PORT) $(PNPM) start:dev

dev-web: ## Run the React + Vite web app
	cd $(WEB_DIR) && $(PNPM) dev

# --- dev: all three at once ---

dev: ## Run all three services in parallel (Ctrl-C stops all)
	@echo "Starting  language:$(LANGUAGE_PORT)  scheduling:$(SCHEDULING_PORT)  web:$(WEB_PORT)   (Ctrl-C to stop all)"
	@trap 'kill 0' INT TERM EXIT; \
	( cd $(LANGUAGE_DIR) && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port $(LANGUAGE_PORT) ) & \
	( cd $(SCHEDULING_DIR) && PORT=$(SCHEDULING_PORT) $(PNPM) start:dev ) & \
	( cd $(WEB_DIR) && $(PNPM) dev ) & \
	wait

# --- build / test / health / clean ---

build: build-scheduling build-web ## Build the buildable apps (scheduling, web)

build-scheduling:
	cd $(SCHEDULING_DIR) && $(PNPM) build

build-web:
	cd $(WEB_DIR) && $(PNPM) build

test: ## Run scheduling unit tests
	cd $(SCHEDULING_DIR) && $(PNPM) test

health: ## Check /health of the running language + scheduling services
	@curl -s --max-time 2 localhost:$(LANGUAGE_PORT)/health && echo "  <- language"   || echo "language: DOWN"
	@curl -s --max-time 2 localhost:$(SCHEDULING_PORT)/health && echo "  <- scheduling" || echo "scheduling: DOWN"

clean: ## Remove the venv, node_modules, and build artifacts
	rm -rf $(VENV)
	rm -rf $(SCHEDULING_DIR)/node_modules $(SCHEDULING_DIR)/dist
	rm -rf $(WEB_DIR)/node_modules $(WEB_DIR)/dist

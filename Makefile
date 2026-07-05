# Local mirrors of the pipeline stages. CI runs the same commands.

.PHONY: test solve html dev data-batch train-local wasm infra-plan infra-apply lint-bans smoke-e2e

test:
	npm test
	python -m pytest tools/test_validate.py -q

lint-bans:
	node tools/check-bans.mjs

solve:
	node games/golem-grid/tools/solve.js --seeds 10000

html:
	npm run build -w @golem-engine/golem-grid
	mv games/golem-grid/dist/index.html games/golem-grid/dist/golem-grid.html
	@echo "single-file deliverable: games/golem-grid/dist/golem-grid.html (open from file://, two tabs)"

dev:
	npm run dev -w @golem-engine/golem-grid

smoke-e2e: html
	@echo "two-tab Playwright smoke (real Chromium, file://, NOT part of npm test/CI)"
	node games/golem-grid/tests/e2e/two-tab.smoke.mjs
	@echo "visual-pinning Playwright smoke (deterministic canvas capture, same harness)"
	node games/golem-grid/tests/e2e/visual.smoke.mjs capture games/golem-grid/tests/e2e/.visual-out

data-batch:
	node tools/harvest.js --seeds 100 --out work/controls.jsonl
	python tools/generate.py --controls work/controls.jsonl --batches 2 \
	  --variants 4 --out work/raw.jsonl
	python tools/validate.py --in work/raw.jsonl \
	  --pass work/clean.jsonl --fail work/quarantine.jsonl

train-local:  # 256K-param smoke model on CPU: proves the loop, minutes not hours
	python train/train.py --corpus work/clean.jsonl --dim 64 --layers 4 \
	  --steps 2000 --out work/smoke/

wasm:
	emcc wasm/runq.c -O3 -msimd128 \
	  -s EXPORTED_FUNCTIONS='["_init","_generate","_malloc","_free"]' \
	  -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_NAME=Golem \
	  -o dist/golem.js

infra-plan:
	cd infra && terraform init && terraform plan

infra-apply:
	cd infra && terraform apply

# Local mirrors of the pipeline stages. CI runs the same commands.

.PHONY: test data-batch train-local wasm infra-plan infra-apply

test:
	node --test tests/worldgen.test.js tests/replay.test.js
	python -m pytest tools/test_validate.py -q

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

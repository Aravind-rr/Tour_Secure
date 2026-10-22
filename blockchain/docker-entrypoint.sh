#!/bin/sh
set -eu

npx hardhat node --hostname 0.0.0.0 &
node_pid=$!

cleanup() {
  kill "$node_pid" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

attempt=0
until node -e "fetch('http://127.0.0.1:8545', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0', method:'eth_chainId', params:[], id:1})}).then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Hardhat RPC did not become ready" >&2
    exit 1
  fi
  sleep 1
done

npx hardhat run --no-compile scripts/deploy.ts --network localhost
wait "$node_pid"

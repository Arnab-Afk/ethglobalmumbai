# Anvil mainnet fork → deploy CompetitiveFeeExtruction → print Aqua ship calldata
# Usage (from repo root or this package):
#   powershell -File packages/swapvm-opcode/scripts/run-aqua-fork.ps1

$ErrorActionPreference = "Stop"
$env:Path = "$env:USERPROFILE\.foundry\bin;$env:Path"
$env:FOUNDRY_DISABLE_NIGHTLY_WARNING = "1"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$pkg = Resolve-Path (Join-Path $PSScriptRoot "..")

# Load project .env
Get-Content (Join-Path $root ".env") | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "Env:$($Matches[1].Trim())" -Value $Matches[2].Trim() }
}

$forkRpc = if ($env:FORK_RPC) { $env:FORK_RPC } else { $env:RPC_URL }
if (-not $forkRpc) { throw "Set FORK_RPC or RPC_URL (mainnet archive/public RPC for Anvil fork)" }

Write-Host "Starting Anvil fork of $forkRpc ..."
$anvil = Start-Process -FilePath "anvil" -ArgumentList @(
  "--fork-url", $forkRpc,
  "--port", "8545",
  "--chain-id", "1"
) -PassThru -NoNewWindow
Start-Sleep -Seconds 3

try {
  $env:RPC_URL = "http://127.0.0.1:8545"
  Set-Location $pkg

  # Fund deployer on the fork (Anvil does not auto-fund arbitrary keys)
  $maker = $env:DEPLOYER_ADDRESS
  cast rpc anvil_setBalance $maker 0x56BC75E2D63100000 --rpc-url $env:RPC_URL | Out-Null  # 100 ETH
  Write-Host "Funded deployer eth=$(cast balance $maker --rpc-url $env:RPC_URL --ether)"

  Write-Host "Deploying MockQuoteOracle + CompetitiveFeeExtruction on fork ..."
  $out = forge script script/DeployFork.s.sol:DeployFork --rpc-url $env:RPC_URL --broadcast -vv 2>&1 | Out-String
  Write-Host $out

  # Parse addresses from forge logs
  if ($out -match "MockQuoteOracle\s+(0x[a-fA-F0-9]{40})") { $env:MOCK_QUOTE_ORACLE = $Matches[1] }
  if ($out -match "CompetitiveFeeExtruction\s+(0x[a-fA-F0-9]{40})") { $env:COMPETITIVE_FEE_EXTRUCTION = $Matches[1] }

  Write-Host "MOCK_QUOTE_ORACLE=$($env:MOCK_QUOTE_ORACLE)"
  Write-Host "COMPETITIVE_FEE_EXTRUCTION=$($env:COMPETITIVE_FEE_EXTRUCTION)"

  # Fund maker with WETH/USDC via anvil cheatcodes (steal from known whales)
  $weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
  $usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
  # Binance-ish USDC whale / WETH holder — adjust if empty
  $wethWhale = "0x8EB8a3b98659Cce290402893d0123abb75E3ab28"
  $usdcWhale = "0x55FE002aefF02F77364de339a1292923A15844B8"

  cast rpc anvil_impersonateAccount $wethWhale --rpc-url $env:RPC_URL | Out-Null
  cast rpc anvil_impersonateAccount $usdcWhale --rpc-url $env:RPC_URL | Out-Null
  cast send $weth "transfer(address,uint256)" $maker 20ether --from $wethWhale --unlocked --rpc-url $env:RPC_URL | Out-Null
  cast send $usdc "transfer(address,uint256)" $maker 100000000000 --from $usdcWhale --unlocked --rpc-url $env:RPC_URL | Out-Null
  Write-Host "Funded maker WETH=$(cast call $weth 'balanceOf(address)(uint256)' $maker --rpc-url $env:RPC_URL) USDC=$(cast call $usdc 'balanceOf(address)(uint256)' $maker --rpc-url $env:RPC_URL)"

  Write-Host "Building + shipping Aqua strategy ..."
  npx tsx scripts/aqua-ship-quote.ts --send

  Write-Host "Done. Anvil still running on :8545 (pid $($anvil.Id)). Stop with Stop-Process -Id $($anvil.Id)"
}
catch {
  Write-Host "ERROR: $_"
  if ($anvil -and -not $anvil.HasExited) { Stop-Process -Id $anvil.Id -Force }
  throw
}

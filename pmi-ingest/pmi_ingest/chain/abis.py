"""Minimal ABI fragments for the chain contracts we index.

Only the events we actually decode are listed — full ABIs are not needed
because we never call into these contracts. Web3.py decodes a log purely
from the indexed/non-indexed slot layout in these fragments.

Sources
-------
* `polymarket_ctf_exchange.OrderFilled` — `CtfExchange.sol` in
  Polymarket/ctf-exchange (Apache-2.0).
* `conditional_tokens.{ConditionPreparation,ConditionResolution}` —
  Gnosis CTF v1.0.
* `optimistic_oracle_v2.{ProposePrice,DisputePrice,Settle}` — UMA OO V2.
* `uma_ctf_adapter.QuestionResolved` — Polymarket UmaCtfAdapter.

If Polymarket ships a new exchange contract (NegRiskCtfExchange has the
same OrderFilled signature, just a different deployed address), only the
config `polygon_ctf_exchange_address` needs updating.
"""

from __future__ import annotations

ORDER_FILLED_ABI: dict = {
    "anonymous": False,
    "name": "OrderFilled",
    "type": "event",
    "inputs": [
        {"name": "orderHash", "type": "bytes32", "indexed": True},
        {"name": "maker", "type": "address", "indexed": True},
        {"name": "taker", "type": "address", "indexed": True},
        {"name": "makerAssetId", "type": "uint256", "indexed": False},
        {"name": "takerAssetId", "type": "uint256", "indexed": False},
        {"name": "makerAmountFilled", "type": "uint256", "indexed": False},
        {"name": "takerAmountFilled", "type": "uint256", "indexed": False},
        {"name": "fee", "type": "uint256", "indexed": False},
    ],
}

CONDITION_PREPARATION_ABI: dict = {
    "anonymous": False,
    "name": "ConditionPreparation",
    "type": "event",
    "inputs": [
        {"name": "conditionId", "type": "bytes32", "indexed": True},
        {"name": "oracle", "type": "address", "indexed": True},
        {"name": "questionId", "type": "bytes32", "indexed": True},
        {"name": "outcomeSlotCount", "type": "uint256", "indexed": False},
    ],
}

CONDITION_RESOLUTION_ABI: dict = {
    "anonymous": False,
    "name": "ConditionResolution",
    "type": "event",
    "inputs": [
        {"name": "conditionId", "type": "bytes32", "indexed": True},
        {"name": "oracle", "type": "address", "indexed": True},
        {"name": "questionId", "type": "bytes32", "indexed": True},
        {"name": "outcomeSlotCount", "type": "uint256", "indexed": False},
        {"name": "payoutNumerators", "type": "uint256[]", "indexed": False},
    ],
}

UMA_PROPOSE_PRICE_ABI: dict = {
    "anonymous": False,
    "name": "ProposePrice",
    "type": "event",
    "inputs": [
        {"name": "requester", "type": "address", "indexed": True},
        {"name": "proposer", "type": "address", "indexed": True},
        {"name": "identifier", "type": "bytes32", "indexed": False},
        {"name": "timestamp", "type": "uint256", "indexed": False},
        {"name": "ancillaryData", "type": "bytes", "indexed": False},
        {"name": "proposedPrice", "type": "int256", "indexed": False},
        {"name": "expirationTimestamp", "type": "uint256", "indexed": False},
        {"name": "currency", "type": "address", "indexed": False},
    ],
}

UMA_DISPUTE_PRICE_ABI: dict = {
    "anonymous": False,
    "name": "DisputePrice",
    "type": "event",
    "inputs": [
        {"name": "requester", "type": "address", "indexed": True},
        {"name": "proposer", "type": "address", "indexed": True},
        {"name": "disputer", "type": "address", "indexed": True},
        {"name": "identifier", "type": "bytes32", "indexed": False},
        {"name": "timestamp", "type": "uint256", "indexed": False},
        {"name": "ancillaryData", "type": "bytes", "indexed": False},
        {"name": "proposedPrice", "type": "int256", "indexed": False},
    ],
}

UMA_SETTLE_ABI: dict = {
    "anonymous": False,
    "name": "Settle",
    "type": "event",
    "inputs": [
        {"name": "requester", "type": "address", "indexed": True},
        {"name": "proposer", "type": "address", "indexed": True},
        {"name": "disputer", "type": "address", "indexed": True},
        {"name": "identifier", "type": "bytes32", "indexed": False},
        {"name": "timestamp", "type": "uint256", "indexed": False},
        {"name": "ancillaryData", "type": "bytes", "indexed": False},
        {"name": "price", "type": "int256", "indexed": False},
        {"name": "payout", "type": "uint256", "indexed": False},
    ],
}

# Polymarket-specific: UmaCtfAdapter.QuestionResolved. Fires when the
# adapter pulls a settled UMA price and posts it to ConditionalTokens.
# Cleanest per-market resolution signal — bytes32 questionId maps to a
# Polymarket conditionId one-to-one.
ADAPTER_QUESTION_RESOLVED_ABI: dict = {
    "anonymous": False,
    "name": "QuestionResolved",
    "type": "event",
    "inputs": [
        {"name": "questionID", "type": "bytes32", "indexed": True},
        {"name": "settledPrice", "type": "int256", "indexed": False},
        {"name": "payouts", "type": "uint256[]", "indexed": False},
    ],
}

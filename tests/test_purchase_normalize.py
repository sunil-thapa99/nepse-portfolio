"""Tests for purchase source normalization and transaction date backfill."""

import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import main as m


class TestCanonicalPurchaseSource(unittest.TestCase):
    def test_empty_defaults_on_market(self) -> None:
        self.assertEqual(m._canonical_purchase_source(""), "ON_MARKET")
        self.assertEqual(m._canonical_purchase_source("   "), "ON_MARKET")

    def test_hyphen_normalized(self) -> None:
        self.assertEqual(m._canonical_purchase_source("ON-MARKET"), "ON_MARKET")
        self.assertEqual(m._canonical_purchase_source("bonus"), "BONUS")


class TestNormalizePurchaseTableDf(unittest.TestCase):
    def test_detail_row(self) -> None:
        df = pd.DataFrame(
            [
                {
                    "Scrip": "ADBL",
                    "Transaction Date": "2025-05-14",
                    "Transaction Quantity": 23,
                    "Rate": 285.1482,
                    "Purchase Source": "ON-MARKET",
                }
            ]
        )
        rows = m._normalize_purchase_table_df(df, "ADBL")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["Scrip"], "ADBL")
        self.assertEqual(rows[0]["Transaction Date"], "2025-05-14")
        self.assertEqual(rows[0]["Quantity"], "23")
        self.assertEqual(rows[0]["Rate"], "285.1482")
        self.assertEqual(rows[0]["Purchase Source"], "ON_MARKET")

    def test_wacc_columns_when_no_transaction_quantity(self) -> None:
        df = pd.DataFrame(
            [
                {
                    "Scrip": "ADBL",
                    "WACC Calculated Quantity": 20.0,
                    "WACC Rate": 429.0179,
                }
            ]
        )
        rows = m._normalize_purchase_table_df(df, "ADBL")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["Quantity"], "20")
        self.assertEqual(rows[0]["Rate"], "429.0179")
        self.assertEqual(rows[0]["Transaction Date"], "")
        self.assertEqual(rows[0]["Purchase Source"], "ON_MARKET")

    def test_skip_total_row(self) -> None:
        df = pd.DataFrame(
            [
                {
                    "Scrip": "X",
                    "Transaction Quantity": 1,
                    "Rate": 100,
                    "Purchase Source": "ON-MARKET",
                },
                {
                    "Scrip": "Total",
                    "Transaction Quantity": 999,
                    "Rate": 0,
                    "Purchase Source": "",
                },
            ]
        )
        rows = m._normalize_purchase_table_df(df, "X")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["Quantity"], "1")

    def test_empty_purchase_source_defaults(self) -> None:
        df = pd.DataFrame(
            [
                {
                    "Scrip": "Z",
                    "Transaction Date": "2024-01-01",
                    "Transaction Quantity": 5,
                    "Rate": 200,
                    "Purchase Source": "",
                }
            ]
        )
        rows = m._normalize_purchase_table_df(df, "Z")
        self.assertEqual(rows[0]["Purchase Source"], "ON_MARKET")


class TestPurchaseFillDates(unittest.TestCase):
    def test_single_match(self) -> None:
        purchase = [
            {
                "Scrip": "BFC",
                "Transaction Date": "",
                "Quantity": "30",
                "Rate": "100",
                "Purchase Source": "ON_MARKET",
            }
        ]
        txs = [
            {
                "Scrip": "BFC",
                "Transaction Date": "2026-02-26",
                "Credit Quantity": "30",
            }
        ]
        m._purchase_fill_dates_from_transactions(purchase, txs)
        self.assertEqual(purchase[0]["Transaction Date"], "2026-02-26")

    def test_multiple_matches_uses_oldest(self) -> None:
        purchase = [
            {
                "Scrip": "FOO",
                "Transaction Date": "",
                "Quantity": "10",
                "Rate": "1",
                "Purchase Source": "ON_MARKET",
            }
        ]
        txs = [
            {
                "Scrip": "FOO",
                "Transaction Date": "2025-12-01",
                "Credit Quantity": "10",
            },
            {
                "Scrip": "FOO",
                "Transaction Date": "2024-01-15",
                "Credit Quantity": "10",
            },
        ]
        m._purchase_fill_dates_from_transactions(purchase, txs)
        self.assertEqual(purchase[0]["Transaction Date"], "2024-01-15")

    def test_existing_date_unchanged(self) -> None:
        purchase = [
            {
                "Scrip": "FOO",
                "Transaction Date": "2020-01-01",
                "Quantity": "10",
                "Rate": "1",
                "Purchase Source": "ON_MARKET",
            }
        ]
        txs = [
            {
                "Scrip": "FOO",
                "Transaction Date": "2024-01-15",
                "Credit Quantity": "10",
            },
        ]
        m._purchase_fill_dates_from_transactions(purchase, txs)
        self.assertEqual(purchase[0]["Transaction Date"], "2020-01-01")


if __name__ == "__main__":
    unittest.main()

"""Score all orders and write predictions to shop.db."""

import sqlite3
from datetime import datetime

import joblib
import numpy as np
import pandas as pd

from config import MODEL_PATH, SHOP_DB, WAREHOUSE_DB
from utils_db import ensure_predictions_table, sqlite_conn


def main():
    with sqlite3.connect(WAREHOUSE_DB) as conn:
        df = pd.read_sql_query("SELECT * FROM modeling_orders_fraud", conn)

    print(f"Loaded {len(df)} rows from warehouse")

    # Reproduce the same feature engineering used during training
    df["order_datetime"] = pd.to_datetime(df["order_datetime"], errors="coerce")
    df["order_hour"] = df["order_datetime"].dt.hour
    df["order_dayofweek"] = df["order_datetime"].dt.dayofweek
    df["order_month"] = df["order_datetime"].dt.month

    df["zip_mismatch"] = (
        df["billing_zip"].astype(str) != df["shipping_zip"].astype(str)
    ).astype(int)
    df["is_international_ip"] = (df["ip_country"].fillna("US") != "US").astype(int)
    df["total_to_subtotal_ratio"] = df["order_total"] / df["order_subtotal"].replace(
        0, np.nan
    )
    df["tax_to_subtotal_ratio"] = df["tax_amount"] / df["order_subtotal"].replace(
        0, np.nan
    )
    df["shipping_to_subtotal_ratio"] = df["shipping_fee"] / df[
        "order_subtotal"
    ].replace(0, np.nan)

    order_ids = df["order_id"].values

    drop_cols = ["is_fraud", "order_id", "customer_id", "order_datetime", "promo_code"]
    X = df.drop(columns=[c for c in drop_cols if c in df.columns])

    for col in ["billing_zip", "shipping_zip"]:
        if col in X.columns:
            X[col] = X[col].astype(str)

    loaded = joblib.load(MODEL_PATH)

    if not loaded["uses_selector"]:
        proba = loaded["model"].predict_proba(X)[:, 1]
    else:
        Xt = loaded["prep"].transform(X)
        Xs = loaded["selector"].transform(Xt)
        proba = loaded["model"].predict_proba(Xs)[:, 1]

    predictions = pd.DataFrame(
        {
            "order_id": order_ids,
            "fraud_probability": np.round(proba, 6),
            "predicted_fraud": (proba >= 0.5).astype(int),
            "prediction_timestamp": datetime.utcnow().isoformat(),
        }
    )

    with sqlite_conn(SHOP_DB) as conn:
        ensure_predictions_table(conn)
        conn.execute("DELETE FROM order_predictions_fraud")
        predictions.to_sql(
            "order_predictions_fraud", conn, if_exists="append", index=False
        )

    print(
        f"Wrote {len(predictions)} predictions to {SHOP_DB} → order_predictions_fraud"
    )


if __name__ == "__main__":
    main()

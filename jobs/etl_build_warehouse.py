"""ETL: Build the modeling warehouse from shop.db."""

import sqlite3

import pandas as pd

from config import SHOP_DB, WAREHOUSE_DB


def main():
    WAREHOUSE_DB.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(SHOP_DB) as src:
        orders = pd.read_sql_query("SELECT * FROM orders", src)
        customers = pd.read_sql_query("SELECT * FROM customers", src)
        shipments = pd.read_sql_query("SELECT * FROM shipments", src)
        order_items = pd.read_sql_query("SELECT * FROM order_items", src)

    item_agg = (
        order_items.groupby("order_id")
        .agg(
            n_items=("quantity", "sum"),
            n_unique_products=("product_id", "nunique"),
            avg_unit_price=("unit_price", "mean"),
        )
        .reset_index()
    )

    shipment_agg = (
        shipments.groupby("order_id")
        .agg(
            n_shipments=("shipment_id", "count"),
            avg_ship_days=("actual_days", "mean"),
            any_late=("late_delivery", "max"),
        )
        .reset_index()
    )

    modeling_df = (
        orders.merge(item_agg, on="order_id", how="left")
        .merge(shipment_agg, on="order_id", how="left")
        .merge(customers, on="customer_id", how="left", suffixes=("", "_cust"))
    )

    with sqlite3.connect(WAREHOUSE_DB) as wh:
        modeling_df.to_sql(
            "modeling_orders_fraud", wh, if_exists="replace", index=False
        )

    print(f"ETL complete: {len(modeling_df)} rows → {WAREHOUSE_DB}")


if __name__ == "__main__":
    main()

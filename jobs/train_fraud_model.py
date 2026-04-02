"""Train the fraud detection model and save artifacts."""

import json
import sqlite3
import warnings
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_selection import SelectFromModel
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    average_precision_score,
    classification_report,
    roc_auc_score,
)
from sklearn.model_selection import (
    RandomizedSearchCV,
    StratifiedKFold,
    train_test_split,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from config import ARTIFACT_DIR, METADATA_PATH, METRICS_PATH, MODEL_PATH, WAREHOUSE_DB

warnings.filterwarnings("ignore")


def main():
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(WAREHOUSE_DB) as conn:
        df = pd.read_sql_query("SELECT * FROM modeling_orders_fraud", conn)

    print(f"Loaded {len(df)} rows from warehouse")

    # ---- Date features ----
    df["order_datetime"] = pd.to_datetime(df["order_datetime"], errors="coerce")
    df["order_hour"] = df["order_datetime"].dt.hour
    df["order_dayofweek"] = df["order_datetime"].dt.dayofweek
    df["order_month"] = df["order_datetime"].dt.month

    # ---- Engineered features ----
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

    target_col = "is_fraud"
    drop_cols = ["is_fraud", "order_id", "customer_id", "order_datetime", "promo_code"]
    X = df.drop(columns=[c for c in drop_cols if c in df.columns])
    y = df[target_col].astype(int)

    for col in ["billing_zip", "shipping_zip"]:
        if col in X.columns:
            X[col] = X[col].astype(str)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    numeric_features = X_train.select_dtypes(include=np.number).columns.tolist()
    categorical_features = [c for c in X_train.columns if c not in numeric_features]

    preprocessor = ColumnTransformer(
        [
            (
                "num",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric_features,
            ),
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical_features,
            ),
        ]
    )

    base_rf = Pipeline(
        [
            ("prep", preprocessor),
            (
                "model",
                RandomForestClassifier(
                    random_state=42,
                    class_weight="balanced_subsample",
                    n_jobs=1,
                ),
            ),
        ]
    )

    param_dist = {
        "model__n_estimators": [200, 300, 500],
        "model__max_depth": [None, 8, 12, 16],
        "model__min_samples_split": [2, 5, 10],
        "model__min_samples_leaf": [1, 2, 4],
        "model__max_features": ["sqrt", "log2", None],
    }

    search = RandomizedSearchCV(
        estimator=base_rf,
        param_distributions=param_dist,
        n_iter=20,
        scoring="roc_auc",
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
        n_jobs=1,
        random_state=42,
        verbose=1,
    )
    search.fit(X_train, y_train)
    best_model = search.best_estimator_

    print(f"Best CV ROC-AUC: {search.best_score_:.4f}")

    # Feature selection
    prep_fitted = best_model.named_steps["prep"]
    rf_fitted = best_model.named_steps["model"]
    X_train_trans = prep_fitted.transform(X_train)
    X_test_trans = prep_fitted.transform(X_test)

    selector = SelectFromModel(rf_fitted, threshold="median", prefit=True)
    X_train_sel = selector.transform(X_train_trans)
    X_test_sel = selector.transform(X_test_trans)

    rf_selected = RandomForestClassifier(
        random_state=42,
        class_weight="balanced_subsample",
        n_jobs=1,
        **{k.replace("model__", ""): v for k, v in search.best_params_.items()},
    )
    rf_selected.fit(X_train_sel, y_train)

    proba_best = best_model.predict_proba(X_test)[:, 1]
    pred_best = (proba_best >= 0.5).astype(int)

    proba_sel = rf_selected.predict_proba(X_test_sel)[:, 1]
    use_selected = average_precision_score(
        y_test, proba_sel
    ) > average_precision_score(y_test, proba_best)

    if use_selected:
        artifact = {
            "version": "selected_tuned_rf",
            "prep": prep_fitted,
            "selector": selector,
            "model": rf_selected,
            "uses_selector": True,
        }
        version = "selected_tuned_rf"
    else:
        artifact = {
            "version": "full_tuned_rf",
            "model": best_model,
            "uses_selector": False,
        }
        version = "full_tuned_rf"

    joblib.dump(artifact, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}")

    # ---- Metrics ----
    metrics = {
        "roc_auc": round(roc_auc_score(y_test, proba_best), 4),
        "pr_auc": round(average_precision_score(y_test, proba_best), 4),
        "classification_report": classification_report(
            y_test, pred_best, output_dict=True
        ),
    }
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"Saved metrics to {METRICS_PATH}")

    # ---- Metadata ----
    metadata = {
        "model_version": version,
        "timestamp": datetime.utcnow().isoformat(),
        "features": numeric_features + categorical_features,
        "n_train": len(X_train),
        "n_test": len(X_test),
        "warehouse_table": "modeling_orders_fraud",
        "target": target_col,
    }
    with open(METADATA_PATH, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved metadata to {METADATA_PATH}")


if __name__ == "__main__":
    main()
